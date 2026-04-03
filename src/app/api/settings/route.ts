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
        const { 
            robotEnabled, debounceSeconds, prioritySuggestions, workingDays, workingShifts,
            nomeClinica, nomeMedico, endereco, telefone, consultaValor, consultaDuracao, 
            descricaoServicos, faq, regrasPersonalizadas, aiContextMode, nomeAssistente
        } = body;

        // ── 0. Proteção de Payload ────────────────────────────────────
        const payloadSize = JSON.stringify(body).length;
        if (payloadSize > 100 * 1024) { // 100KB limit
            return NextResponse.json({ error: "Payload too large (max 100KB)" }, { status: 413 });
        }

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

        // ── 2. Clinic calendar & Info & AI config (tabela Clinic) ─────
        const clinicUpdate: any = {};

        // Dados Básicos
        if (typeof nomeClinica === "string") clinicUpdate.nomeClinica = nomeClinica;
        if (typeof nomeMedico === "string") clinicUpdate.nomeMedico = nomeMedico;
        if (typeof endereco === "string") clinicUpdate.endereco = endereco;
        if (typeof telefone === "string") clinicUpdate.telefone = telefone;
        if (typeof consultaValor === "number") clinicUpdate.consultaValor = consultaValor;
        if (typeof consultaDuracao === "number") clinicUpdate.consultaDuracao = consultaDuracao;
        if (typeof descricaoServicos === "string") clinicUpdate.descricaoServicos = descricaoServicos;

        // Configurações IA
        if (typeof nomeAssistente === "string") clinicUpdate.nomeAssistente = nomeAssistente;
        if (["LEGACY", "DYNAMIC"].includes(aiContextMode)) clinicUpdate.aiContextMode = aiContextMode;

        // FAQ (Array -> JSON String)
        if (Array.isArray(faq)) {
            const validFaq = faq.filter((item: any) => item.pergunta?.trim() && item.resposta?.trim());
            clinicUpdate.faq = JSON.stringify(validFaq);
        }

        // Regras Personalizadas (Array -> JSON String)
        if (Array.isArray(regrasPersonalizadas)) {
            const validRegras = regrasPersonalizadas.filter((r: any) => typeof r === "string" && r.trim());
            clinicUpdate.regrasPersonalizadas = JSON.stringify(validRegras);
        }

        // Calendário
        if (Array.isArray(workingDays)) {
            const validDays = workingDays.filter((d: any) => typeof d === "number" && d >= 0 && d <= 6);
            clinicUpdate.workingDays = validDays;
        }

        if (Array.isArray(workingShifts)) {
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
            action: "UPDATE_SETTINGS_FULL",
            settingsChanges: Object.keys(settingsUpdate),
            clinicChanges: Object.keys(clinicUpdate),
        });

        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error("PATCH /api/settings error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
