
import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("--- CLINICS ---");
    const clinics = await prisma.clinic.findMany();
    console.log(JSON.stringify(clinics, null, 2));

    for (const clinic of clinics) {
        console.log(`\n--- APPOINTMENTS FOR ${clinic.nomeClinica} (${clinic.id}) ---`);
        const appointments = await prisma.appointment.findMany({
            where: { clinicId: clinic.id },
            include: { contact: true },
            orderBy: { createdAt: "desc" },
        });
        console.log(JSON.stringify(appointments, null, 2));

        console.log(`\n--- LOGS FOR ${clinic.nomeClinica} (${clinic.id}) (LAST 50) ---`);
        const logs = await prisma.log.findMany({
            where: { clinicId: clinic.id },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        console.log(JSON.stringify(logs, null, 2));

        console.log(`\n--- MESSAGES FOR ${clinic.nomeClinica} (${clinic.id}) (LAST 20) ---`);
        const messages = await prisma.message.findMany({
            where: { clinicId: clinic.id },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
        console.log(JSON.stringify(messages, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
