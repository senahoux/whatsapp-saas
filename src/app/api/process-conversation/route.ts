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
 * Extrai um filtro de data estruturado a partir da mensagem do paciente.
 * Retorna YYYY-MM para meses, YYYY-MM-DD para datas específicas, ou null.
 */
function extractTemporalFilter(message: string, timezone: string): string | null {
    const content = message.toLowerCase().trim();
    
    // Meses absolutos
    const monthMap: Record<string, string> = {
        "janeiro": "01", "fevereiro": "02", "março": "03", "marco": "03",
        "abril": "04", "maio": "05", "junho": "06",
        "julho": "07", "agosto": "08", "setembro": "09",
        "outubro": "10", "novembro": "11", "dezembro": "12",
    };
    
    const now = new Date();
    const year = now.getFullYear();
    
    for (const [name, num] of Object.entries(monthMap)) {
        if (content.includes(name)) {
            const monthNum = parseInt(num);
            const resolvedYear = monthNum <= now.getMonth() ? year + 1 : year;
            return `${resolvedYear}-${num}`;
        }
    }
    
    // "semana que vem" → próxima segunda-feira
    if (content.includes("semana que vem")) {
        const anchor = new Date(now);
        const dayOfWeek = anchor.getDay();
        const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
        anchor.setDate(anchor.getDate() + daysToMonday);
        return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getDate()).padStart(2, "0")}`;
    }
    
    // "amanhã"
    if (content.includes("amanhã") || content.includes("amanha")) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    }
    
    // "hoje"
    if (content.includes("hoje")) {
        return getClinicCurrentDate(timezone);
    }
    
    return null;
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

        // ── 4. Gestão de Estado por Intenção ────────────────────────
        let activeFilter = (conversation as any).activeSchedulingFilter as string | null;

        if (intention === Intention.BACK_TO_INFO) {
            // Paciente saiu do tema agenda → limpa tudo
            await ConversationService.clearSchedulingState(clinicId, conversationId);
            activeFilter = null;
            (conversation as any).state = ConversationState.IDLE;
        }

        if (intention === Intention.CHANGE_DATE_INTENT) {
            // Paciente mudou período/data → extrair novo filtro, limpar slots antigos
            const newFilter = extractTemporalFilter(lastClientMessage.content, timezone);
            activeFilter = newFilter;
            await ConversationService.setActiveSchedulingFilter(clinicId, conversationId, newFilter);
            await ConversationService.setLastOfferedSlots(clinicId, conversationId, []);
            await ConversationService.setState(clinicId, conversationId, ConversationState.SCHEDULING);
            (conversation as any).state = ConversationState.SCHEDULING;
        }

        if (
            intention === Intention.HARD_SCHEDULING_INTENT &&
            conversation.state === ConversationState.SCHEDULING
        ) {
            // Pediu outro horário no mesmo dia → limpar slots, manter filtro
            await ConversationService.setLastOfferedSlots(clinicId, conversationId, []);
        }

        await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, {
            conversationId, intention, activeFilter
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
            contexto_agenda: null,      // preenchido abaixo se necessário
            agenda_snapshot: null,      // novo formato estruturado
            data_referencia,
            timezone,
            tabela_temporal,
            intention,
        };

        // ── 6. Injeção de Agenda (Snapshot) ─────────────────────────
        const needsAgenda =
            intention === Intention.HARD_SCHEDULING_INTENT ||
            intention === Intention.SLOT_CONFIRMATION ||
            intention === Intention.CHANGE_DATE_INTENT;

        if (needsAgenda) {
            if (conversation.state !== ConversationState.SCHEDULING) {
                await ConversationService.setState(clinicId, conversationId, ConversationState.SCHEDULING);
            }

            // Gerar snapshot com filtro temporal do paciente
            const snapshot = await AppointmentService.getAgendaSnapshot(
                clinicId,
                activeFilter ?? undefined,
                activeFilter,
            );
            aiCtx.agenda_snapshot = snapshot;

            // Persistir slots oferecidos para referência de confirmação
            const flatSlots = snapshot.availableSlots.map(s => `${s.date} ${s.time}`);
            if (intention !== Intention.CHANGE_DATE_INTENT) {
                await ConversationService.setLastOfferedSlots(clinicId, conversationId, flatSlots);
            }
        }

        // ── 7. Chamada à IA ─────────────────────────────────────────
        let aiResponse = await AIService.respond(aiCtx);
        if (!aiResponse) {
            await ConversationService.setStatus(clinicId, conversationId, ConversationState.IDLE);
            return NextResponse.json({ ok: false, error: "AI_FAILED" });
        }

        // Loop VER_AGENDA: a IA pediu uma data específica
        if (aiResponse.acao === "VER_AGENDA" && aiResponse.data) {
            const snapshot = await AppointmentService.getAgendaSnapshot(
                clinicId,
                aiResponse.data,
                activeFilter,
            );
            aiCtx.agenda_snapshot = snapshot;

            const flatSlots = snapshot.availableSlots.map(s => `${s.date} ${s.time}`);
            await ConversationService.setLastOfferedSlots(clinicId, conversationId, flatSlots);

            aiResponse = await AIService.respond(aiCtx);
            if (!aiResponse) return NextResponse.json({ ok: false, error: "AI_FAILED_2" });
        }

        // ── 8. Execução de Ações ────────────────────────────────────
        const currentAcao = aiResponse.acao as string;

        if (["AGENDAR", "REMARCAR"].includes(currentAcao)) {
            try {
                if (!aiResponse.data || !aiResponse.hora) throw new Error("Missing slot data");

                const isDup = await AppointmentService.isDuplicate(clinicId, contact.id, aiResponse.data, aiResponse.hora);
                if (isDup) {
                    aiResponse.mensagem = "Ops, notei que você já tem um agendamento para este mesmo horário! 😊";
                    aiResponse.acao = "NENHUMA";
                } else {
                    let finalAppt;
                    if (currentAcao === "AGENDAR") {
                        finalAppt = await AppointmentService.create(clinicId, {
                            contactId: contact.id,
                            date: aiResponse.data,
                            time: aiResponse.hora,
                            notes: "Agendado via IA",
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

                        // Reset completo após agendamento
                        await ConversationService.clearSchedulingState(clinicId, conversationId);
                    }
                }
            } catch (err: any) {
                await LogService.error(clinicId, LogEvent.ERROR, { note: `Ação ${currentAcao} falhou`, error: err.message });
            }
        } else if (currentAcao === "CANCELAR") {
            const active = await AppointmentService.findActiveAppointment(clinicId, contact.id);
            if (active) {
                await AppointmentService.cancel(clinicId, active.id, "Cancelado via IA");
                await ConversationService.clearSchedulingState(clinicId, conversationId);
            }
        }

        // ── 9. Finalização ──────────────────────────────────────────
        if (aiResponse.nome_identificado) {
            await ContactService.saveName(clinicId, contact.id, aiResponse.nome_identificado);
        }

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
