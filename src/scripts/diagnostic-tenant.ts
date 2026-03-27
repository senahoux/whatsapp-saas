import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

const TEST_NUMBERS = [
    '5519998868883',
    '19998868883',
    '998868883',
    '5519996068411',
    '19996068411',
    '996068411'
];

async function diagnostic() {
    let report = '--- DIAGNÓSTICO DE CONSISTÊNCIA MULTI-TENANT (ALVOS ESPECÍFICOS) ---\n';

    // 1. Clinic ID da Sessão Admin (Último usuário logado/criado)
    const firstUser = await prisma.user.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { clinic: true }
    });
    report += `\n[ADMIN SESSION]\nClinic ID: ${firstUser?.clinicId} (${firstUser?.clinic.nomeClinica || 'N/A'})\n`;

    report += `\n[TARGET NUMBERS AUDIT]\n`;

    for (const phone of TEST_NUMBERS) {
        const contacts = await prisma.contact.findMany({
            where: { phoneNumber: { contains: phone.replace(/\D/g, '') } }
        });

        if (contacts.length === 0) continue;

        for (const contact of contacts) {
            report += `\nNúmero: ${contact.phoneNumber} (Clinic: ${contact.clinicId})`;

            const convs = await prisma.conversation.count({ where: { contactId: contact.id } });
            const msgs = await prisma.message.count({ where: { clinicId: contact.clinicId, content: { contains: contact.phoneNumber } } }); // Approximation for logs/messages
            const appts = await prisma.appointment.count({ where: { contactId: contact.id } });
            const logs = await prisma.log.findMany({
                where: { clinicId: contact.clinicId },
                take: 5,
                orderBy: { createdAt: 'desc' }
            });

            report += `\n  - Conversas: ${convs}`;
            report += `\n  - Agendamentos: ${appts}`;
            report += `\n  - Mensagens (Total na Clínica): ${await prisma.message.count({ where: { clinicId: contact.clinicId } })}`;
            report += `\n  - Logs Recentes na Clínica (${contact.clinicId}): ${logs.length}`;
            if (logs.length > 0) {
                report += `\n    Ex: ${logs[0].event} - ${logs[0].details?.substring(0, 100)}`;
            }
            report += '\n';
        }
    }

    // Check for "Orphan" logs or messages that might be using a generic ID
    const demoLogs = await prisma.log.count({ where: { clinicId: 'clinic-demo-id' } });
    const demoMessages = await prisma.message.count({ where: { clinicId: 'clinic-demo-id' } });

    report += `\n[GENERAL LEAKS Check]`;
    report += `\nclinic-demo-id Logs: ${demoLogs}`;
    report += `\nclinic-demo-id Messages: ${demoMessages}`;

    fs.writeFileSync('/tmp/tenant-audit-v2.txt', report);
    console.log('Report saved to /tmp/tenant-audit-v2.txt');
}

diagnostic()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
