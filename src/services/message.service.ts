/**
 * MessageService — WhatsApp SaaS
 *
 * REGRA FUNDAMENTAL: clinicId é SEMPRE o primeiro parâmetro de todo método.
 * Nenhuma query acessa mensagens fora do clinicId informado.
 *
 * Responsabilidades:
 * - Criar mensagem (com dedup por externalMessageId)
 * - Listar mensagens de uma conversa (histórico)
 * - Buscar mensagens não processadas da fila de saída (para o robô)
 * - Confirmar envio de mensagem pelo robô
 * - Montar histórico resumido para contexto da IA
 */

import { prisma } from "@/lib/prisma";
import { MessageAuthor, MessageType } from "@/lib/types";
import type { Message } from "@prisma/client";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface CreateMessageInput {
    conversationId: string;
    externalMessageId?: string;
    author: string;       // MessageAuthor
    messageType?: string; // MessageType (default: TEXT)
    content: string;
    sentAt?: Date;
}

export interface ListMessagesOptions {
    limit?: number;        // default: 50
    onlyUnprocessed?: boolean;
}

export interface HistoryMessage {
    author: string;
    content: string;
    sentAt: Date | null;
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export const MessageService = {
    /**
     * Cria uma nova mensagem na conversa, com dedup por externalMessageId.
     * Se já existir uma mensagem com o mesmo externalMessageId na clínica,
     * retorna a existente sem criar duplicata (idempotente para webhooks).
     *
     * clinicId é sempre propagado para garantir isolamento multi-tenant.
     */
    async create(
        clinicId: string,
        input: CreateMessageInput
    ): Promise<{ message: Message; isDuplicate: boolean }> {
        // Dedup: só verifica se externalMessageId foi fornecido
        if (input.externalMessageId) {
            const existing = await prisma.message.findUnique({
                where: {
                    clinicId_externalMessageId: {
                        clinicId,
                        externalMessageId: input.externalMessageId,
                    },
                },
            });
            if (existing) {
                return { message: existing, isDuplicate: true };
            }
        }

        const message = await prisma.message.create({
            data: {
                clinicId,
                conversationId: input.conversationId,
                externalMessageId: input.externalMessageId ?? null,
                author: input.author,
                messageType: input.messageType ?? MessageType.TEXT,
                content: input.content,
                sentAt: input.sentAt ?? null,
                processed: false,
            },
        });

        return { message, isDuplicate: false };
    },

    /**
     * Lista mensagens de uma conversa garantindo isolamento por clinicId.
     * Valida que a conversa pertence à clínica antes de retornar as mensagens.
     */
    async listByConversation(
        clinicId: string,
        conversationId: string,
        options: ListMessagesOptions = {}
    ): Promise<Message[]> {
        // Validação de pertencimento (segurança multi-tenant)
        const conv = await prisma.conversation.findFirst({
            where: { id: conversationId, clinicId },
            select: { id: true },
        });
        if (!conv) {
            throw new Error(
                `Conversation ${conversationId} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.message.findMany({
            where: {
                clinicId,
                conversationId,
                ...(options.onlyUnprocessed ? { processed: false } : {}),
            },
            orderBy: { createdAt: "asc" },
            take: options.limit ?? 50,
        });
    },

    /**
     * Retorna o histórico recente de uma conversa formatado para envio à IA.
     * Inclui apenas mensagens TEXT dos últimos N turnos.
     * A IA nunca recebe o clinicId — apenas o conteúdo contextual.
     */
    async buildHistoryForAI(
        clinicId: string,
        conversationId: string,
        limit: number = 10
    ): Promise<HistoryMessage[]> {
        // Validação de pertencimento
        const conv = await prisma.conversation.findFirst({
            where: { id: conversationId, clinicId },
            select: { id: true },
        });
        if (!conv) {
            throw new Error(
                `Conversation ${conversationId} not found or does not belong to clinic ${clinicId}`
            );
        }

        const messages = await prisma.message.findMany({
            where: {
                clinicId,
                conversationId,
                messageType: MessageType.TEXT,
                // Exclui mensagens de sistema do histórico enviado à IA
                author: {
                    not: MessageAuthor.SISTEMA,
                },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
                author: true,
                content: true,
                sentAt: true,
            },
        });

        // Inverte para ordem cronológica (mais antiga primeiro)
        return messages.reverse();
    },

    /**
     * Busca mensagens pendentes de envio pelo robô, filtradas por clínica.
     * "Pendentes" = author ROBO + processed = false.
     * O robô consome esta fila via polling em GET /api/robot/pending-messages.
     */
    async getPendingOutbound(
        clinicId: string,
        limit: number = 10
    ): Promise<(Message & { contact: { phoneNumber: string } | null })[]> {
        return prisma.message.findMany({
            where: {
                clinicId,
                author: MessageAuthor.ROBO,
                processed: false,
            },
            orderBy: { createdAt: "asc" },
            take: limit,
            include: {
                conversation: {
                    include: {
                        contact: {
                            select: { phoneNumber: true },
                        },
                    },
                },
            },
        }) as unknown as (Message & { contact: { phoneNumber: string } | null })[];
    },

    /**
     * Versão tipada de getPendingOutbound que retorna o número do destinatário.
     * Usada diretamente pelo endpoint de polling do robô.
     */
    async getPendingOutboundForRobot(clinicId: string, limit: number = 10) {
        const messages = await prisma.message.findMany({
            where: {
                clinicId,
                author: MessageAuthor.ROBO,
                processed: false,
            },
            orderBy: { createdAt: "asc" },
            take: limit,
            include: {
                conversation: {
                    select: {
                        contact: {
                            select: { phoneNumber: true },
                        },
                    },
                },
            },
        });

        return messages.map((m) => ({
            id: m.id,
            clinicId: m.clinicId,
            phoneNumber: m.conversation?.contact?.phoneNumber ?? null,
            content: m.content,
            messageType: m.messageType,
        }));
    },

    /**
     * Confirma que o robô enviou a mensagem com sucesso.
     * Marca a mensagem como processada (processed = true).
     * Valida clinicId antes de atualizar.
     */
    async confirmSent(clinicId: string, messageId: string): Promise<Message> {
        const message = await prisma.message.findFirst({
            where: { id: messageId, clinicId },
        });
        if (!message) {
            throw new Error(
                `Message ${messageId} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.message.update({
            where: { id: messageId },
            data: {
                processed: true,
                sentAt: new Date(),
            },
        });
    },

    /**
     * Marca uma mensagem como processada pela IA (evita reprocessamento).
     * Valida clinicId antes de atualizar.
     */
    async markProcessed(clinicId: string, messageId: string): Promise<Message> {
        const message = await prisma.message.findFirst({
            where: { id: messageId, clinicId },
        });
        if (!message) {
            throw new Error(
                `Message ${messageId} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.message.update({
            where: { id: messageId },
            data: { processed: true },
        });
    },

    /**
     * Cria uma mensagem de resposta do robô na fila de saída.
     * Shortcut para CreateMessageInput com author=ROBO e processed=false.
     * A mensagem fica na fila até o robô confirmar o envio.
     */
    async enqueueRobotReply(
        clinicId: string,
        conversationId: string,
        content: string,
        messageType: string = MessageType.TEXT
    ): Promise<Message> {
        const { message } = await MessageService.create(clinicId, {
            conversationId,
            author: MessageAuthor.ROBO,
            messageType,
            content,
        });
        return message;
    },
};
