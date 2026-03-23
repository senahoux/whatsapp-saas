import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import { LogService } from "@/services/log.service";
import { LogEvent } from "@/lib/types";

/**
 * POST /api/appointments/reschedule
 *
 * Remarca um agendamento existente para nova data/hora.
 * Orquestração via AppointmentService, preserva isolamento por clinicId.
 */
export async function POST(req: NextRequest) {
    let clinicId = "";

    try {
        const body = await req.json();
        clinicId = body.clinicId;
        const { appointmentId, date, time, notes } = body;

        if (!clinicId || !appointmentId || !date || !time) {
            return NextResponse.json(
                { error: "clinicId, appointmentId, date and time are required" },
                { status: 400 }
            );
        }

        const appointment = await AppointmentService.reschedule(
            clinicId,
            appointmentId,
            { date, time, notes }
        );

        await LogService.info(clinicId, LogEvent.APPOINTMENT_RESCHEDULED, {
            appointmentId: appointment.id,
            newDate: date,
            newTime: time,
        });

        return NextResponse.json({ ok: true, appointment });
    } catch (error) {
        const errStr = String(error);

        // 409 Conflict se novo horário estiver ocupado
        if (errStr.includes("already booked")) {
            return NextResponse.json({ error: errStr }, { status: 409 });
        }
        // 404 se não achar agendamento
        if (errStr.includes("not found")) {
            return NextResponse.json({ error: errStr }, { status: 404 });
        }

        console.error("[post reschedule] Unhandled error:", error);
        if (clinicId) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                endpoint: "POST /api/appointments/reschedule",
                error: errStr,
            }).catch(() => { });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
