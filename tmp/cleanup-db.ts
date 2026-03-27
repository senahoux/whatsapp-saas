
import { prisma } from "../src/lib/prisma";

async function main() {
    const clinicId = "clinic-demo-id";
    // We saw these contacts had many fake appointments
    const contactIds = [
        "cmn4zfx610003ih04u9u4v6o7", // 5519999938883
        "cmn9auuys0003jv04fgswdx3a"  // 5519974031213
    ];

    console.log(`--- CLEANING APPOINTMENTS FOR CLINIC ${clinicId} ---`);

    const deleted = await prisma.appointment.deleteMany({
        where: {
            clinicId,
            contactId: { in: contactIds },
            source: "ROBO",
            status: "AGENDADO"
        }
    });

    console.log(`Deleted ${deleted.count} fake appointments.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
