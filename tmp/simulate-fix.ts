
import { prisma } from "../src/lib/prisma";

const BASE_URL = "http://localhost:3000/api";
const CLINIC_ID = "clinic-demo-id";
const CONTACT_ID = "cmn4zfx610003ih04u9u4v6o7";
const CONVERSATION_ID = "cmn4zfx8f0005ih04zc11l8dk";

async function simulateMessage(content: string) {
    console.log(`\n--- SIMULATING MESSAGE: "${content}" ---`);

    // 1. Inserir mensagem no banco como vinda do CLIENTE
    await prisma.message.create({
        data: {
            clinicId: CLINIC_ID,
            conversationId: CONVERSATION_ID,
            content,
            author: "CLIENTE",
            messageType: "TEXT",
            externalMessageId: `sim_${Date.now()}`
        }
    });

    // 2. Marcar conversa como AGUARDANDO_IA
    await prisma.conversation.update({
        where: { id: CONVERSATION_ID },
        data: {
            status: "AGUARDANDO_IA",
            lastMessageAt: new Date()
        }
    });

    console.log("Waiting 9s for debounce...");
    await new Promise(r => setTimeout(r, 9000));

    // 3. Chamar o process-conversation
    try {
        const resp = await fetch(`${BASE_URL}/process-conversation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                clinicId: CLINIC_ID,
                conversationId: CONVERSATION_ID
            })
        });
        const data = await resp.json();
        console.log("Response:", data);
    } catch (e: any) {
        console.error("Error call:", e.message);
    }
}

async function main() {
    // Cenário 1: Pergunta informativa (Não deve agendar)
    await simulateMessage("Queria saber como agendar");
    const scenarios = [
        "Queria saber como agendar",
        "Meu nome é Lucas Silva",
        "Tem outro horário mais tarde?",
        "O de 10:00 é presencial?", // AI might try to book here, should be blocked if it does
        "Sim, pode marcar para as 10:00 então." // Should finally book
    ];

    for (const message of scenarios) {
        await simulateMessage(message);
        await new Promise(r => setTimeout(r, 8500)); // Espera debounce entre as mensagens
    }

    console.log("\n--- SIMULATION FINISHED ---");
}

main().catch(console.error).finally(async () => {
    await prisma.$disconnect();
});
