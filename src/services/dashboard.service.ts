/**
 * DashboardService — WhatsApp SaaS
 *
 * Encapsula consultas de agregação e estatísticas para o painel Admin.
 * REGRA FUNDAMENTAL: clinicId é SEMPRE o primeiro parâmetro de todo método.
 */

import { prisma } from "@/lib/prisma";
import { ConversationStatus, AppointmentStatus, DashboardStats } from "@/lib/types";

export const DashboardService = {
    /**
     * Retorna estatísticas agregadas isoladas pelo clinicId.
     */
    async getStats(clinicId: string): Promise<DashboardStats> {
        const today = new Date().toISOString().split("T")[0];

        const [
            conversasAtivas,
            intervencoesHumanas,
            agendamentosConfirmadosHoje,
            leadsQuentes,
        ] = await Promise.all([
            // Conversas aguardando IA ou em erro/pausadas
            prisma.conversation.count({
                where: {
                    clinicId,
                    status: { in: [ConversationStatus.AGUARDANDO_IA, ConversationStatus.ERRO] },
                },
            }),
            // Intervenções aguardando humano
            prisma.conversation.count({
                where: {
                    clinicId,
                    status: ConversationStatus.HUMANO,
                },
            }),
            // Agendamentos de hoje
            prisma.appointment.count({
                where: {
                    clinicId,
                    status: AppointmentStatus.AGENDADO,
                    date: today,
                },
            }),
            // Contatos marcados como hot lead
            prisma.contact.count({
                where: {
                    clinicId,
                    isHotLead: true,
                },
            }),
        ]);

        return {
            conversasAtivas,
            intervencoesHumanas,
            agendamentosConfirmadosHoje,
            leadsQuentes,
        };
    },
};
