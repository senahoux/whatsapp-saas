import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearPending() {
    try {
        console.log("Conectando ao banco para limpar pendências...");
        const resultROBO = await prisma.message.updateMany({
            where: {
                author: 'ROBO',
                processed: false
            },
            data: {
                processed: true
            }
        });
        const resultSISTEMA = await prisma.message.updateMany({
            where: {
                author: 'SISTEMA',
                processed: false
            },
            data: {
                processed: true
            }
        });
        console.log(`✅ Sucesso! ${resultROBO.count} mensagens do ROBO e ${resultSISTEMA.count} do SISTEMA pendentes/lixão foram marcadas como processadas.`);
    } catch (e) {
        console.error("Erro ao limpar:", e);
    } finally {
        await prisma.$disconnect();
    }
}

clearPending();
