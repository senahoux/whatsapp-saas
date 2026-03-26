import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const session = await getSession();
        const clinicId = session?.clinicId as string;

        if (!clinicId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const notes = body.notes;

        const updated = await AppointmentService.cancel(clinicId, id, notes);

        return NextResponse.json({ ok: true, appointment: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: error.message?.includes("not found") ? 404 : 500 });
    }
}
