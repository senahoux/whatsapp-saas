/**
 * API Route: /api/settings
 * GET  → Retorna clínica + settings
 * PATCH → Salva configurações do robô + calendário da clínica
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ClinicService } from "@/services/clinic.service";
import { LogService } from "@/services/log.service";
import { LogEvent } from "@/lib/types";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        const session = await getSession();
        const clinicId = session?.clinicId as string;

        if (!clinicId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clinic = await ClinicService.getClinicWithSettings(clinicId);
        if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });

        return NextResponse.json({ clinic });
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getSession();
        const clinicId = session?.clinicId as string;

        if (!clinicId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const clinic = await ClinicService.findById(clinicId);
        if (!clinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        const body = await req.json();
        const { robotEnabled, debounceSeconds, prioritySuggestions, workingDays, workingShifts } = body;

        // ── 1. Settings (tabela Setting) ──────────────────────────────
        const settingsUpdate: any = {};
        if (typeof robotEnabled === "boolean") settingsUpdate.robotEnabled = robotEnabled;
        if (typeof debounceSeconds === "number") settingsUpdate.debounceSeconds = debounceSeconds;

        if (Object.keys(settingsUpdate).length > 0) {
            await prisma.setting.update({
                where: { clinicId },
                data: settingsUpdate,
            });
        }

        // ── 2. Clinic calendar config (tabela Clinic) ─────────────────
        const clinicUpdate: any = {};

        if (Array.isArray(workingDays)) {
            // Validar: só aceitar números 0-6
            const validDays = workingDays.filter((d: any) => typeof d === "number" && d >= 0 && d <= 6);
            clinicUpdate.workingDays = validDays;
        }

        if (Array.isArray(workingShifts)) {
            // Validar: cada turno precisa ter period, start, end
            const validShifts = workingShifts.filter((s: any) =>
                s && typeof s.period === "string" && typeof s.start === "string" && typeof s.end === "string"
            );
            clinicUpdate.workingShifts = validShifts;
        }

        if (prioritySuggestions !== undefined) {
            clinicUpdate.prioritySuggestions = prioritySuggestions;
        }

        if (Object.keys(clinicUpdate).length > 0) {
            await prisma.clinic.update({
                where: { id: clinicId },
                data: clinicUpdate,
            });
        }

        await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
            action: "UPDATE_SETTINGS",
            settingsChanges: settingsUpdate,
            clinicChanges: Object.keys(clinicUpdate),
        });

        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error("PATCH /api/settings error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
