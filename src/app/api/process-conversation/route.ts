import { NextRequest, NextResponse } from "next/server";
import { 
    ConversationService, 
    MessageService, 
    ContactService, 
    IntentionService,
    ClinicService,
    LogService,
    AIService,
    AppointmentService,
    NotificationService
} from "@/services";
import {
    ConversationStatus,
    LogEvent,
    MessageAuthor,
    ConversationMode,
    AppointmentSource,
    ConversationState,
    Intention,
} from "@/lib/types";
import { ProviderInst } from "@/providers/uazapi.provider";

// ── Helpers ───────────────────────────────────────────────────
function getClinicCurrentDate(timeZone: string = 'America/Sao_Paulo'): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

/**
 * POST /api/process-conversation
 * Orquestrador do pipeline de IA — arquitetura limpa.
 * 
 * Princípios:
 * 1. A IA conduz a conversa.
 * 2. O backend fornece disponibilidade real (AgendaSnapshot).
 * 3. Nunca "aprisiona" a IA em ofertas anteriores.
 * 4. Filtro temporal do paciente persiste até mudança explícita.
 */
export async function POST(req: NextRequest) {
    let clinicId = "";
    let conversationId = "";
    let messageAlreadySent = false;

    try {
        const body = await req.json();
        clinicId = body.clinicId;
        conversationId = body.conversationId;

        if (!clinicId || !conversationId) {
            return NextResponse.json({ error: "Missing params" }, { status: 400 });
        }

        // ── 1. Guardas ──────────────────────────────────────────────
        const settings = await ClinicService.getSettings(clinicId);
        if (!settings?.robotEnabled) {
            return NextResponse.json({ ok: true, skipped: "robot_disabled" });
        }

        const clinic = await ClinicService.findById(clinicId);
        if (!clinic) return NextResponse.json({ error: "clinic not found" }, { status: 404 });

        const timezone = clinic.timezone || "America/Sao_Paulo";
        const data_referencia = getClinicCurrentDate(timezone);

        let conversation = await ConversationService.findById(clinicId, conversationId);
        if (!conversation || conversation.status !== ConversationStatus.AGUARDANDO_IA) {
            return NextResponse.json({ ok: true, skipped: "invalid_status" });
        }

        const contact = await ContactService.findById(clinicId, conversation.contactId);
        if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 500 });

        // ── 2. Mensagem Atual ───────────────────────────────────────
        const lastClientMessage = await MessageService.getLastClientMessage(clinicId, conversationId);
        if (!lastClientMessage) {
            await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, {
                conversationId, skipped: "no_client_message"
            });
            return NextResponse.json({ ok: true, skipped: "no_client_message" });
        }

        // ── 3. Classificação de Intenção ────────────────────────────
        const lastSlots = (conversation as any).lastOfferedSlots as string[] || [];
        const intention = IntentionService.classify(lastClientMessage.content, conversation, lastSlots);

        // ── 4. Estado Temporal Atual ────────────────────────
        let focoTemporalStr = (conversation as any).activeSchedulingFilter as string | null;

        await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, {
            conversationId, intention, focoTemporalStr
        });

        // ── 5. Contexto da IA ───────────────────────────────────────
        const clinicContext = await ClinicService.buildContextForAI(clinicId);
        const historyMessages = await MessageService.buildHistoryForAI(clinicId, conversationId, 10);
        const historico_resumido = AIService.buildHistorySummary(historyMessages);
        const tabela_temporal = AIService.getDateReferences(timezone);

        const aiCtx: any = {
            mensagem_paciente: lastClientMessage.content,
            nome_paciente: contact.name,
            historico_resumido,
            status_conversa: conversation.status,
            contexto_clinica: clinicContext,
            agenda_snapshot: null,      // Iniciamos sem agenda. 
            data_referencia,
            timezone,
            tabela_temporal
        };

        // ── 6. Entrega Proativa de Agenda (Visão de Águia) ───────────
        // Se a intenção é agendar, já mandamos o resumo mensal no Loop 1
        const isSchedulingIntent = ([
            Intention.SOFT_SCHEDULING_INTEREST,
            Intention.HARD_SCHEDULING_INTENT,
            Intention.SLOT_CONFIRMATION,
            Intention.CHANGE_DATE_INTENT
        ] as Intention[]).includes(intention);

        if (isSchedulingIntent) {
            aiCtx.agenda_snapshot = await AppointmentService.getAgendaSnapshot(
                clinicId,
                focoTemporalStr || undefined,
                focoTemporalStr,
                0 // maxSlots: 0 (Apenas resumo na abertura)
            );
        }

        // ── 7. Chamada à IA ─────────────────────────────────────────
        let aiResponse = await AIService.respond(aiCtx);
        if (!aiResponse) {
            // Em caso de falha da OpenAI, logamos e não alteramos estado para não corromper sessão
            await LogService.error(clinicId, LogEvent.ERROR, { note: "Falha de comunicação com OpenAI. Estado preservado." });
            return NextResponse.json({ ok: false, error: "AI_FAILED_PRESERVED" });
        }

        // ── 7. Loop Especial: A IA pediu a agenda para pensar ────────
        if (aiResponse.acao_backend === "VER_AGENDA") {
            const dataFocal = aiResponse.referencia_temporal_resolvida || focoTemporalStr || undefined;
            const periodoFocal = aiResponse.preferencia_periodo;
            
            const snapshot = await AppointmentService.getAgendaSnapshot(
                clinicId,
                dataFocal,
                aiResponse.referencia_temporal_bruta,
                15 // maxSlots: 15 (Traz detalhes no afunilamento)
            );
            
            // Refinamento de snapshot via preferência da IA
            if (periodoFocal && periodoFocal !== "dia_todo" && snapshot.availableSlots) {
                snapshot.availableSlots = snapshot.availableSlots.filter(s => s.period === periodoFocal);
            }

            aiCtx.agenda_snapshot = snapshot;
            
            // Se gerou um foco atualizado, persistimos para manter na memória inter-rodadas
            if (dataFocal && dataFocal !== focoTemporalStr) {
                await ConversationService.setActiveSchedulingFilter(clinicId, conversationId, dataFocal);
            }

            // A IA pensa de novo (agora com o snapshot na mão)
            aiResponse = await AIService.respond(aiCtx);
            if (!aiResponse) {
                await LogService.error(clinicId, LogEvent.ERROR, { note: "Falha no Loop 2 da OpenAI. Estado preservado." });
                return NextResponse.json({ ok: false, error: "AI_FAILED_2_PRESERVED" });
            }
            
            // Capturamos os slots REAIS que ela decidiu enviar nesta segunda pernada
            if (aiCtx.agenda_snapshot && aiCtx.agenda_snapshot.availableSlots) {
                const flatSlots = aiCtx.agenda_snapshot.availableSlots.map((s: any) => `${s.date} ${s.time}`);
                await ConversationService.setLastOfferedSlots(clinicId, conversationId, flatSlots);
            }
        }

        // ── 8. Execução de Ações Finais ──────────────────────────────
        const currentAcao = aiResponse.acao_backend as string;

        if (currentAcao === "AGENDAR") {
            try {
                if (!aiResponse.slot_escolhido || !aiResponse.slot_escolhido.data || !aiResponse.slot_escolhido.hora) {
                    throw new Error("Missing slot data");
                }

                const chosenDate = aiResponse.slot_escolhido.data;
                const chosenTime = aiResponse.slot_escolhido.hora;
                const chosenFlat = `${chosenDate} ${chosenTime}`;
                
                // RECONCILIAÇÃO ANTI-FANTASMA (Validação Orgânica Recente)
                if (!lastSlots.includes(chosenFlat) && !aiCtx.agenda_snapshot?.availableSlots?.find((s:any) => s.date === chosenDate && s.time === chosenTime)) {
                     // Devolve o problema para o Cérebro resolver
                     aiCtx.historico_resumido += `\n[SISTEMA]: O agendamento falhou pois o horário (${chosenFlat}) não existe na lista. Comunique de forma gentil que houve um descompasso temporal e siga a agenda.`;
                     aiResponse = await AIService.respond(aiCtx);
                     if (!aiResponse) {
                        await LogService.error(clinicId, LogEvent.ERROR, { note: "Falha da IA ao contornar slot fantasma."});
                        return NextResponse.json({ ok: false, error: "AI_ERROR_LOOP" });
                     }
                } else {
                    const isDup = await AppointmentService.isDuplicate(clinicId, contact.id, chosenDate, chosenTime);
                    if (isDup) {
                        aiCtx.historico_resumido += `\n[SISTEMA]: O agendamento falhou. O paciente já tem horário marcado nesta exata data (${chosenFlat}). Avise-o que já consta no sistema.`;
                        aiResponse = await AIService.respond(aiCtx);
                        if (!aiResponse) {
                            await LogService.error(clinicId, LogEvent.ERROR, { note: "Falha da IA ao contornar slot duplicado."});
                            return NextResponse.json({ ok: false, error: "AI_ERROR_LOOP" });
                        }
                    } else {
                        let finalAppt = await AppointmentService.create(clinicId, {
                            contactId: contact.id,
                            date: chosenDate,
                            time: chosenTime,
                            source: AppointmentSource.ROBO,
                            notes: "Agendado via IA",
                        });

                        if (finalAppt) {
                            // Log explícito de agendamento criado (Ponto 3)
                            await LogService.info(clinicId, LogEvent.APPOINTMENT_CREATED, {
                                appointmentId: finalAppt.id,
                                conversationId,
                                contactId: contact.id,
                                date: chosenDate,
                                time: chosenTime,
                                source: AppointmentSource.ROBO,
                                clinicId
                            });

                            // Backend envia a mensagem de confirmação da IA (Ponto 1)
                            const sent = await ProviderInst.sendMessage(clinicId, contact.phoneNumber, aiResponse.mensagem);
                            if (sent) {
                                messageAlreadySent = true;
                                await AppointmentService.updateNotificationStatus(finalAppt.id, "SENT");
                            }

                            // Reset completo após agendamento do lado do BD
                            await ConversationService.clearSchedulingState(clinicId, conversationId);
                        }
                    }
                }
            } catch (err: any) {
                await LogService.error(clinicId, LogEvent.ERROR, { note: `Ação ${currentAcao} falhou`, error: err.message });
                return NextResponse.json({ ok: false, error: "ACTION_FAILED" });
            }
        } else if (currentAcao === "CANCELAR") {
            const active = await AppointmentService.findActiveAppointment(clinicId, contact.id);
            if (active) {
                await AppointmentService.cancel(clinicId, active.id, "Cancelado via IA");
                await ConversationService.clearSchedulingState(clinicId, conversationId);
            }
        }

        // ── 9. Finalização ──────────────────────────────────────────
        if (!aiResponse) {
            return NextResponse.json({ ok: false, error: "AI_RESPONSE_LOST_IN_EXECUTION" });
        }

        if (aiResponse.nome_identificado) {
            await ContactService.saveName(clinicId, contact.id, aiResponse.nome_identificado);
        }

        const robotMsg = await MessageService.enqueueRobotReply(clinicId, conversationId, aiResponse.mensagem);
        await ConversationService.setLastProcessedMessage(clinicId, conversationId, lastClientMessage.id);

        if (!messageAlreadySent && aiResponse.modo_conversa !== ConversationMode.HUMANO_URGENTE) {
            const sent = await ProviderInst.sendMessage(clinicId, contact.phoneNumber, aiResponse.mensagem);
            if (sent) await MessageService.markProcessed(clinicId, robotMsg.id);
        }

        return NextResponse.json({ ok: true, action: aiResponse.acao_backend, messageId: robotMsg.id });

    } catch (error) {
        console.error("[process-conversation] Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
