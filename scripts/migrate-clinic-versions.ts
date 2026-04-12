import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Iniciando migração de versões históricas de clínicas...");

    const clinics = await prisma.clinic.findMany();

    if (clinics.length === 0) {
        console.log("⚠️ Nenhuma clínica encontrada para migrar.");
        return;
    }

    for (const clinic of clinics) {
        console.log(`📦 Processando clínica: ${clinic.nomeClinica} (${clinic.id})`);

        // Tentar extrair FAQ e Regras de strings serializadas (se existirem)
        let faq: any = null;
        let regras: any = null;

        try {
            if (clinic.faq) faq = JSON.parse(clinic.faq);
        } catch (e) {
            console.warn(`   - Erro ao parsear FAQ para ${clinic.id}, usando raw string.`);
            faq = clinic.faq;
        }

        try {
            if (clinic.regrasPersonalizadas) regras = JSON.parse(clinic.regrasPersonalizadas);
        } catch (e) {
            console.warn(`   - Erro ao parsear Regras para ${clinic.id}, usando raw string.`);
            regras = clinic.regrasPersonalizadas;
        }

        // Criar a primeira versão histórica
        // effectiveFrom = clinic.createdAt
        await prisma.clinicContextVersion.upsert({
            where: {
                clinicId_effectiveFrom: {
                    clinicId: clinic.id,
                    effectiveFrom: clinic.createdAt,
                }
            },
            update: {}, // Não sobrescrever se já existir
            create: {
                clinicId: clinic.id,
                effectiveFrom: clinic.createdAt,
                nomeAssistente: clinic.nomeAssistente,
                nomeMedico: clinic.nomeMedico,
                nomeClinica: clinic.nomeClinica,
                endereco: clinic.endereco,
                consultaValor: clinic.consultaValor,
                consultaDuracao: clinic.consultaDuracao,
                descricaoServicos: clinic.descricaoServicos,
                faq,
                regrasPersonalizadas: regras,
            }
        });

        console.log(`   ✅ Versão inicial criada para ${clinic.nomeClinica}`);
    }

    console.log("✨ Migração concluída com sucesso!");
}

main()
    .catch((e) => {
        console.error("❌ Erro durante a migração:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
