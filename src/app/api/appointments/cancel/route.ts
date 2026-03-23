import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import { LogService } from "@/services/log.service";
import { LogEvent } from "@/lib/types";

/**
 * POST /api/appointments/cancel
 *
 * Cancela um agendamento existente.
 * Orquestração via AppointmentService, isolamento por clinicId.
 */
export async function POST(req: NextRequest) {
    let clinicId = "";

    try {
        const body = await req.json();
        clinicId = body.clinicId;
        const { appointmentId, notes } = body;

        if (!clinicId || !appointmentId) {
            return NextResponse.json(
                { error: "clinicId and appointmentId are required" },
                { status: 400 }
            );
        }

        const appointment = await AppointmentService.cancel(
            clinicId,
            appointmentId,
            notes
        );

        await LogService.info(clinicId, LogEvent.APPOINTMENT_CANCELLED, {
            appointmentId: appointment.id,
            notes,
        });

        return NextResponse.json({ ok: true, appointment });
    } catch (error) {
        const errStr = String(error);

        // 404 se não achar agendamento
        if (errStr.includes("not found")) {
            return NextResponse.json({ error: errStr }, { status: 404 });
        }

        console.error("[post cancel] Unhandled error:", error);
        if (clinicId) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                endpoint: "POST /api/appointments/cancel",
                error: errStr,
            }).catch(() => { });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
