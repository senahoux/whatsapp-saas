import { prisma } from "../src/lib/prisma";

async function debug() {
    const clinicId = "clinic-demo-id";
    console.log(`\n--- LOGS RECENTES (Últimos 20) ---\n`);

    const logs = await prisma.log.findMany({
        where: { clinicId },
        orderBy: { createdAt: "desc" },
        take: 20
    });

    for (const log of logs) {
        console.log(`[${log.createdAt.toISOString()}] ${log.level} | ${log.event}`);
        if (log.details) {
            try {
                const details = JSON.parse(log.details);
                console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
            } catch {
                console.log(`   Details (raw): ${log.details}`);
            }
        }
        console.log("-".repeat(50));
    }

    console.log("\n--- FIM ---");
}

debug().catch(console.error);
