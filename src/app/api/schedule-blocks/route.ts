import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        const clinicId = session?.clinicId as string;
        if (!clinicId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { blockDate, reason } = body;

        if (!blockDate) return NextResponse.json({ error: "blockDate is required" }, { status: 400 });

        const block = await AppointmentService.blockDay(clinicId, blockDate, reason);
        return NextResponse.json({ ok: true, block });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const session = await getSession();
        const clinicId = session?.clinicId as string;
        if (!clinicId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const blockDate = searchParams.get("blockDate");
        if (!blockDate) return NextResponse.json({ error: "blockDate is required" }, { status: 400 });

        const block = await AppointmentService.unblockDay(clinicId, blockDate);
        return NextResponse.json({ ok: true, block });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        const clinicId = session?.clinicId as string;
        if (!clinicId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const blocks = await AppointmentService.listBlocks(clinicId, true);
        return NextResponse.json({ ok: true, data: blocks });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
