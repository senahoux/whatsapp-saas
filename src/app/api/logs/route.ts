import { NextRequest, NextResponse } from "next/server";
import { LogService } from "@/services/log.service";
import { ClinicService } from "@/services/clinic.service";
import { LogLevel } from "@/lib/types";
import { getSession } from "@/lib/auth";

/**
 * GET /api/logs
 * Retorna os logs do sistema.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const session = await getSession();
    const clinicId = (session?.clinicId as string) || searchParams.get("clinicId");

    if (!clinicId) return NextResponse.json({ error: "clinicId is required" }, { status: 400 });

    try {
        const isValid = await ClinicService.validateClinicId(clinicId);
        if (!isValid) return NextResponse.json({ error: "Invalid clinicId" }, { status: 404 });

        const level = searchParams.get("level") as LogLevel | undefined;
        const page = Number(searchParams.get("page") ?? 1);
        const pageSize = Number(searchParams.get("pageSize") ?? 100);

        const result = await LogService.list(clinicId, { level, page, pageSize });
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error("[get logs] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
