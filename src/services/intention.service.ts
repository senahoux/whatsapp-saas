import { Conversation } from "@prisma/client";
import { Intention, ConversationState } from "@/lib/types";

/**
 * IntentionService — WhatsApp SaaS
 * 
 * Responsável por classificar a intenção real do paciente de forma híbrida.
 * Separa a conversa informal (Dúvidas) do agendamento ativo (Agenda).
 */
export const IntentionService = {
    /**
     * Classifica a intenção da mensagem atual do paciente.
     */
    classify(
        message: string,
        conversation: Conversation,
        lastOfferedSlots: string[] = []
    ): Intention {
        const content = message.toLowerCase().trim();
        const isScheduling = conversation.state === ConversationState.SCHEDULING;

        // 1. SLOT_CONFIRMATION (Prioridade máxima se estiver em fluxo de agenda)
        const isOneOrTwo = (content === "1" || content === "2") && lastOfferedSlots.length === 2;
        const confirmationTerms = [
            "pode marcar", "fechado", "quero esse", "esse horário", "pode ser",
            "sim", "confirmo", "pode agendar", "ok", "beleza", "perfeito", "fechou"
        ];
        const hasConfirmationTerm = confirmationTerms.some(term => content.includes(term));
        const hasTimePattern = /\d{1,2}:\d{2}/.test(content);
        
        if (isScheduling && (isOneOrTwo || hasConfirmationTerm || hasTimePattern)) {
            return Intention.SLOT_CONFIRMATION;
        }

        // 2. CHANGE_DATE_INTENT (Mudança explícita de restrição temporal — Nova Data)
        const dateChangeTerms = [
            "outro dia", "outra data", "semana que vem", "mes que vem", "mês que vem",
            "janeiro", "fevereiro", "março", "abril", "maio", "junho", 
            "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
            "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo",
            "amanhã", "amanha", "hoje"
        ];
        if (isScheduling && dateChangeTerms.some(term => content.includes(term))) {
            return Intention.CHANGE_DATE_INTENT;
        }

        // 3. HARD_SCHEDULING_INTENT (Desejo de agendar ou Outro Horário no mesmo dia)
        const hardTerms = [
            "agendar", "marcar", "vaga", "horário", "horario", "disponível", "disponivel",
            "mais tarde", "mais cedo", "outro horário", "outro horario", "não posso", "nao posso", "prefiro"
        ];
        if (hardTerms.some(term => content.includes(term))) {
            return Intention.HARD_SCHEDULING_INTENT;
        }

        // 4. BACK_TO_INFO (Mudança de tema)
        const infoTerms = ["preço", "valor", "atende", "onde fica", "endereço", "unimed", "convênio", "custa"];
        if (isScheduling && infoTerms.some(term => content.includes(term))) {
            return Intention.BACK_TO_INFO;
        }

        // 5. SOFT_SCHEDULING_INTEREST
        const softTerms = ["consulta", "passar", "doutor", "atendimento"];
        if (softTerms.some(term => content.includes(term))) {
            return Intention.SOFT_SCHEDULING_INTEREST;
        }

        return Intention.INFO_ONLY;
    }
};
