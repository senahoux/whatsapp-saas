import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import { ClinicService } from "@/services/clinic.service";
import { LogService } from "@/services/log.service";
import { LogEvent } from "@/lib/types";
import { getSession } from "@/lib/auth";

/**
 * GET /api/appointments
 *
 * Lista agendamentos da clínica.
 * Usado pelo painel Admin.
 *
 * Query params:
 * - clinicId (obrigatório)
 * - date (opcional)
 * - status (opcional)
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const session = await getSession();
    const clinicId = (session?.clinicId as string) || searchParams.get("clinicId");

    if (!clinicId) {
        return NextResponse.json({ error: "clinicId is required" }, { status: 400 });
    }

    try {
        const isValid = await ClinicService.validateClinicId(clinicId);
        if (!isValid) {
            return NextResponse.json({ error: "Invalid clinicId" }, { status: 404 });
        }

        const options = {
            date: searchParams.get("date") ?? undefined,
            status: searchParams.get("status") ?? undefined,
            page: Number(searchParams.get("page") ?? 1),
            pageSize: Number(searchParams.get("pageSize") ?? 50),
        };

        const result = await AppointmentService.list(clinicId, options);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error("[get appointments] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST /api/appointments
 *
 * Cria um novo agendamento manualmente (via painel Admin).
 *
 * Body:
 * - clinicId: string
 * - contactId: string
 * - date: string (YYYY-MM-DD)
 * - time: string (HH:MM)
 * - type: string (opcional)
 * - subtype: string (opcional)
 * - notes: string (opcional)
 */
export async function POST(req: NextRequest) {
    let clinicId = "";
    try {
        const body = await req.json();
        const session = await getSession();
        clinicId = (session?.clinicId as string) || body.clinicId;

        if (!clinicId || !body.contactId || !body.date || !body.time) {
            return NextResponse.json(
                { error: "clinicId, contactId, date and time are required" },
                { status: 400 }
            );
        }

        const appointment = await AppointmentService.create(clinicId, {
            contactId: body.contactId,
            date: body.date,
            time: body.time,
            type: body.type,
            subtype: body.subtype,
            notes: body.notes,
            source: "MANUAL",
        });

        await LogService.info(clinicId, LogEvent.APPOINTMENT_CREATED, {
            appointmentId: appointment.id,
            date: appointment.date,
            time: appointment.time,
            source: "MANUAL_PANEL",
        });

        return NextResponse.json({ ok: true, appointment });
    } catch (error) {
        const errStr = String(error);

        // Erros de conflito lançados pelo Service (slot ocupado, dia bloqueado)
        if (errStr.includes("already booked") || errStr.includes("is blocked")) {
            return NextResponse.json({ error: errStr }, { status: 409 }); // Conflict
        }

        console.error("[post appointments] Unhandled error:", error);
        if (clinicId) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                endpoint: "POST /api/appointments",
                error: errStr,
            }).catch(() => { });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
