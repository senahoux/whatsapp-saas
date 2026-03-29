/**
 * ConversationService — WhatsApp SaaS
 *
 * REGRA FUNDAMENTAL: clinicId é SEMPRE o primeiro parâmetro de todo método.
 * Nenhuma query acessa conversas fora do clinicId informado.
 *
 * Responsabilidades:
 * - Criar ou retornar conversa ativa por contato
 * - Atualizar status (NORMAL, HUMANO, PAUSADA, AGUARDANDO_IA, ERRO)
 * - Registrar intervenção humana
 * - Atualizar metadados de debounce e última mensagem
 * - Listar conversas com filtros por status
 * - Buscar conversa por id com validação de clinicId
 */

import { prisma } from "@/lib/prisma";
import { ConversationStatus, MessageAuthor } from "@/lib/types";
import type { Conversation } from "@prisma/client";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type ConversationWithContact = Awaited<
    ReturnType<typeof ConversationService.findByContactId>
>;

export interface ListConversationsOptions {
    status?: string;   // filtro por ConversationStatus
    page?: number;     // 1-indexed (default: 1)
    pageSize?: number; // default: 50
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export const ConversationService = {
    /**
     * Retorna a conversa ativa de um contato dentro da clínica.
     * Cria uma nova conversa se não existir nenhuma no status NORMAL, HUMANO ou AGUARDANDO_IA.
     *
     * Regra: um contato pode ter no máximo uma conversa "ativa" por clínica.
     * Conversas PAUSADAS ou com ERRO não bloqueiam a criação de uma nova.
     */
    async getOrCreate(
        clinicId: string,
        contactId: string
    ): Promise<Conversation> {
        const activeStatuses = [
            ConversationStatus.NORMAL,
            ConversationStatus.HUMANO,
            ConversationStatus.AGUARDANDO_IA,
        ];

        const existing = await prisma.conversation.findFirst({
            where: {
                clinicId,
                contactId,
                status: { in: activeStatuses },
            },
            orderBy: { createdAt: "desc" },
        });

        if (existing) return existing;

        return prisma.conversation.create({
            data: {
                clinicId,
                contactId,
                status: ConversationStatus.NORMAL,
            },
        });
    },

    /**
     * Busca conversa por contactId dentro da clínica.
     * Inclui dados do contato para uso no contexto da IA.
     */
    async findByContactId(clinicId: string, contactId: string) {
        return prisma.conversation.findFirst({
            where: { clinicId, contactId },
            orderBy: { updatedAt: "desc" },
            include: {
                contact: true,
            },
        });
    },

    /**
     * Busca conversa por id com validação de pertencimento à clínica.
     * Retorna null se a conversa não pertencer ao clinicId informado (segurança multi-tenant).
     */
    async findById(
        clinicId: string,
        id: string
    ): Promise<Conversation | null> {
        return prisma.conversation.findFirst({
            where: { id, clinicId },
        });
    },

    /**
     * Atualiza o status da conversa com validação de clinicId.
     */
    async setStatus(
        clinicId: string,
        id: string,
        status: string
    ): Promise<Conversation> {
        const conv = await prisma.conversation.findFirst({
            where: { id, clinicId },
        });
        if (!conv) {
            throw new Error(
                `Conversation ${id} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.conversation.update({
            where: { id },
            data: { status },
        });
    },

    /**
     * Registra intervenção humana:
     * - status → HUMANO
     * - humanInterventionAt → agora
     * O robô para de responder até que o cliente envie nova mensagem.
     */
    async markHumanIntervention(
        clinicId: string,
        id: string
    ): Promise<Conversation> {
        const conv = await prisma.conversation.findFirst({
            where: { id, clinicId },
        });
        if (!conv) {
            throw new Error(
                `Conversation ${id} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.conversation.update({
            where: { id },
            data: {
                status: ConversationStatus.HUMANO,
                humanInterventionAt: new Date(),
            },
        });
    },

    /**
     * Registra o início do debounce buffer.
     * Chamado quando a primeira mensagem de um ciclo chega.
     */
    async startBuffer(
        clinicId: string,
        id: string
    ): Promise<Conversation> {
        const conv = await prisma.conversation.findFirst({
            where: { id, clinicId },
        });
        if (!conv) {
            throw new Error(
                `Conversation ${id} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.conversation.update({
            where: { id },
            data: { bufferStartedAt: new Date() },
        });
    },

    /**
     * Atualiza metadados após recebimento de uma mensagem:
     * - lastMessageAuthor
     * - lastMessageAt
     * - bufferStartedAt (reinicia o debounce)
     * - status pode ser resetado para NORMAL se estava em HUMANO e o autor é CLIENTE
     */
    async updateAfterMessage(
        clinicId: string,
        id: string,
        author: string,
        resetHumanIfClient: boolean = true
    ): Promise<Conversation> {
        const conv = await prisma.conversation.findFirst({
            where: { id, clinicId },
        });
        if (!conv) {
            throw new Error(
                `Conversation ${id} not found or does not belong to clinic ${clinicId}`
            );
        }

        const shouldResetHuman =
            resetHumanIfClient &&
            conv.status === ConversationStatus.HUMANO &&
            author === MessageAuthor.CLIENTE;

        return prisma.conversation.update({
            where: { id },
            data: {
                lastMessageAuthor: author,
                lastMessageAt: new Date(),
                bufferStartedAt: new Date(),
                ...(shouldResetHuman ? { status: ConversationStatus.NORMAL } : {}),
            },
        });
    },

    /**
     * Marca a última mensagem processada para controle de dedup.
     */
    async setLastProcessedMessage(
        clinicId: string,
        id: string,
        messageId: string
    ): Promise<Conversation> {
        const conv = await prisma.conversation.findFirst({
            where: { id, clinicId },
        });
        if (!conv) {
            throw new Error(
                `Conversation ${id} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.conversation.update({
            where: { id },
            data: {
                lastProcessedMessageId: messageId,
                status: ConversationStatus.NORMAL,
                bufferStartedAt: null,
            },
        });
    },

    /**
     * Marca conversa com status ERRO.
     */
    async markError(clinicId: string, id: string): Promise<Conversation> {
        const conv = await prisma.conversation.findFirst({
            where: { id, clinicId },
        });
        if (!conv) {
            throw new Error(
                `Conversation ${id} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.conversation.update({
            where: { id },
            data: { status: ConversationStatus.ERRO },
        });
    },

    /**
     * Atualiza o estado da conversa (IDLE | SCHEDULING).
     */
    async setState(
        clinicId: string,
        id: string,
        state: string
    ): Promise<Conversation> {
        return prisma.conversation.update({
            where: { id, clinicId },
            data: { state },
        });
    },

    /**
     * Persiste as últimas opções de slots oferecidas ao paciente.
     */
    async setLastOfferedSlots(
        clinicId: string,
        id: string,
        slots: string[]
    ): Promise<Conversation> {
        return prisma.conversation.update({
            where: { id, clinicId },
            data: { lastOfferedSlots: slots },
        });
    },

    /**
     * Decrementa o cooldown de oferta de agenda apenas se for um turno novo.
     * Operação ATÔMICA para evitar problemas com retries concorrentes.
     */
    async decrementCooldownIfNewTurn(
        clinicId: string,
        id: string,
        messageId: string
    ): Promise<void> {
        await prisma.conversation.updateMany({
            where: {
                id,
                clinicId,
                agendaOfferCooldown: { gt: 0 },
                AND: [
                    {
                        OR: [
                            { lastCooldownConsumedMessageId: null },
                            { lastCooldownConsumedMessageId: { not: messageId } }
                        ]
                    }
                ]
            },
            data: {
                agendaOfferCooldown: { decrement: 1 },
                lastCooldownConsumedMessageId: messageId
            }
        });
    },

    /**
     * Define o cooldown de oferta de agenda.
     */
    async setAgendaOfferCooldown(
        clinicId: string,
        id: string,
        value: number
    ): Promise<Conversation> {
        return prisma.conversation.update({
            where: { id, clinicId },
            data: { agendaOfferCooldown: value },
        });
    },

    /**
     * Lista conversas da clínica com filtro por status e paginação.
     * Sempre filtra por clinicId — nunca vaza dados entre clínicas.
     */
    async list(
        clinicId: string,
        options: ListConversationsOptions = {}
    ): Promise<{ data: Conversation[]; total: number }> {
        const page = options.page ?? 1;
        const pageSize = options.pageSize ?? 50;
        const skip = (page - 1) * pageSize;

        const where = {
            clinicId,
            ...(options.status ? { status: options.status } : {}),
        };

        const [data, total] = await prisma.$transaction([
            prisma.conversation.findMany({
                where,
                orderBy: { lastMessageAt: "desc" },
                skip,
                take: pageSize,
                include: { contact: true },
            }),
            prisma.conversation.count({ where }),
        ]);

        return { data, total };
    },
};
