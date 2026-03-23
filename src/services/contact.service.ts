/**
 * ContactService — WhatsApp SaaS
 *
 * REGRA FUNDAMENTAL: clinicId é SEMPRE o primeiro parâmetro de todo método.
 * Nenhuma query neste service acessa dados fora do clinicId informado.
 *
 * Responsabilidades:
 * - Criar contato (upsert por phoneNumber dentro da clínica)
 * - Buscar contato por telefone
 * - Buscar contato por id
 * - Atualizar nome, isHotLead, notes
 * - Marcar como admin
 * - Listar contatos da clínica (com paginação simples)
 */

import { prisma } from "@/lib/prisma";
import type { Contact } from "@prisma/client";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface UpsertContactInput {
    phoneNumber: string;
    name?: string;
    isAdmin?: boolean;
}

export interface UpdateContactInput {
    name?: string;
    isHotLead?: boolean;
    notes?: string;
    isAdmin?: boolean;
}

export interface ListContactsOptions {
    page?: number;       // 1-indexed (default: 1)
    pageSize?: number;   // default: 50
    onlyHotLeads?: boolean;
    status?: string;     // Filtrar por status da conversa (ASSISTENTE, HUMANO, etc.)
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export const ContactService = {
    /**
     * Cria ou retorna um contato existente pelo telefone dentro da clínica.
     * Se já existir, atualiza apenas o nome caso fornecido e o conta não tiver nome ainda.
     * clinicId é a fronteira de isolamento — garante que dois clientes com
     * o mesmo número de telefone sejam tratados como contatos distintos.
     */
    async upsert(clinicId: string, input: UpsertContactInput): Promise<Contact> {
        const existing = await prisma.contact.findUnique({
            where: {
                clinicId_phoneNumber: {
                    clinicId,
                    phoneNumber: input.phoneNumber,
                },
            },
        });

        if (existing) {
            // Atualiza nome apenas se o contato ainda não tem nome e um foi fornecido
            if (input.name && !existing.name) {
                return prisma.contact.update({
                    where: { id: existing.id },
                    data: { name: input.name },
                });
            }
            return existing;
        }

        return prisma.contact.create({
            data: {
                clinicId,
                phoneNumber: input.phoneNumber,
                name: input.name ?? null,
                isAdmin: input.isAdmin ?? false,
            },
        });
    },

    /**
     * Busca contato pelo número de telefone dentro da clínica.
     * Retorna null se não existir.
     */
    async findByPhone(
        clinicId: string,
        phoneNumber: string
    ): Promise<Contact | null> {
        return prisma.contact.findUnique({
            where: {
                clinicId_phoneNumber: {
                    clinicId,
                    phoneNumber,
                },
            },
        });
    },

    /**
     * Busca contato pelo id, com validação de clinicId (segurança multi-tenant).
     * Lança erro se o contato pertencer a outra clínica.
     */
    async findById(clinicId: string, id: string): Promise<Contact | null> {
        return prisma.contact.findFirst({
            where: { id, clinicId },
        });
    },

    /**
     * Atualiza campos permitidos do contato.
     * Requer clinicId para garantir que apenas contatos daquela clínica sejam alterados.
     */
    async update(
        clinicId: string,
        id: string,
        data: UpdateContactInput
    ): Promise<Contact> {
        // Confirma que o contato pertence à clínica antes de atualizar
        const contact = await prisma.contact.findFirst({
            where: { id, clinicId },
        });
        if (!contact) {
            throw new Error(
                `Contact ${id} not found or does not belong to clinic ${clinicId}`
            );
        }

        return prisma.contact.update({
            where: { id },
            data,
        });
    },

    /**
     * Salva o nome identificado pela IA em uma conversa.
     * Só atualiza se o contato ainda não tiver nome.
     */
    async saveName(
        clinicId: string,
        id: string,
        name: string
    ): Promise<Contact> {
        const contact = await prisma.contact.findFirst({
            where: { id, clinicId },
        });
        if (!contact) {
            throw new Error(
                `Contact ${id} not found or does not belong to clinic ${clinicId}`
            );
        }
        if (contact.name) return contact; // já tem nome, não sobrescreve

        return prisma.contact.update({
            where: { id },
            data: { name },
        });
    },

    /**
     * Marca ou desmarca contato como hot lead.
     */
    async setHotLead(
        clinicId: string,
        id: string,
        isHotLead: boolean
    ): Promise<Contact> {
        const contact = await prisma.contact.findFirst({
            where: { id, clinicId },
        });
        if (!contact) {
            throw new Error(
                `Contact ${id} not found or does not belong to clinic ${clinicId}`
            );
        }
        return prisma.contact.update({
            where: { id },
            data: { isHotLead },
        });
    },

    /**
     * Verifica se o número é o ADMIN da clínica.
     * ADMIN nunca deve entrar na IA nem na automação.
     */
    async isAdmin(clinicId: string, phoneNumber: string): Promise<boolean> {
        const contact = await prisma.contact.findUnique({
            where: {
                clinicId_phoneNumber: {
                    clinicId,
                    phoneNumber,
                },
            },
            select: { isAdmin: true },
        });
        return contact?.isAdmin ?? false;
    },

    /**
     * Lista contatos da clínica com paginação simples.
     * Sempre filtra por clinicId — nunca retorna dados de outra clínica.
     */
    async list(
        clinicId: string,
        options: ListContactsOptions = {}
    ): Promise<{ data: Contact[]; total: number }> {
        const page = options.page ?? 1;
        const pageSize = options.pageSize ?? 50;
        const skip = (page - 1) * pageSize;

        const where: any = {
            clinicId,
            ...(options.onlyHotLeads ? { isHotLead: true } : {}),
            ...(options.status ? { conversations: { some: { status: options.status } } } : {}),
        };

        const [data, total] = await prisma.$transaction([
            prisma.contact.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: pageSize,
            }),
            prisma.contact.count({ where }),
        ]);

        return { data, total };
    },
};
