import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import { LogService } from "@/services/log.service";
import { LogEvent } from "@/lib/types";

/**
 * POST /api/schedule/block-day
 *
 * Bloqueia um dia inteiro na agenda da clínica.
 * A IA (VER_AGENDA) ou painel não poderão criar agendamentos neste dia.
 */
export async function POST(req: NextRequest) {
    let clinicId = "";

    try {
        const body = await req.json();
        clinicId = body.clinicId;
        const { blockDate, reason } = body;

        if (!clinicId || !blockDate) {
            return NextResponse.json(
                { error: "clinicId and blockDate (YYYY-MM-DD) are required" },
                { status: 400 }
            );
        }

        const block = await AppointmentService.blockDay(
            clinicId,
            blockDate,
            reason
        );

        await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
            action: "DAY_BLOCKED",
            blockDate,
            reason,
        });

        return NextResponse.json({ ok: true, block });
    } catch (error) {
        console.error("[post block-day] Unhandled error:", error);
        if (clinicId) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                endpoint: "POST /api/schedule/block-day",
                error: String(error),
            }).catch(() => { });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
