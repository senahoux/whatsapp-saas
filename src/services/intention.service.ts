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
        // Exemplos: "1", "2", "pode ser o primeiro", "às 10:30", "fechado"
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

        // 2. HARD_SCHEDULING_INTENT
        // Paciente explicitamente quer ver agenda ou marcar agora.
        const HARD_KEYWORDS = [
            "agendar", "marcar", "reservar", "outro dia", "vaga", 
            "disponível", "horário", "ver agenda", "queria marcar", "tem vaga"
        ];
        if (HARD_KEYWORDS.some(k => content.includes(k))) {
            return Intention.HARD_SCHEDULING_INTENT;
        }

        // 3. BACK_TO_INFO
        // Se estava em scheduling mas voltou para dúvidas gerais sem confirmar nada.
        const INFO_KEYWORDS = [
            "preço", "valor", "unimed", "convênio", "atende", "endereço", 
            "local", "onde fica", "telefone", "contato", "especialidade", "funciona", "custa"
        ];
        const hasInfoIntent = INFO_KEYWORDS.some(k => content.includes(k));
        
        if (isScheduling && hasInfoIntent && !hasTimePattern && !isOneOrTwo) {
            return Intention.BACK_TO_INFO;
        }

        // 4. SOFT_SCHEDULING_INTEREST
        // Paciente mostra abertura, mas não pediu agenda agressivamente.
        const SOFT_KEYWORDS = ["consulta", "passar", "doutor", "atendimento", "preciso ir"];
        if (SOFT_KEYWORDS.some(k => content.includes(k))) {
            return Intention.SOFT_SCHEDULING_INTEREST;
        }

        // 5. INFO_ONLY (Default)
        return Intention.INFO_ONLY;
    }
};
