import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function alignTenant() {
    console.log('--- ALINHAMENTO DE TENANT (OPÇÃO A) ---');

    const email = 'admin@exemplo.com';
    const targetClinicId = 'clinic-demo-id';

    // 1. Renomeia a clínica demo para um nome profissional
    await prisma.clinic.update({
        where: { id: targetClinicId },
        data: {
            nomeClinica: 'Clínica Demo',
            nomeMedico: 'Médico Responsável'
        }
    });
    console.log(`[+] Clínica ${targetClinicId} renomeada para 'Clínica Demo'.`);

    // 2. Vincula o usuário admin ao tenant operacional
    const user = await prisma.user.findFirst({
        where: { email }
    });

    if (user) {
        await prisma.user.update({
            where: { id: user.id },
            data: { clinicId: targetClinicId }
        });
        console.log(`[+] Usuário ${email} agora vinculado ao tenant ${targetClinicId}.`);
    } else {
        console.error(`[-] Usuário ${email} não encontrado.`);
    }

    console.log('--- ALINHAMENTO CONCLUÍDO ---');
}

alignTenant()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
