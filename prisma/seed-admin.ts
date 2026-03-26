import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derivedKey}`;
}

async function main() {
    console.log('--- Iniciando Seed Admin ---');

    // Exige variáveis explícitas para não injetar lixo nem vulnerabilidades silenciosas no DB
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    const clinicId = process.env.SEED_CLINIC_ID || process.env.CLINIC_ID;

    if (!email || !password || !clinicId) {
        throw new Error(
            'FALHA DE SEGURANÇA NO SEED: Defina explicitamente no .env as variáveis ' +
            'SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD e SEED_CLINIC_ID (ou CLINIC_ID) para rodar a injeção inicial.'
        );
    }

    console.log(`[+] E-mail alvo: ${email}`);
    console.log(`[+] Clinic ID alvo: ${clinicId}`);

    let clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });

    if (!clinic) {
        console.log(`[-] Clínica ${clinicId} não existe. Criando gerador inicial.`);
        clinic = await prisma.clinic.create({
            data: {
                id: clinicId,
                nomeClinica: 'Clínica Demo SaaS',
                nomeMedico: 'Sistema',
            }
        });
    }

    const existingUser = await prisma.user.findFirst({
        where: { email, clinicId }
    });

    if (existingUser) {
        console.log('[*] Usuário já existe, atualizando senha de acesso.');
        await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                passwordHash: hashPassword(password),
                role: 'ADMIN'
            }
        });
        console.log('[+] Senha atualizada com sucesso!');
    } else {
        console.log('[*] Criando novo usuário admin...');
        await prisma.user.create({
            data: {
                email,
                clinicId,
                passwordHash: hashPassword(password),
                role: 'ADMIN'
            }
        });
        console.log('[+] Usuário criado de froma relacional com sucesso!');
    }

    console.log('--- Fim do Seed ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
