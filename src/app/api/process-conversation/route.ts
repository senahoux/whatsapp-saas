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

// ── Helpers de Data e Timezone (Intl nativo) ───────────────────
function getClinicCurrentDate(timeZone: string = 'America/Sao_Paulo'): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date()); // YYYY-MM-DD
}

/**
 * POST /api/process-conversation
 * Orquestrador consolidado e híbrido do pipeline de IA.
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

        // ── 1. Inicialização e Guardas ───────────────────────────────
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

        // ── 2. Captura da Mensagem e Histórico ───────────────────────
        // IMPORTANTE: getLastClientMessage ordena DESC — retorna a mensagem mais RECENTE do cliente.
        // Não usar listByConversation(limit:1) aqui, pois ela ordena ASC e retorna a mais ANTIGA.
        const lastClientMessage = await MessageService.getLastClientMessage(clinicId, conversationId);
        if (!lastClientMessage) return NextResponse.json({ ok: true, skipped: "no_client_message" });

        // ── 3. Gestão de Turno e Cooldown (ATÔMICO) ──────────────────
        await ConversationService.decrementCooldownIfNewTurn(clinicId, conversationId, lastClientMessage.id);
        
        // Recarrega a conversa para ter os valores de cooldown e estado mais recentes
        conversation = await ConversationService.findById(clinicId, conversationId);
        if (!conversation) return NextResponse.json({ error: "conv_lost" }, { status: 500 });

        // ── 4. Camada de Decisão (Intention Service) ──────────────────
        const lastSlots = (conversation as any).lastOfferedSlots as string[] || [];
        let intention = IntentionService.classify(lastClientMessage.content, conversation, lastSlots);

        // REGRA DO COOLDOWN: Se interesse leve mas em cooldown, trata como INFO_ONLY
        if (intention === Intention.SOFT_SCHEDULING_INTEREST && (conversation as any).agendaOfferCooldown > 0) {
            intention = Intention.INFO_ONLY;
        }

        // REGRA BACK_TO_INFO: Reset de estado se o paciente saiu do tema
        if (intention === Intention.BACK_TO_INFO) {
            await ConversationService.setState(clinicId, conversationId, ConversationState.IDLE);
            await ConversationService.setLastOfferedSlots(clinicId, conversationId, []);
            (conversation as any).state = ConversationState.IDLE;
        }

        await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, {
            conversationId,
            intention,
            cooldown: (conversation as any).agendaOfferCooldown
        });

        // ── 5. Preparação do Contexto da IA ───────────────────────────
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
            contexto_agenda: null,
            ultimas_ofertas: (conversation as any).lastOfferedSlots || [],
            data_referencia,
            timezone,
            tabela_temporal,
            intention // Passamos a intenção classificada para a IA
        };

        // Injeção de slots apenas se houver intenção real de agendamento ou confirmação
        if (intention === Intention.HARD_SCHEDULING_INTENT || intention === Intention.SLOT_CONFIRMATION) {
            if ((conversation as any).state !== ConversationState.SCHEDULING) {
                await ConversationService.setState(clinicId, conversationId, ConversationState.SCHEDULING);
            }
            
            // Busca slots (pode ser filtrado por data se presente na mensagem)
            const agendaContext = await AppointmentService.getAvailableSlots(clinicId);
            aiCtx.contexto_agenda = agendaContext;
            
            await ConversationService.setLastOfferedSlots(clinicId, conversationId, agendaContext.horarios_disponiveis);
            aiCtx.ultimas_ofertas = agendaContext.horarios_disponiveis;
        }

        // ── 6. Chamada à IA ────────────────────────────────────────────
        let aiResponse = await AIService.respond(aiCtx);
        if (!aiResponse) {
            await ConversationService.setStatus(clinicId, conversationId, ConversationState.IDLE);
            return NextResponse.json({ ok: false, error: "AI_FAILED" });
        }

        // Loop VER_AGENDA (Preservado para resolução de datas específicas)
        if (aiResponse.acao === "VER_AGENDA" && aiResponse.data) {
            const agendaContext = await AppointmentService.getAvailableSlots(clinicId, aiResponse.data);
            aiCtx.contexto_agenda = agendaContext;
            await ConversationService.setLastOfferedSlots(clinicId, conversationId, agendaContext.horarios_disponiveis);
            aiCtx.ultimas_ofertas = agendaContext.horarios_disponiveis;
            
            aiResponse = await AIService.respond(aiCtx);
            if (!aiResponse) return NextResponse.json({ ok: false, error: "AI_FAILED_2" });
        }

        // ── 7. Execução de Efeitos e Ações ──────────────────────────────
        
        // Ativação do Cooldown se a IA fez uma oferta leve
        if (aiResponse.acao === "OFERTA_LEVE") {
            await ConversationService.setAgendaOfferCooldown(clinicId, conversationId, 3);
        }

        // Lógica de AGENDAR / REMARCAR (Confirmada e Backend-Driven)
        const currentAcao = aiResponse.acao as string;
        if (["AGENDAR", "REMARCAR"].includes(currentAcao)) {
            try {
                if (!aiResponse.data || !aiResponse.hora) throw new Error("Missing slot data");

                // Validação de Duplicidade
                const isDup = await AppointmentService.isDuplicate(clinicId, contact.id, aiResponse.data, aiResponse.hora);
                if (isDup) {
                    aiResponse.mensagem = "Ops, notei que você já tem um agendamento para este mesmo horário! 😊";
                    aiResponse.acao = "NENHUMA";
                } else {
                    // Criação / Atualização Real
                    let finalAppt;
                    if (currentAcao === "AGENDAR") {
                        finalAppt = await AppointmentService.create(clinicId, {
                            contactId: contact.id,
                            date: aiResponse.data,
                            time: aiResponse.hora,
                            notes: "Agendado via IA (Fluxo Consolidado)"
                        });
                    } else {
                        const active = await AppointmentService.findActiveAppointment(clinicId, contact.id);
                        if (active) finalAppt = await AppointmentService.reschedule(clinicId, active.id, { date: aiResponse.data, time: aiResponse.hora });
                    }

                    if (finalAppt) {
                        const confirmationMsg = currentAcao === "AGENDAR" 
                            ? `✅ *Consulta confirmada!*\n\n🏥 *Clínica:* ${clinic.nomeClinica}\n📅 *Data:* ${finalAppt.date}\n⏰ *Horário:* ${finalAppt.time}\n\nTe esperamos lá! 😊`
                            : `✅ *Consulta remarcada!*\n\n🏥 *Clínica:* ${clinic.nomeClinica}\n📅 *Data:* ${finalAppt.date}\n⏰ *Horário:* ${finalAppt.time}\n\nTudo certo! 😊`;

                        aiResponse.mensagem = confirmationMsg;
                        const sent = await ProviderInst.sendMessage(clinicId, contact.phoneNumber, confirmationMsg);
                        if (sent) {
                            messageAlreadySent = true;
                            await AppointmentService.updateNotificationStatus(finalAppt.id, "SENT");
                        }

                        // Sucesso total -> Reset de estado
                        await ConversationService.setState(clinicId, conversationId, ConversationState.IDLE);
                        await ConversationService.setLastOfferedSlots(clinicId, conversationId, []);
                    }
                }
            } catch (err: any) {
                await LogService.error(clinicId, LogEvent.ERROR, { note: `Ação ${currentAcao} falhou`, error: err.message });
            }
        } else if (currentAcao === "CANCELAR") {
            const active = await AppointmentService.findActiveAppointment(clinicId, contact.id);
            if (active) {
                await AppointmentService.cancel(clinicId, active.id, "Cancelado via IA");
                await ConversationService.setState(clinicId, conversationId, ConversationState.IDLE);
            }
        }

        // ── 8. Finalização e Despacho ───────────────────────────────────
        
        // Salva nome se identificado
        if (aiResponse.nome_identificado) await ContactService.saveName(clinicId, contact.id, aiResponse.nome_identificado);

        const robotMsg = await MessageService.enqueueRobotReply(clinicId, conversationId, aiResponse.mensagem);
        await ConversationService.setLastProcessedMessage(clinicId, conversationId, lastClientMessage.id);

        if (!messageAlreadySent && aiResponse.modo !== ConversationMode.HUMANO_URGENTE) {
            const sent = await ProviderInst.sendMessage(clinicId, contact.phoneNumber, aiResponse.mensagem);
            if (sent) await MessageService.markProcessed(clinicId, robotMsg.id);
        }

        return NextResponse.json({ ok: true, action: aiResponse.acao, messageId: robotMsg.id });

    } catch (error) {
        console.error("[process-conversation] Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
