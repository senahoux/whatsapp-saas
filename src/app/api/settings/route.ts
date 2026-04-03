/**
 * API Route: /api/settings
 * GET  → Retorna clínica + settings
 * PATCH → Salva configurações do robô + dados da clínica (incluindo IA e Calendário)
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

        if (!clinicId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { 
            // Setting Model
            robotEnabled, debounceSeconds,
            // Clinic Model
            nomeClinica, nomeMedico, endereco, telefone, consultaValor, consultaDuracao, 
            descricaoServicos, faq, regrasPersonalizadas, aiContextMode, nomeAssistente,
            workingDays, workingShifts, prioritySuggestions
        } = body;

        // ── 1. VALIDAÇÃO DE LIMITES (FASE 3.5) ────────────────────────
        const errors: string[] = [];
        const check = (val: any, limit: number, label: string) => {
            if (val && String(val).length > limit) errors.push(`${label} excede limite de ${limit} caracteres.`);
        };

        check(nomeClinica, 80, "Nome da clínica");
        check(nomeMedico, 80, "Nome do médico");
        check(nomeAssistente, 40, "Nome da assistente");
        check(telefone, 20, "Telefone");
        check(endereco, 180, "Endereço");
        check(descricaoServicos, 350, "Descrição de serviços");

        if (errors.length > 0) {
            return NextResponse.json({ error: errors[0], details: errors }, { status: 400 });
        }

        // Validação de FAQ e Regras
        const sanitizedFaq = Array.isArray(faq) 
            ? faq.filter(f => f.pergunta?.trim() && f.resposta?.trim())
                 .map(f => ({ pergunta: f.pergunta.trim().slice(0, 120), resposta: f.resposta.trim().slice(0, 300) }))
                 .slice(0, 20)
            : [];
        
        const sanitizedRegras = Array.isArray(regrasPersonalizadas)
            ? regrasPersonalizadas.filter(r => typeof r === "string" && r.trim())
                                 .map(r => r.trim().slice(0, 160))
                                 .slice(0, 15)
            : [];

        // ── 2. PERSISTÊNCIA ──────────────────────────────────────────

        // Tabela: settings (Modelo Setting)
        await prisma.setting.update({
            where: { clinicId },
            data: {
                robotEnabled: typeof robotEnabled === "boolean" ? robotEnabled : undefined,
                debounceSeconds: typeof debounceSeconds === "number" ? debounceSeconds : undefined,
            },
        });

        // Tabela: clinics (Modelo Clinic)
        const clinicUpdate: any = {
            nomeClinica: nomeClinica?.trim(),
            nomeMedico: nomeMedico?.trim(),
            endereco: endereco?.trim(),
            telefone: telefone?.trim(),
            consultaValor: typeof consultaValor === "number" ? consultaValor : undefined,
            consultaDuracao: typeof consultaDuracao === "number" ? consultaDuracao : undefined,
            descricaoServicos: descricaoServicos?.trim(),
            faq: JSON.stringify(sanitizedFaq),
            regrasPersonalizadas: JSON.stringify(sanitizedRegras),
            aiContextMode: ["LEGACY", "DYNAMIC"].includes(aiContextMode) ? aiContextMode : undefined,
            nomeAssistente: nomeAssistente?.trim() || undefined,
            // Calendário
            workingDays: Array.isArray(workingDays) ? workingDays : undefined,
            workingShifts: workingShifts !== undefined ? workingShifts : undefined,
            prioritySuggestions: prioritySuggestions !== undefined ? prioritySuggestions : undefined,
        };

        // Remove campos undefined para evitar erros no Prisma
        Object.keys(clinicUpdate).forEach(key => clinicUpdate[key] === undefined && delete clinicUpdate[key]);

        await prisma.clinic.update({
            where: { id: clinicId },
            data: clinicUpdate,
        });

        await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
            action: "UPDATE_SETTINGS_P35",
            aiContextMode,
            hasFaq: sanitizedFaq.length > 0,
            hasRegras: sanitizedRegras.length > 0
        });

        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error("PATCH /api/settings error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
