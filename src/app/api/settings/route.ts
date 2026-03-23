import { NextRequest, NextResponse } from "next/server";
import { ClinicService } from "@/services/clinic.service";

/**
 * GET /api/settings
 * Retorna configurações da clínica (dados base e tabela Setting).
 * Consome do service, respeitando regra da arquitetura.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get("clinicId");

    if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

    try {
        const clinic = await ClinicService.getClinicWithSettings(clinicId);
        if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });

        return NextResponse.json({ ok: true, clinic });
    } catch (e) {
        console.error("[get settings] Unhandled error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST /api/settings
 * Atualiza dados da clínica (serviços, promoções, etc).
 */
export async function POST(req: NextRequest) {
    let clinicId = "";

    try {
        const body = await req.json();
        clinicId = body.clinicId;

        if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

        const { clinicId: _drop, ...updateData } = body;
        const clinic = await ClinicService.updateClinic(clinicId, updateData);

        return NextResponse.json({ ok: true, clinic });
    } catch (e) {
        console.error("[post settings] Unhandled error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
