import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const session = await getSession();
        const clinicId = (session?.clinicId as string) || searchParams.get("clinicId");

        if (!clinicId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const date = searchParams.get("date") || undefined;
        const slots = await AppointmentService.getAvailableSlots(clinicId, date);

        return NextResponse.json({ ok: true, data: slots });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
