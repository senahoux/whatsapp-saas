
import { prisma } from "../src/lib/prisma";

async function main() {
    const clinicId = "clinic-demo-id";

    console.log(`--- LAST 500 LOGS FOR ${clinicId} ---`);
    const logs = await prisma.log.findMany({
        where: {
            clinicId,
        },
        orderBy: { createdAt: "desc" },
        take: 500
    });
    console.log(JSON.stringify(logs, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
