import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const clinicId = process.env.CLINIC_ID || "clinic-demo-id";
    const instanceName = "drsena";

    console.log(`[Fix] Configurando whatsappInstance='${instanceName}' para a clínica '${clinicId}'...`);

    try {
        const setting = await prisma.setting.upsert({
            where: { clinicId: clinicId },
            update: { whatsappInstance: instanceName },
            create: {
                clinicId: clinicId,
                whatsappInstance: instanceName,
                robotEnabled: true,
                robotModeDefault: "AUTO"
            }
        });

        console.log(`[Fix] Sucesso! Detalhes do setting:`, setting);
    } catch (error) {
        console.error(`[Fix] Erro ao atualizar settings:`, error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
