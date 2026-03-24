import { NextRequest, NextResponse } from "next/server";
import { ConversationService, MessageService, ContactService } from "@/services";
import { ClinicService } from "@/services/clinic.service";
import { LogService } from "@/services/log.service";
import { AIService } from "@/services/ai.service";
import { AppointmentService } from "@/services/appointment.service";
import { NotificationService } from "@/services/notification.service";
import {
    ConversationStatus,
    LogEvent,
    MessageAuthor,
    ConversationMode,
    AppointmentSource,
} from "@/lib/types";
import { ProviderInst } from "@/providers/uazapi.provider";

/**
 * POST /api/process-conversation
 *
 * Orquestrador principal do pipeline de IA.
 * Chamado pelo DebounceManager após silêncio do paciente.
 *
 * Fluxo:
 *   1. Valida clinicId e conversa
 *   2. Guarda contra processamento duplicado (status != AGUARDANDO_IA)
 *   3. Monta contexto: histórico + clínica + contato
 *   4. Chama IA (AIService.respond)
 *   5. Se acao=VER_AGENDA → consulta slots → chama IA novamente (1 loop máx.)
 *   6. Processa resposta:
 *      - AUTO       → enfileira mensagem do robô + status → NORMAL
 *      - ASSISTENTE → enfileira mensagem + cria notificação de revisão
 *      - HUMANO_URGENTE → NÃO envia + marca HUMANO + cria notificação urgente
 *   7. Processa side-effects: lead, nome, notificar_admin
 *   8. Em caso de falha da IA → ASSISTENTE com fallback ou ERRO
 *
 * REGRAS:
 * - Toda lógica de negócio via services — sem acesso direto ao banco
 * - A IA nunca recebe clinicId
 * - Conversas em ERRO são recuperadas ao criar nova conversa (via webhook)
 */

interface ProcessConversationBody {
    clinicId: string;
    conversationId: string;
}

export async function POST(req: NextRequest) {
    let clinicId = "";
    let conversationId = "";

    try {
        const body: ProcessConversationBody = await req.json();
        clinicId = body.clinicId;
        conversationId = body.conversationId;

        if (!clinicId || !conversationId) {
            return NextResponse.json(
                { error: "Missing clinicId or conversationId" },
                { status: 400 },
            );
        }

        // ── 1. Valida clinicId ─────────────────────────────────────────
        const isValid = await ClinicService.validateClinicId(clinicId);
        if (!isValid) {
            return NextResponse.json({ error: "clinicId not found" }, { status: 404 });
        }

        // ── 2. Busca conversa (com validação de clinicId) ──────────────
        const conversation = await ConversationService.findById(clinicId, conversationId);
        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found" },
                { status: 404 },
            );
        }

        // ── 3. Guarda contra reentrada ─────────────────────────────────
        //       Só processa se AGUARDANDO_IA — qualquer outro status é skip seguro.
        //       HUMANO → robô pausado. NORMAL → já processado. ERRO → não reprocessar.
        if (conversation.status !== ConversationStatus.AGUARDANDO_IA) {
            return NextResponse.json({
                ok: true,
                skipped: `status_is_${conversation.status}`,
            });
        }

        // ── 4. Busca contato ────────────────────────────────────────────
        const contact = await ContactService.findById(clinicId, conversation.contactId);
        if (!contact) {
            await ConversationService.markError(clinicId, conversationId);
            return NextResponse.json({ error: "Contact not found" }, { status: 500 });
        }

        // ── 5. Monta contexto para a IA ────────────────────────────────
        const clinicContext = await ClinicService.buildContextForAI(clinicId);
        if (!clinicContext) {
            await ConversationService.markError(clinicId, conversationId);
            await LogService.error(clinicId, LogEvent.ERROR, {
                note: "ClinicContext not found",
                conversationId,
            });
            return NextResponse.json({ error: "Clinic context unavailable" }, { status: 500 });
        }

        const historyMessages = await MessageService.buildHistoryForAI(
            clinicId,
            conversationId,
            10, // últimas 10 trocas
        );
        const historico_resumido = AIService.buildHistorySummary(historyMessages);

        // Última mensagem do paciente (a que disparou o debounce)
        const allMessages = await MessageService.listByConversation(
            clinicId,
            conversationId,
            { limit: 50 },
        );
        const lastClientMessage = [...allMessages]
            .reverse()
            .find((m) => m.author === MessageAuthor.CLIENTE);

        if (!lastClientMessage) {
            return NextResponse.json({ ok: true, skipped: "no_client_message" });
        }

        const aiCtx = {
            mensagem_paciente: lastClientMessage.content,
            nome_paciente: contact.name,
            historico_resumido,
            status_conversa: conversation.status,
            contexto_clinica: clinicContext,
            contexto_agenda: null as null | Awaited<ReturnType<typeof AppointmentService.getAvailableSlots>>,
        };

        // ── 6. Primeira chamada à IA ────────────────────────────────────
        let aiResponse = await AIService.respond(aiCtx);

        await LogService.info(clinicId, LogEvent.AI_RESPONSE, {
            conversationId,
            acao: aiResponse?.acao,
            modo: aiResponse?.modo,
            confianca: aiResponse?.confianca,
        });

        // ── 7. Loop VER_AGENDA (máximo 1 iteração) ──────────────────────
        //       Se a IA pediu para ver agenda, buscamos os slots e chamamos novamente.
        if (aiResponse?.acao === "VER_AGENDA") {
            const agendaContext = await AppointmentService.getAvailableSlots(
                clinicId,
                aiResponse.data ?? undefined,
            );

            aiCtx.contexto_agenda = agendaContext;

            await LogService.info(clinicId, LogEvent.AI_RESPONSE, {
                conversationId,
                note: "VER_AGENDA loop — calling AI with slots",
                slots: agendaContext.horarios_disponiveis,
            });

            // Segunda chamada — proibida outra VER_AGENDA (prevenção de loop infinito)
            aiResponse = await AIService.respond(aiCtx);

            if (aiResponse?.acao === "VER_AGENDA") {
                // IA insistiu novamente — ignoramos a acion e continuamos com a resposta
                aiResponse.acao = "NENHUMA";
            }
        }

        // ── 8. Fallback se IA falhou completamente ──────────────────────
        if (!aiResponse) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                conversationId,
                note: "AIService returned null — falling back to ASSISTENTE mode",
            });

            // Não bloqueia o paciente — notifica admin para revisão manual
            await NotificationService.notifyAlert(
                clinicId,
                `Falha na IA para a conversa ${conversationId}. Revisão manual necessária.`,
                contact.id,
            );

            await ConversationService.setStatus(
                clinicId,
                conversationId,
                ConversationStatus.ERRO,
            );

            return NextResponse.json({ ok: false, error: "AI_FAILED", fallback: "ERRO" });
        }

        // ── 9. Execução de Ações de Agenda (Escrita) ────────────────────
        //      Se a IA retornou uma ação de escrita, tentamos executar no banco.
        //      Qualquer falha (conflito de horário, erro de banco) → Fallback ASSISTENTE.

        if (["AGENDAR", "REMARCAR", "CANCELAR"].includes(aiResponse.acao)) {
            try {
                if (aiResponse.acao === "AGENDAR") {
                    if (!aiResponse.data || !aiResponse.hora) {
                        throw new Error("Data ou hora ausentes para AGENDAR");
                    }
                    await AppointmentService.create(clinicId, {
                        contactId: contact.id,
                        date: aiResponse.data,
                        time: aiResponse.hora,
                        type: aiResponse.tipo ?? "CONSULTA",
                        subtype: aiResponse.subtipo ?? null,
                        source: AppointmentSource.ROBO,
                        notes: `Agendado automaticamente via IA (${aiResponse.confianca})`
                    });
                }

                if (aiResponse.acao === "REMARCAR" || aiResponse.acao === "CANCELAR") {
                    // Centralizado: Busca o agendamento ativo (AGENDADO/REMARCADO)
                    const targetAppt = await AppointmentService.findActiveAppointment(clinicId, contact.id);

                    if (!targetAppt) {
                        throw new Error(`Nenhum agendamento ativo encontrado para ${aiResponse.acao}`);
                    }

                    if (aiResponse.acao === "REMARCAR") {
                        if (!aiResponse.data || !aiResponse.hora) {
                            throw new Error("Data ou hora ausentes para REMARCAR");
                        }
                        await AppointmentService.reschedule(clinicId, targetAppt.id, {
                            date: aiResponse.data,
                            time: aiResponse.hora,
                            notes: `Remarcado via IA. Original: ${targetAppt.date} ${targetAppt.time}`
                        });
                    } else {
                        await AppointmentService.cancel(clinicId, targetAppt.id, "Cancelado via IA a pedido do paciente");
                    }
                }

                await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
                    conversationId,
                    action: aiResponse.acao,
                    data: aiResponse.data,
                    hora: aiResponse.hora
                });

            } catch (error: any) {
                console.warn(`[Agenda Action Error] ${aiResponse.acao} falhou:`, error.message);

                // Notificar admin mas NÃO bloquear a resposta da IA se o modo original era AUTO.
                // Isso permite que o robô peça a data/hora faltante ao paciente.
                if (aiResponse.modo !== ConversationMode.AUTO) {
                    aiResponse.modo = ConversationMode.ASSISTENTE;
                }

                await NotificationService.notifyAlert(
                    clinicId,
                    `Falha ao ${aiResponse.acao}: ${error.message}. Revisão manual necessária.`,
                    contact.id
                );

                await LogService.warn(clinicId, LogEvent.ERROR, {
                    conversationId,
                    note: `Falha na ação ${aiResponse.acao}. Mantendo resposta mas disparando alerta.`,
                    error: error.message
                });
            }
        }

        // ── 10. Side-effects da resposta ─────────────────────────────────

        // 9a. Nome identificado → salva no contato
        if (aiResponse.nome_identificado) {
            await ContactService.saveName(clinicId, contact.id, aiResponse.nome_identificado);
        }

        // 9b. Lead quente → marca no contato + notifica admin
        if (aiResponse.lead === "QUENTE" && !contact.isHotLead) {
            await ContactService.setHotLead(clinicId, contact.id, true);
            await NotificationService.notifyHotLead(clinicId, contact.id, contact.name);
        }

        // 9c. notificar_admin genérico (sem ser hot lead ou urgência)
        if (aiResponse.notificar_admin && aiResponse.modo !== "HUMANO_URGENTE") {
            await NotificationService.notifyAlert(
                clinicId,
                `Atenção solicitada na conversa com ${contact.name ?? contact.phoneNumber}`,
                contact.id,
            );
        }

        // ── 10. Despacho por modo ───────────────────────────────────────

        if (aiResponse.modo === ConversationMode.HUMANO_URGENTE) {
            // Não envia mensagem automática — pausa e alerta o humano
            await ConversationService.markHumanIntervention(clinicId, conversationId);
            await NotificationService.notifyHumanUrgent(
                clinicId,
                contact.id,
                lastClientMessage.content,
            );
            await LogService.info(clinicId, LogEvent.HUMAN_INTERVENTION, {
                conversationId,
                motivo: "HUMANO_URGENTE retornado pela IA",
            });
            return NextResponse.json({ ok: true, action: "HUMANO_URGENTE" });
        }

        if (aiResponse.modo === ConversationMode.ASSISTENTE) {
            // Enfileira mensagem mas exige revisão — não envia automaticamente
            const msg = await MessageService.enqueueRobotReply(
                clinicId,
                conversationId,
                aiResponse.mensagem,
            );
            // Marca mensagem como já processada (não sai para o robô automaticamente)
            await MessageService.markProcessed(clinicId, msg.id);
            // Status volta a NORMAL — aguarda ação humana pelo painel (Passo 6)
            await ConversationService.setLastProcessedMessage(
                clinicId,
                conversationId,
                lastClientMessage.id,
            );
            await NotificationService.notifyAIReview(
                clinicId,
                contact.id,
                aiResponse.mensagem,
            );
            await LogService.info(clinicId, LogEvent.AI_RESPONSE, {
                conversationId,
                mode: "ASSISTENTE",
                messageId: msg.id,
            });
            return NextResponse.json({ ok: true, action: "ASSISTENTE", messageId: msg.id });
        }

        // modo AUTO → enfileira para histórico
        const msg = await MessageService.enqueueRobotReply(
            clinicId,
            conversationId,
            aiResponse.mensagem,
        );

        await ConversationService.setLastProcessedMessage(
            clinicId,
            conversationId,
            lastClientMessage.id,
        );

        // --- DISPARO IMEDIATO VIA PROVIDER (SaaS API) ---
        const sent = await ProviderInst.sendMessage(
            clinicId,
            contact.phoneNumber,
            aiResponse.mensagem
        );

        if (sent) {
            await MessageService.markProcessed(clinicId, msg.id);
            await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
                conversationId,
                action: "AUTO_REPLY_SENT",
                messageId: msg.id,
                acao: aiResponse.acao,
            });
        } else {
            await LogService.warn(clinicId, LogEvent.ERROR, {
                note: "Falha ao despachar mensagem via Provider API. Permanecerá na fila de retry do banco.",
                messageId: msg.id
            });
        }

        return NextResponse.json({
            ok: true,
            action: "AUTO",
            messageId: msg.id,
        });
    } catch (error) {
        if (clinicId) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                endpoint: "POST /api/process-conversation",
                conversationId,
                error: String(error),
            }).catch(() => { });

            // Marca conversa como ERRO para não ficar presa em AGUARDANDO_IA
            if (conversationId) {
                await ConversationService.markError(clinicId, conversationId).catch(() => { });
            }
        }
        console.error("[process-conversation] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
