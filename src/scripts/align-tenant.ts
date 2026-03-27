import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function alignTenant() {
    console.log('--- ALINHAMENTO DE TENANT (OPÇÃO A) ---');

    const email = 'lucasaraujosena@gmail.com';
    const targetClinicId = 'clinic-demo-id';

    // 1. Renomeia a clínica demo para um nome profissional
    await prisma.clinic.update({
        where: { id: targetClinicId },
        data: {
            nomeClinica: 'Dr. Lucas Sena',
            nomeMedico: 'Dr. Lucas Sena'
        }
    });
    console.log(`[+] Clínica ${targetClinicId} renomeada para 'Dr. Lucas Sena'.`);

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
