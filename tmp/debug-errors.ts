import { prisma } from "../src/lib/prisma";

async function debugErrors() {
    const clinicId = "clinic-demo-id";
    console.log(`\n--- ÚLTIMOS ERROS ---\n`);

    const logs = await prisma.log.findMany({
        where: { clinicId, level: "ERROR" },
        orderBy: { createdAt: "desc" },
        take: 10
    });

    logs.forEach(log => {
        console.log(`[${log.createdAt.toISOString()}] ${log.event}`);
        console.log(`   Details: ${log.details}`);
        console.log("-".repeat(50));
    });

    console.log("\n--- FIM ---");
}

debugErrors().catch(console.error);
