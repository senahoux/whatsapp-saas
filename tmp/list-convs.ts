
import { prisma } from "../src/lib/prisma";

async function main() {
    const convs = await prisma.conversation.findMany({
        take: 5,
        include: { contact: true }
    });
    console.log(JSON.stringify(convs, null, 2));
}

main().finally(() => prisma.$disconnect());
