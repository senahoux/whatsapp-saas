
import { prisma } from "../src/lib/prisma";

async function main() {
    const clinicId = "clinic-demo-id";
    const start = new Date("2026-03-27T18:30:00Z");
    const end = new Date("2026-03-27T19:00:00Z");

    console.log(`--- LOGS FOR ${clinicId} (18:30 - 19:00) ---`);
    const logs = await prisma.log.findMany({
        where: {
            clinicId,
            createdAt: {
                gte: start,
                lte: end
            }
        },
        orderBy: { createdAt: "asc" },
    });
    console.log(JSON.stringify(logs, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
