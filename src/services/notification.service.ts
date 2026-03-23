/**
 * NotificationService (Step 4 — criação de notificações)
 *
 * Cria notificações no banco isoladas por clinicId.
 * O envio real via WhatsApp (robô) é implementado no Passo 5.
 *
 * Tipos de notificação:
 * - NOVO_AGENDAMENTO, LEAD_QUENTE, INTERVENCAO_HUMANA, REVISAO_IA, ALERTA
 */

import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/lib/types";

export const NotificationService = {
    /**
     * Cria uma notificação vinculada à clínica.
     * sent=false por padrão — o robô consumirá e enviará ao ADMIN (Passo 5).
     */
    async create(
        clinicId: string,
        type: string,
        message: string,
        contactId?: string | null,
    ) {
        return prisma.notification.create({
            data: {
                clinicId,
                type,
                message,
                contactId: contactId ?? null,
                sent: false,
            },
        });
    },

    /** Notificação de intervenção humana urgente */
    async notifyHumanUrgent(
        clinicId: string,
        contactId: string,
        mensagem: string,
    ) {
        return NotificationService.create(
            clinicId,
            NotificationType.INTERVENCAO_HUMANA,
            `🚨 URGENTE: Intervenção humana necessária.\nMensagem do paciente: "${mensagem}"`,
            contactId,
        );
    },

    /** Notificação de lead quente */
    async notifyHotLead(clinicId: string, contactId: string, nome: string | null) {
        return NotificationService.create(
            clinicId,
            NotificationType.LEAD_QUENTE,
            `🔥 Lead quente detectado: ${nome ?? "Paciente desconhecido"}. Verifique a conversa.`,
            contactId,
        );
    },

    /** Notificação de revisão de resposta da IA (modo ASSISTENTE) */
    async notifyAIReview(clinicId: string, contactId: string, preview: string) {
        return NotificationService.create(
            clinicId,
            NotificationType.REVISAO_IA,
            `👁️ Resposta pendente de revisão:\n"${preview.slice(0, 120)}..."`,
            contactId,
        );
    },

    /** Notificação genérica de alerta */
    async notifyAlert(clinicId: string, message: string, contactId?: string) {
        return NotificationService.create(
            clinicId,
            NotificationType.ALERTA,
            `⚠️ ${message}`,
            contactId,
        );
    },

    /**
     * Lista notificações não enviadas de uma clínica.
     * Usado pelo endpoint de polling do robô (Passo 5).
     */
    async getPendingNotifications(clinicId: string, limit = 10) {
        return prisma.notification.findMany({
            where: { clinicId, sent: false },
            orderBy: { createdAt: "asc" },
            take: limit,
        });
    },

    /** Marca notificação como enviada */
    async markSent(clinicId: string, notificationId: string) {
        const notification = await prisma.notification.findFirst({
            where: { id: notificationId, clinicId },
        });
        if (!notification) {
            throw new Error(
                `Notification ${notificationId} not found or does not belong to clinic ${clinicId}`,
            );
        }
        return prisma.notification.update({
            where: { id: notificationId },
            data: { sent: true, sentAt: new Date() },
        });
    },

    /**
     * Lista notificações de uma clínica (para o painel admin).
     */
    async list(clinicId: string, options: { page?: number; pageSize?: number } = {}) {
        const page = options.page ?? 1;
        const pageSize = options.pageSize ?? 50;
        const skip = (page - 1) * pageSize;

        const where = { clinicId };

        const [data, total] = await prisma.$transaction([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: pageSize,
                include: { contact: { select: { name: true, phoneNumber: true } } }
            }),
            prisma.notification.count({ where }),
        ]);

        return { data, total };
    },
};
