const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function triggerOrchestrator(clinicId, conversationId) {
    const res = await fetch("http://localhost:3000/api/process-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, conversationId })
    });
    return await res.json();
}

async function sendSimulatedMessage(clinicId, conversationId, text) {
    const extId = "sim_" + Date.now();
    await prisma.message.create({
        data: {
            clinicId,
            conversationId,
            author: "CLIENTE",
            content: text,
            messageType: "TEXT",
            externalMessageId: extId,
            sentAt: new Date()
        }
    });

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: "AGUARDANDO_IA" }
    });

    await triggerOrchestrator(clinicId, conversationId);
}

async function getLastRobotMessage(clinicId, conversationId) {
    const msgs = await prisma.message.findMany({
        where: { clinicId, conversationId, author: "ROBO" },
        orderBy: { createdAt: 'desc' },
        take: 1
    });
    return msgs.length > 0 ? msgs[0].content : null;
}

async function main() {
    console.log("========= INICIANDO TESTES INTEGRAIS ==========");
    const clinicId = "clinic-demo-id";
    const testPhone = "5511999991234";

    let contact = await prisma.contact.findFirst({ where: { clinicId, phoneNumber: testPhone } });
    if (!contact) {
        contact = await prisma.contact.create({ data: { clinicId, phoneNumber: testPhone, name: "Teste Integrado" } });
    }

    let convo = await prisma.conversation.findFirst({ where: { clinicId, contactId: contact.id } });
    if (!convo) {
        convo = await prisma.conversation.create({ data: { clinicId, contactId: contact.id, status: "AGUARDANDO_IA" } });
    } else {
        await prisma.conversation.update({ where: { id: convo.id }, data: { status: "AGUARDANDO_IA" }});
    }

    const cId = convo.id;

    console.log("-> TESTE A: 'Gostaria de agendar uma consulta'");
    await sendSimulatedMessage(clinicId, cId, "Gostaria de agendar uma consulta");
    let roboMsg = await getLastRobotMessage(clinicId, cId);
    console.log("ROBO: ", roboMsg);

    console.log("-> TESTE A.1: 'sim'");
    await sendSimulatedMessage(clinicId, cId, "sim");
    roboMsg = await getLastRobotMessage(clinicId, cId);
    console.log("ROBO: ", roboMsg);

    const checkConvo = await prisma.conversation.findUnique({ where: { id: cId } });
    console.log("CONVO STATUS:", checkConvo.status);
    console.log("OFFERS GERADOS:", checkConvo.lastOfferedSlots);

    console.log("-> TESTE B: 'prefiro quarta à tarde'");
    await sendSimulatedMessage(clinicId, cId, "prefiro quarta à tarde");
    roboMsg = await getLastRobotMessage(clinicId, cId);
    console.log("ROBO: ", roboMsg);

    const checkConvo2 = await prisma.conversation.findUnique({ where: { id: cId } });
    console.log("OFFERS APOS TESTE B:", checkConvo2.lastOfferedSlots);

    console.log("-> TESTE C: 'esse mais tarde por favor'");
    await sendSimulatedMessage(clinicId, cId, "esse mais tarde por favor");
    roboMsg = await getLastRobotMessage(clinicId, cId);
    console.log("ROBO: ", roboMsg);

    console.log("-> TESTE D: SLOT FANTASMA 'quero 3h da manha de domingo'");
    await sendSimulatedMessage(clinicId, cId, "quero 3h da manha de domingo");
    roboMsg = await getLastRobotMessage(clinicId, cId);
    console.log("ROBO: ", roboMsg);

    console.log("-> TESTE G: CONTINUIDADE (multiplas curtas)");
    await sendSimulatedMessage(clinicId, cId, "alias");
    await sendSimulatedMessage(clinicId, cId, "so pra confirmar");
    roboMsg = await getLastRobotMessage(clinicId, cId);
    console.log("ROBO (Apos multiplas msgs): ", roboMsg);

    process.exit(0);
}

main().catch(console.error);
