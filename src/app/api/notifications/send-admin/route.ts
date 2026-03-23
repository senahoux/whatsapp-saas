import { NextRequest, NextResponse } from "next/server";
import { NotificationService } from "@/services/notification.service";
import { ClinicService } from "@/services/clinic.service";
import { LogService } from "@/services/log.service";
import { LogEvent } from "@/lib/types";

/**
 * GET /api/notifications/send-admin
 *
 * Endpoint de varredura (polling) do robô para buscar notificações
 * não enviadas que devem ser alertadas ao ADMIN no WhatsApp.
 * Retorna as notificações pendentes.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get("clinicId");

    if (!clinicId) {
        return NextResponse.json({ error: "clinicId is required" }, { status: 400 });
    }

    try {
        const isValid = await ClinicService.validateClinicId(clinicId);
        if (!isValid) {
            return NextResponse.json({ error: "Invalid clinicId" }, { status: 404 });
        }

        const clinicData = await ClinicService.getClinicWithSettings(clinicId);
        const adminPhoneNumber = clinicData?.settings?.adminPhoneNumber || null;

        const pending = await NotificationService.getPendingNotifications(clinicId, 5);

        // Acopla o adminPhoneNumber para o Robô usar
        const dataWithPhone = pending.map((n: any) => ({
            ...n,
            adminPhoneNumber
        }));

        return NextResponse.json({ ok: true, data: dataWithPhone });
    } catch (error) {
        console.error("[get notifications/send-admin] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST /api/notifications/send-admin
 *
 * Robô confirma que enviou a notificação ao ADMIN no WhatsApp.
 * Marca a notificação como sent=true.
 */
export async function POST(req: NextRequest) {
    let clinicId = "";

    try {
        const body = await req.json();
        clinicId = body.clinicId;
        const { notificationId } = body;

        if (!clinicId || !notificationId) {
            return NextResponse.json(
                { error: "clinicId and notificationId are required" },
                { status: 400 }
            );
        }

        await NotificationService.markSent(clinicId, notificationId);

        await LogService.info(clinicId, LogEvent.NOTIFICATION_SENT, {
            notificationId,
            note: "Confirmed by local robot",
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[post notifications/send-admin] Unhandled error:", error);
        if (clinicId) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                endpoint: "POST /api/notifications/send-admin",
                error: String(error),
            }).catch(() => { });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
