import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import { LogService } from "@/services/log.service";
import { LogEvent } from "@/lib/types";

/**
 * POST /api/schedule/unblock-day
 *
 * Libera um dia bloqueado na agenda da clínica.
 */
export async function POST(req: NextRequest) {
    let clinicId = "";

    try {
        const body = await req.json();
        clinicId = body.clinicId;
        const { blockDate } = body;

        if (!clinicId || !blockDate) {
            return NextResponse.json(
                { error: "clinicId and blockDate are required" },
                { status: 400 }
            );
        }

        const block = await AppointmentService.unblockDay(clinicId, blockDate);

        await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
            action: "DAY_UNBLOCKED",
            blockDate,
        });

        return NextResponse.json({ ok: true, block });
    } catch (error) {
        console.error("[post unblock-day] Unhandled error:", error);
        if (clinicId) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                endpoint: "POST /api/schedule/unblock-day",
                error: String(error),
            }).catch(() => { });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
