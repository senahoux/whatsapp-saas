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

// ── Helpers de Data e Timezone (Intl nativo) ───────────────────
function getClinicCurrentDate(timeZone: string = 'America/Sao_Paulo'): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date()); // YYYY-MM-DD
}

function getTomorrowDate(timeZone: string = 'America/Sao_Paulo'): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(tomorrow); // YYYY-MM-DD
}

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
    let messageAlreadySent = false;

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

        // ── 1. Valida clinicId e robotEnabled ─────────────────────────
        const settings = await ClinicService.getSettings(clinicId);
        const robotEnabled = settings?.robotEnabled ?? true;

        if (!robotEnabled) {
            await LogService.warn(clinicId, LogEvent.ACTION_EXECUTED, {
                conversationId,
                note: "ROBÔ DESATIVADO (Modo Passivo Estrito). Abortando orquestração automática."
            });
            return NextResponse.json({ 
                ok: true, 
                skipped: "robot_disabled_passive_mode" 
            });
        }

        // --- MUDANÇA 3: CARREGAR CLÍNICA NO TOPO ---
        const clinic = await ClinicService.findById(clinicId);
        if (!clinic) {
            await LogService.error(clinicId, LogEvent.ERROR, { 
                note: "Clínica não encontrada no início do fluxo.", 
                clinicId 
            });
            return NextResponse.json({ error: "clinic not found" }, { status: 404 });
        }

        const timezone = clinic.timezone || "America/Sao_Paulo";
        const data_referencia = getClinicCurrentDate(timezone);

        // ── 2. Busca conversa ──────────────────────────────────────────
        const conversation = await ConversationService.findById(clinicId, conversationId);
        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found" },
                { status: 404 },
            );
        }

        // ── 3. Guarda contra reentrada e Debounce Distribuído ──────────
        if (conversation.status !== ConversationStatus.AGUARDANDO_IA) {
            return NextResponse.json({
                ok: true,
                skipped: `status_is_${conversation.status}`,
            });
        }

        // SEMANTIC DEBOUNCE: Verifica se este é o gatilho mais recente
        const debounceMs = (settings?.debounceSeconds ?? 8) * 1000;
        const now = Date.now();
        const lastMsgTime = new Date(conversation.lastMessageAt || 0).getTime();
        const diff = now - lastMsgTime;

        if (diff < debounceMs - 1000) { // Margem de 1s para compensar latência de rede/DB
            return NextResponse.json({
                ok: true,
                skipped: "debounced_by_later_message",
                diff_ms: diff,
                threshold: debounceMs
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

        // --- MUDANÇA 4: DETECTOR DE INTENÇÃO SEMÂNTICO (BUG 3) ---
        const content = lastClientMessage.content.toLowerCase();
        
        const SCHEDULING_KEYWORDS = ["agendar", "marcar", "reservar", "consulta", "horário", "vaga", "disponível", "passar", "marcação", "agenda", "outro dia"];
        const INFORMATIVE_KEYWORDS = ["preço", "valor", "unimed", "convênio", "atende", "endereço", "local", "onde fica", "telefone", "contato", "especialidade"];

        const hasSchedulingIntent = SCHEDULING_KEYWORDS.some(k => content.includes(k));
        const hasInformativeIntent = INFORMATIVE_KEYWORDS.some(k => content.includes(k));

        // Se houver match apenas informativo e não houver intenção clara de agendar, não força scheduling
        const looksLikeScheduleIntent = hasSchedulingIntent && !(!hasSchedulingIntent && hasInformativeIntent);

        if (hasInformativeIntent && !hasSchedulingIntent) {
            await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, {
                conversationId,
                note: "Intenção classificada como informativa e não scheduling."
            });
        }

        // --- LÓGICA DE ESTADO PERSISTENTE ---
        const isScheduling = (conversation as any).state === ConversationState.SCHEDULING || looksLikeScheduleIntent;

        const tabela_temporal = AIService.getDateReferences(timezone);

        const aiCtx: any = {
            mensagem_paciente: lastClientMessage.content,
            nome_paciente: contact.name,
            historico_resumido,
            status_conversa: conversation.status,
            contexto_clinica: clinicContext,
            contexto_agenda: null as any,
            ultimas_ofertas: (conversation as any).lastOfferedSlots || [],
            data_referencia,
            timezone,
            tabela_temporal
        };

        // Se estiver em modo agendamento, SEMPRE injeta slots
        if (isScheduling) {
            // Tenta extrair data da mensagem para filtrar slots iniciais
            const dateMatch = lastClientMessage.content.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2})/);
            let requestedDate: string | undefined = undefined;
            if (dateMatch) {
                const rawDate = dateMatch[0];
                if (rawDate.includes('/')) {
                    const [d, m] = rawDate.split('/');
                    requestedDate = `${new Date().getFullYear()}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                } else {
                    requestedDate = rawDate;
                }
            }

            aiCtx.contexto_agenda = await AppointmentService.getAvailableSlots(clinicId, requestedDate);

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

        // LOG DE AUDITORIA: Salva o retorno bruto da IA para rastreabilidade
        await LogService.info(clinicId, LogEvent.AI_RESPONSE, {
            conversationId,
            rawResponse: aiResponse,
            patientMessage: lastClientMessage.content
        });

        if (aiResponse) aiResponse.acao = aiResponse.acao ?? "NENHUMA";

        // Loop VER_AGENDA (máximo 1 iteração)
        if (aiResponse?.acao === "VER_AGENDA") {
            // --- MUDANÇA 5: RESOLUÇÃO DE DATA PARA VER_AGENDA (BUG 2) ---
            let targetDate = aiResponse.data;
            if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
                await LogService.error(clinicId, LogEvent.ERROR, {
                    conversationId,
                    note: "VER_AGENDA: IA falhou em resolver data relativa ou retornou data nula.",
                    userText: lastClientMessage.content,
                    aiResponse: aiResponse
                });
                
                // Em vez de fallback amanhã automático, pedimos esclarecimento se a intenção era data relativa
                aiResponse.mensagem = "Poderia me dizer exatamente o dia e o mês que você gostaria de agendar? Assim consigo verificar a disponibilidade exata para você. 😊";
                aiResponse.acao = "NENHUMA";
                // Não prossegue para busca de slots com data nula
            } else if (targetDate < data_referencia) {
                targetDate = data_referencia; // Nunca busca no passado
            }

            if (aiResponse.acao === "VER_AGENDA" && targetDate) {
                const agendaContext = await AppointmentService.getAvailableSlots(
                    clinicId,
                    targetDate,
                );
                aiCtx.contexto_agenda = agendaContext;

                // Persiste as novas opções
                await ConversationService.setLastOfferedSlots(clinicId, conversationId, agendaContext.horarios_disponiveis);
                aiCtx.ultimas_ofertas = agendaContext.horarios_disponiveis;

                console.log(">>> [SLOTS] (Loop VER_AGENDA) Enviando para IA:", JSON.stringify(aiCtx.contexto_agenda));
                aiResponse = await AIService.respond(aiCtx);
                if (aiResponse) aiResponse.acao = aiResponse.acao ?? "NENHUMA";
                if (aiResponse?.acao === "VER_AGENDA") aiResponse.acao = "NENHUMA";
            }
        }

        if (!aiResponse) {
            await NotificationService.notifyAlert(clinicId, `Falha na IA para a conversa ${conversationId}.`, contact.id);
            await ConversationService.setStatus(clinicId, conversationId, ConversationStatus.ERRO);
            return NextResponse.json({ ok: false, error: "AI_FAILED" });
        }

        // ── 7. Execução de Ações de Agenda ──────────────────────────────
        const currentAcao = aiResponse.acao as string;
        if (["AGENDAR", "REMARCAR", "CANCELAR"].includes(currentAcao)) {
            try {
                if (aiResponse.acao === "AGENDAR") {
                    // --- FASE 2: GUARDA DE AÇÃO AUTOMATIZADA ---
                    const freshSettings = await ClinicService.getSettings(clinicId);
                    if (!freshSettings?.robotEnabled) {
                        throw new Error("Ação de agendamento bloqueada: Robô foi desativado durante o processamento.");
                    }

                    if (!aiResponse.data || !aiResponse.hora) {
                        throw new Error("Data ou hora ausentes para AGENDAR");
                    }

                    // --- VALIDAÇÃO CIRÚRGICA DE CONFIRMAÇÃO (REGRA OBRIGATÓRIA) ---
                    const lastOffered = aiCtx.ultimas_ofertas as string[] || [];
                    const patientText = lastClientMessage.content.trim();
                    const isOneOrTwo = (patientText === "1" || patientText === "2") && lastOffered.length === 2;

                    const confirmationTerms = [
                        "pode marcar", "fechado", "quero esse", "esse horário", "pode ser",
                        "sim", "confirmo", "pode agendar", "marcar", "agendar", "ok", "beleza", "perfeito"
                    ];
                    const patientTextLower = patientText.toLowerCase();
                    const isExplicitConfirmation = isOneOrTwo || 
                        confirmationTerms.some(term => patientTextLower.includes(term)) || 
                        /\d{1,2}:\d{2}/.test(patientTextLower);

                    if (!isExplicitConfirmation) {
                        await LogService.warn(clinicId, LogEvent.ACTION_EXECUTED, {
                            conversationId,
                            note: "BLOQUEIO: IA solicitou AGENDAR mas o texto do paciente não indica confirmação explícita.",
                            patientMessage: lastClientMessage.content,
                            actionIgnored: "AGENDAR"
                        });
                        aiResponse.acao = "NENHUMA"; // Aborta a ação mas mantém o texto
                        throw new Error("Confirmação explícita do paciente não detectada pelo backend.");
                    }

                    // --- MUDANÇA 8: EVITAR DUPLICIDADE ÓBVIA (BUG 1 - REFORÇADA) ---
                    const isDuplicate = await AppointmentService.isDuplicate(
                        clinicId, 
                        contact.id, 
                        aiResponse.data, 
                        aiResponse.hora
                    );

                    if (isDuplicate) {
                        await LogService.warn(clinicId, LogEvent.ACTION_EXECUTED, {
                            conversationId,
                            note: "Tentativa de duplicidade barrada antes de criar.",
                            contactId: contact.id,
                            slot: `${aiResponse.data} ${aiResponse.hora}`
                        });
                        aiResponse.acao = "NENHUMA";
                        aiResponse.mensagem = "Ops, notei que você já tem um agendamento para este mesmo horário! 😊";
                        throw new Error("Agendamento duplicado detectado.");
                    }

                    // Validação DETERMINÍSTICA: deve bater com um dos slots ofertados
                    const selectedSlot = `${aiResponse.data} ${aiResponse.hora}`;

                    if (lastOffered.length > 0 && !lastOffered.includes(selectedSlot)) {
                        await LogService.warn(clinicId, LogEvent.AI_RESPONSE, {
                            conversationId,
                            note: `BLOQUEIO: Slot ${selectedSlot} não estava entre as opções ofertadas: ${lastOffered.join(", ")}.`,
                        });
                        
                        // Change C: HARD BLOCK
                        const freshSlots = await AppointmentService.getAvailableSlots(clinicId, aiResponse.data ?? undefined);
                        await ConversationService.setLastOfferedSlots(clinicId, conversationId, freshSlots.horarios_disponiveis);
                        
                        aiResponse.acao = "NENHUMA";
                        aiResponse.mensagem = `Desculpe, esse horário não está disponível para seleção direta. Por favor, escolha um destes horários:\n\n${freshSlots.horarios_disponiveis.map((s, i) => `${i + 1}. ${s.split(' ')[1]}`).join('\n')}`;
                        
                        // Mantém em SCHEDULING (não reseta para IDLE)
                        throw new Error(`Slot ${selectedSlot} não autorizado (não estava na última oferta).`);
                    }

                    const newAppt = await AppointmentService.create(clinicId, {
                        contactId: contact.id,
                        date: aiResponse.data,
                        time: aiResponse.hora,
                        type: aiResponse.tipo ?? "CONSULTA",
                        subtype: aiResponse.subtipo ?? null,
                        source: AppointmentSource.ROBO,
                        notes: `Agendado automaticamente via IA após confirmação explícita.`
                    });

                    // --- MUDANÇA 6 & 7: CONFIRMAÇÃO PÓS-CREATE REAL (BACKEND-DRIVEN) ---
                    // Usamos newAppt (dados persistidos) e clinic como fontes da verdade
                    const confirmationMsg = `
✅ *Consulta confirmada com sucesso!*

🏥 *Clínica:* ${clinic.nomeClinica}
📍 *Endereço:* ${clinic.endereco || 'Consultar com a recepção'}
📅 *Data:* ${newAppt.date}
⏰ *Horário:* ${newAppt.time}

Te esperamos lá! 😊
`.trim();
                    
                    // Substitui a mensagem da IA pela confirmação real
                    aiResponse.mensagem = confirmationMsg;

                    // Envio imediato da confirmação (Try/Catch dedicado)
                    try {
                        const sent = await ProviderInst.sendMessage(clinicId, contact.phoneNumber, confirmationMsg);
                        if (sent) {
                            messageAlreadySent = true; // Marca para evitar duplicidade no despacho final
                            await AppointmentService.updateNotificationStatus(newAppt.id, "SENT");
                            await LogService.info(clinicId, LogEvent.NOTIFICATION_SENT, { 
                                appointmentId: newAppt.id,
                                note: "Confirmação enviada com sucesso no bloco AGENDAR."
                            });
                        } else {
                            throw new Error("Provider falhou ao enviar mensagem.");
                        }
                    } catch (sendError: any) {
                        await AppointmentService.updateNotificationStatus(newAppt.id, "FAILED", sendError.message);
                        await LogService.error(clinicId, LogEvent.ERROR, { 
                            note: "Falha ao enviar confirmação de agendamento.", 
                            error: sendError.message 
                        });
                    }

                    await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
                        conversationId,
                        note: "AGENDAR criado com sucesso.",
                        appointmentId: newAppt.id
                    });

                    // LIMPEZA COMPLETA DE CONTEXTO APÓS SUCESSO
                    await ConversationService.setState(clinicId, conversationId, ConversationState.IDLE);
                    await ConversationService.setLastOfferedSlots(clinicId, conversationId, []);
                } else {
                    const targetAppt = await AppointmentService.findActiveAppointment(clinicId, contact.id);
                    if (!targetAppt) throw new Error(`Nenhum agendamento ativo encontrado para ${aiResponse.acao} `);

                    if (aiResponse.acao === "REMARCAR") {
                        if (!aiResponse.data || !aiResponse.hora) throw new Error("Data ou hora ausentes para REMARCAR");
                        
                        const updatedAppt = await AppointmentService.reschedule(clinicId, targetAppt.id, {
                            date: aiResponse.data,
                            time: aiResponse.hora,
                            notes: `Remarcado via IA.`
                        });

                        const confirmationMsg = `
✅ *Consulta remarcada com sucesso!*

🏥 *Clínica:* ${clinic.nomeClinica}
📅 *Data:* ${updatedAppt.date}
⏰ *Horário:* ${updatedAppt.time}

Tudo certo para seu novo horário. Te esperamos lá! 😊
`.trim();

                        aiResponse.mensagem = confirmationMsg;

                        try {
                            const sent = await ProviderInst.sendMessage(clinicId, contact.phoneNumber, confirmationMsg);
                            if (sent) {
                                messageAlreadySent = true;
                                await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, { 
                                    appointmentId: updatedAppt.id,
                                    note: "Confirmação de REMARCAR enviada com sucesso."
                                });
                            }
                        } catch (sendError: any) {
                            await LogService.error(clinicId, LogEvent.ERROR, { 
                                note: "Falha ao enviar confirmação de remarcação.", 
                                error: sendError.message 
                            });
                        }
                    } else {
                        await AppointmentService.cancel(clinicId, targetAppt.id, "Cancelado via IA");
                    }
                    // Reset para IDLE após sucesso
                    await ConversationService.setState(clinicId, conversationId, ConversationState.IDLE);
                    await ConversationService.setLastOfferedSlots(clinicId, conversationId, []);
                }

                await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
                    conversationId,
                    action: aiResponse.acao,
                    data: aiResponse.data,
                    hora: aiResponse.hora
                });
            } catch (error: any) {
                const isMissingData = error.message?.includes("Data ou hora ausentes");
                const isConflict = error.code === 'P2002' || error.message?.includes("already booked");

                if (isConflict) {
                    // Change B: Tratamento de Conflito de Slot
                    const freshSlots = await AppointmentService.getAvailableSlots(clinicId);
                    await ConversationService.setLastOfferedSlots(clinicId, conversationId, freshSlots.horarios_disponiveis);
                    
                    aiResponse.acao = "NENHUMA";
                    aiResponse.mensagem = "Poxa, esse horário acabou de ser preenchido por outra pessoa! 😕\nMas não tem problema, tenho esses outros horários disponíveis:\n\n" + 
                        freshSlots.horarios_disponiveis.map((s, i) => `${i + 1}. ${s.split(' ')[1]}`).join('\n');
                } else if (!isMissingData) {
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

        // --- FASE 3: GARANTIA DE ENVIO (ANTI RACE CONDITION) ---
        const finalCheck = await ClinicService.getSettings(clinicId);
        if (!finalCheck?.robotEnabled) {
            await LogService.warn(clinicId, LogEvent.ACTION_EXECUTED, {
                conversationId,
                note: "BLOQUEIO FINAL: Envio ao WhatsApp impedido pelo desligamento do robô."
            });
            return NextResponse.json({ ok: true, skipped: "final_send_blocked" });
        }

        if (messageAlreadySent) {
            // Se já enviamos a confirmação no AGENDAR, finalizamos aqui sem duplicidade
            return NextResponse.json({ ok: true, action: "AUTO_CONFIRMADO" });
        }

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
