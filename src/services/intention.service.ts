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
     * Classifica a intenção da mensagem atual do paciente APENAS para métricas e telemetria.
     * ATENÇÃO: Este serviço NÃO dita o roteamento do fluxo de agendamento. O roteamento (cérebro) pertence à IA.
     */
    classify(
        message: string,
        conversation: Conversation,
        lastOfferedSlots: string[] = []
    ): Intention {
        const content = message.toLowerCase().trim();

        // 1. INFO_ONLY (Ex: Duvidas financeiras/localização)
        const infoTerms = ["preço", "valor", "atende", "onde fica", "endereço", "unimed", "convênio", "custa"];
        if (infoTerms.some(term => content.includes(term))) {
            return Intention.INFO_ONLY;
        }

        // 2. SOFT_SCHEDULING_INTEREST (Ex: Interesse genérico em atendimento)
        const softTerms = ["consulta", "passar", "doutor", "atendimento", "agendar", "marcar", "vaga", "horário"];
        if (softTerms.some(term => content.includes(term))) {
            return Intention.SOFT_SCHEDULING_INTEREST;
        }

        // Fallback genérico para log. A IA decidirá o rumo semântico de fato.
        return Intention.INFO_ONLY;
    }
};
