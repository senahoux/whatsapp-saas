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
    ConversationState,
} from "@/lib/types";
import { ProviderInst } from "@/providers/uazapi.provider";

/**
 * POST /api/process-conversation
 *
 * Orquestrador principal do pipeline de IA.
 * Chamado pelo DebounceManager após silêncio do paciente.
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

        // ── 2. Busca conversa ──────────────────────────────────────────
        const conversation = await ConversationService.findById(clinicId, conversationId);
        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found" },
                { status: 404 },
            );
        }

        // ── 3. Guarda contra reentrada ─────────────────────────────────
        if (conversation.status !== ConversationStatus.AGUARDANDO_IA) {
            return NextResponse.json({
                ok: true,
                skipped: `status_is_${conversation.status} `,
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
            return NextResponse.json({ error: "Clinic context unavailable" }, { status: 500 });
        }

        const historyMessages = await MessageService.buildHistoryForAI(
            clinicId,
            conversationId,
            10,
        );
        const historico_resumido = AIService.buildHistorySummary(historyMessages);

        // Última mensagem do paciente
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

        // --- DETECTOR DE INTENÇÃO EXPANDIDO (PRECISÃO CIRÚRGICA) ---
        const userIntentRegex = /agendar|marcar|consulta|horário|vaga|disponível|atende|passar|marcará|marcação|médico|dr|doutor|agenda|outro dia|pode ser outro|quinta|sexta|segunda|terça|quarta|sábado|domingo|de manhã|à tarde|a noite/i;

        const looksLikeScheduleIntent = userIntentRegex.test(lastClientMessage.content);

        // --- LÓGICA DE ESTADO PERSISTENTE ---
        const isScheduling = (conversation as any).state === ConversationState.SCHEDULING || looksLikeScheduleIntent;

        const aiCtx: any = {
            mensagem_paciente: lastClientMessage.content,
            nome_paciente: contact.name,
            historico_resumido,
            status_conversa: conversation.status,
            contexto_clinica: clinicContext,
            contexto_agenda: null as any,
            ultimas_ofertas: (conversation as any).lastOfferedSlots || [],
        };

        // Se estiver em modo agendamento, SEMPRE injeta slots
        if (isScheduling) {
            aiCtx.contexto_agenda = await AppointmentService.getAvailableSlots(clinicId);

            // Atualiza estado e PERISTE slots ofertados
            await ConversationService.setLastOfferedSlots(clinicId, conversationId, aiCtx.contexto_agenda.horarios_disponiveis);
            aiCtx.ultimas_ofertas = aiCtx.contexto_agenda.horarios_disponiveis;

            if ((conversation as any).state !== ConversationState.SCHEDULING) {
                await ConversationService.setState(clinicId, conversationId, ConversationState.SCHEDULING);
            }

            console.log(">>> [SLOTS] Enviando para IA:", JSON.stringify(aiCtx.contexto_agenda));

            await LogService.info(clinicId, LogEvent.AI_RESPONSE, {
                conversationId,
                note: "Scheduling state active: slots injected and persisted",
                slots: aiCtx.contexto_agenda.horarios_disponiveis
            });
        }

        // ── 6. Chamada à IA ────────────────────────────────────────────
        let aiResponse = await AIService.respond(aiCtx);

        // Loop VER_AGENDA (máximo 1 iteração)
        if (aiResponse?.acao === "VER_AGENDA") {
            const agendaContext = await AppointmentService.getAvailableSlots(
                clinicId,
                aiResponse.data ?? undefined,
            );
            aiCtx.contexto_agenda = agendaContext;

            // Persiste as novas opções
            await ConversationService.setLastOfferedSlots(clinicId, conversationId, agendaContext.horarios_disponiveis);
            aiCtx.ultimas_ofertas = agendaContext.horarios_disponiveis;

            console.log(">>> [SLOTS] (Loop VER_AGENDA) Enviando para IA:", JSON.stringify(aiCtx.contexto_agenda));
            aiResponse = await AIService.respond(aiCtx);
            if (aiResponse?.acao === "VER_AGENDA") aiResponse.acao = "NENHUMA";
        }

        if (!aiResponse) {
            await NotificationService.notifyAlert(clinicId, `Falha na IA para a conversa ${conversationId}.`, contact.id);
            await ConversationService.setStatus(clinicId, conversationId, ConversationStatus.ERRO);
            return NextResponse.json({ ok: false, error: "AI_FAILED" });
        }

        // ── 7. Execução de Ações de Agenda ──────────────────────────────
        if (["AGENDAR", "REMARCAR", "CANCELAR"].includes(aiResponse.acao)) {
            try {
                if (aiResponse.acao === "AGENDAR") {
                    if (!aiResponse.data || !aiResponse.hora) {
                        throw new Error("Data ou hora ausentes para AGENDAR");
                    }

                    // Validação DETERMINÍSTICA: deve bater com um dos slots ofertados
                    const lastOffered = (conversation as any).lastOfferedSlots as string[] || [];
                    const selectedSlot = `${aiResponse.data} ${aiResponse.hora}`;

                    if (lastOffered.length > 0 && !lastOffered.includes(selectedSlot)) {
                        await LogService.warn(clinicId, LogEvent.AI_RESPONSE, {
                            conversationId,
                            note: `Slot ${selectedSlot} não estava entre as opções ofertadas: ${lastOffered.join(", ")}. Prosseguindo mesmo assim.`,
                        });
                        // Decidimos não lançar Erro para não matar a conversa
                    }

                    await AppointmentService.create(clinicId, {
                        contactId: contact.id,
                        date: aiResponse.data,
                        time: aiResponse.hora,
                        type: aiResponse.tipo ?? "CONSULTA",
                        subtype: aiResponse.subtipo ?? null,
                        source: AppointmentSource.ROBO,
                        notes: `Agendado automaticamente via IA(${aiResponse.confianca})`
                    });
                    // Reset para IDLE após sucesso
                    await ConversationService.setState(clinicId, conversationId, ConversationState.IDLE);
                } else {
                    const targetAppt = await AppointmentService.findActiveAppointment(clinicId, contact.id);
                    if (!targetAppt) throw new Error(`Nenhum agendamento ativo encontrado para ${aiResponse.acao} `);

                    if (aiResponse.acao === "REMARCAR") {
                        if (!aiResponse.data || !aiResponse.hora) throw new Error("Data ou hora ausentes para REMARCAR");
                        await AppointmentService.reschedule(clinicId, targetAppt.id, {
                            date: aiResponse.data,
                            time: aiResponse.hora,
                            notes: `Remarcado via IA.`
                        });
                    } else {
                        await AppointmentService.cancel(clinicId, targetAppt.id, "Cancelado via IA");
                    }
                    // Reset para IDLE após sucesso
                    await ConversationService.setState(clinicId, conversationId, ConversationState.IDLE);
                }

                await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
                    conversationId,
                    action: aiResponse.acao,
                    data: aiResponse.data,
                    hora: aiResponse.hora
                });
            } catch (error: any) {
                const isMissingData = error.message?.includes("Data ou hora ausentes");

                // --- REGRA: O backend NÃO interfere no texto da conversa ---
                if (!isMissingData) {
                    aiResponse.modo = ConversationMode.ASSISTENTE;
                    await NotificationService.notifyAlert(clinicId, `Erro ao ${aiResponse.acao}: ${error.message} `, contact.id);
                }

                await LogService.warn(clinicId, LogEvent.ERROR, {
                    conversationId,
                    note: `Ação ${aiResponse.acao} falhou: ${error.message} `,
                });
            }
        }

        // ── 8. Side-effects ──────────────────────────────────────────────
        if (aiResponse.nome_identificado) {
            await ContactService.saveName(clinicId, contact.id, aiResponse.nome_identificado);
        }
        if (aiResponse.lead === "QUENTE" && !contact.isHotLead) {
            await ContactService.setHotLead(clinicId, contact.id, true);
            await NotificationService.notifyHotLead(clinicId, contact.id, contact.name);
        }

        // ── 9. Despacho ──────────────────────────────────────────────────
        if (aiResponse.modo === ConversationMode.HUMANO_URGENTE) {
            await ConversationService.markHumanIntervention(clinicId, conversationId);
            await ConversationService.setState(clinicId, conversationId, ConversationState.IDLE); // Reset ao sair do robô
            await NotificationService.notifyHumanUrgent(clinicId, contact.id, lastClientMessage.content);
            return NextResponse.json({ ok: true, action: "HUMANO_URGENTE" });
        }

        if (aiResponse.modo === ConversationMode.ASSISTENTE) {
            const msg = await MessageService.enqueueRobotReply(clinicId, conversationId, aiResponse.mensagem);
            await MessageService.markProcessed(clinicId, msg.id);
            await ConversationService.setLastProcessedMessage(clinicId, conversationId, lastClientMessage.id);
            await NotificationService.notifyAIReview(clinicId, contact.id, aiResponse.mensagem);
            return NextResponse.json({ ok: true, action: "ASSISTENTE" });
        }

        // MODO AUTO
        const robotMsg = await MessageService.enqueueRobotReply(clinicId, conversationId, aiResponse.mensagem);
        await ConversationService.setLastProcessedMessage(clinicId, conversationId, lastClientMessage.id);
        const sent = await ProviderInst.sendMessage(clinicId, contact.phoneNumber, aiResponse.mensagem);
        if (sent) await MessageService.markProcessed(clinicId, robotMsg.id);

        return NextResponse.json({ ok: true, action: "AUTO", messageId: robotMsg.id });

    } catch (error) {
        if (clinicId && conversationId) {
            await LogService.error(clinicId, LogEvent.ERROR, { endpoint: "process-conversation", error: String(error) });
            await ConversationService.markError(clinicId, conversationId).catch(() => { });
        }
        console.error("[process-conversation] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
