/**
 * API Route: PATCH /api/settings
 * Permite atualizar configurações da robô (Multi-tenant).
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
        const { searchParams } = new URL(req.url);

        const session = await getSession();
        const clinicId = (session?.clinicId as string) || searchParams.get("clinicId");

        if (!clinicId) {
            return NextResponse.json({ error: "clinicId is required" }, { status: 400 });
        }

        // Valida se a clínica existe
        const clinic = await ClinicService.findById(clinicId);
        if (!clinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        const body = await req.json();
        const { robotEnabled, debounceSeconds, prioritySuggestions } = body;

        // Monta o objeto de update — restrito aos campos aprovados no plano
        const updateData: any = {};
        if (typeof robotEnabled === "boolean") updateData.robotEnabled = robotEnabled;
        if (typeof debounceSeconds === "number") updateData.debounceSeconds = debounceSeconds;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        }

        let updatedSettings = null;
        if (Object.keys(updateData).length > 0) {
            updatedSettings = await prisma.setting.update({
                where: { clinicId },
                data: updateData,
            });
        }

        // Se houver prioritySuggestions, atualiza a CLINIC
        if (prioritySuggestions) {
            await prisma.clinic.update({
                where: { id: clinicId },
                data: { prioritySuggestions },
            });
        }

        await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
            action: "UPDATE_SETTINGS",
            changes: updateData
        });

        return NextResponse.json({ ok: true, settings: updatedSettings });

    } catch (error: any) {
        console.error("PATCH /api/settings error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
