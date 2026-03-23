/**
 * ReminderService — WhatsApp SaaS
 * 
 * Lógica para processamento de lembretes ativos (Push D-1).
 * Implementado conforme os requisitos de atomicidade e multi-tenancy.
 */

import { prisma } from "@/lib/prisma";
import { AppointmentStatus, MessageAuthor, LogEvent, NotificationType } from "@/lib/types";
import { MessageService } from "./message.service";
import { LogService } from "./log.service";
import { NotificationService } from "./notification.service";
import { ProviderInst } from "@/providers/uazapi.provider";

export const ReminderService = {
    /**
     * Identifica as clínicas elegíveis para lembretes (robotEnabled = true).
     */
    async getEligibleClinics(): Promise<string[]> {
        const settings = await prisma.setting.findMany({
            where: { robotEnabled: true },
            select: { clinicId: true }
        });
        return settings.map(s => s.clinicId);
    },

    /**
     * Processa lembretes de uma clínica específica para o dia seguinte.
     */
    async processClinicReminders(clinicId: string): Promise<{ total: number; success: number; skipped: number }> {
        // 1. Calcula a data de amanhã (YYYY-MM-DD)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split("T")[0];

        // 2. Busca agendamentos elegíveis que ainda não receberam lembrete
        const appointments = await prisma.appointment.findMany({
            where: {
                clinicId,
                date: dateStr,
                status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.REMARCADO] },
                reminderSentAt: null,
            },
            include: {
                contact: { select: { name: true, phoneNumber: true } },
                clinic: { select: { nomeClinica: true, endereco: true } }
            }
        }) as any[];

        let successCount = 0;
        let skippedCount = 0;

        for (const appt of appointments) {
            // 3. Blindagem Atômica: Tenta "reservar" o envio no banco
            const updateResult = await prisma.appointment.updateMany({
                where: {
                    id: appt.id,
                    reminderSentAt: null // Garantia dupla
                },
                data: { reminderSentAt: new Date() }
            });

            if (updateResult.count === 0) {
                skippedCount++;
                continue; // Já enviado por outra thread ou processo
            }

            // 4. Monta o template determinístico (Sem IA)
            const hourStr = appt.time;
            const patientName = appt.contact?.name || "Paciente";
            const clinicName = appt.clinic.nomeClinica;
            const local = appt.clinic.endereco || "Clínica";
            const tipo = appt.type || "consulta";

            const message = `Olá, ${patientName}! 👋\n\nConfirmamos sua ${tipo.toLowerCase()} amanhã às ${hourStr} na ${clinicName}.\n📍 Endereço: ${local}.\n\nPara o seu melhor atendimento, solicitamos chegar com 10 minutos de antecedência. Até lá!`;

            // 5. Envia via Provider
            const phone = appt.contact?.phoneNumber;
            if (!phone) {
                skippedCount++;
                continue;
            }

            const sendSuccess = await ProviderInst.sendMessage(clinicId, phone, message);

            if (sendSuccess) {
                successCount++;
                // 6. Persiste no histórico de mensagens da conversa (Opcional, mas bom para histórico)
                // Buscamos ou criamos a conversa ativa para o registro
                const conversation = await prisma.conversation.findFirst({
                    where: { clinicId, contactId: appt.contactId },
                    orderBy: { updatedAt: "desc" }
                });

                if (conversation) {
                    await MessageService.create(clinicId, {
                        conversationId: conversation.id,
                        content: message,
                        author: MessageAuthor.SISTEMA,
                        processed: true,
                        sentAt: new Date()
                    });
                }

                // Log de Sucesso
                await LogService.info(clinicId, LogEvent.NOTIFICATION_SENT, {
                    action: "REMINDER_SENT",
                    appointmentId: appt.id,
                    patient: phone
                });
            } else {
                // Falha no Provedor: Gerar Alerta no Dashboard
                await LogService.error(clinicId, LogEvent.ERROR, {
                    action: "REMINDER_SEND_FAILED",
                    appointmentId: appt.id,
                    error: "WhatsApp provider failure"
                });

                await NotificationService.create(
                    clinicId,
                    NotificationType.ALERTA,
                    `🚨 Falha ao enviar lembrete para ${patientName} (${phone}). Verifique a conexão com o WhatsApp.`
                );
            }
        }

        return { total: appointments.length, success: successCount, skipped: skippedCount };
    }
};
