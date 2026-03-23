import { NextRequest, NextResponse } from "next/server";
import { ClinicService, DashboardService } from "@/services";

/**
 * GET /api/dashboard
 *
 * Retorna estatísticas agregadas para o painel Admin (Passo 6).
 * Orquestração via DashboardService — sem acesso direto ao Prisma na rota.
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

        const stats = await DashboardService.getStats(clinicId);

        return NextResponse.json({ ok: true, stats });
    } catch (error) {
        console.error("[get dashboard] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
