/**
 * API Route: POST /api/reminders/process
 * Executa o disparo de lembretes para UMA clínica específica.
 * Chamado pelo QStash Worker.
 */

import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { ReminderService } from "@/services/reminder.service";

const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
});

export async function POST(req: Request) {
    try {
        // 1. Verificação de configuração de segurança
        if (!process.env.QSTASH_CURRENT_SIGNING_KEY) {
            console.error("QSTASH_CURRENT_SIGNING_KEY is not configured");
            return NextResponse.json({ error: "Server misconfigured: Missing security keys" }, { status: 500 });
        }

        // 2. Validação de Assinatura QStash (Segurança Máxima)
        const signature = req.headers.get("upstash-signature");
        if (!signature) {
            return NextResponse.json({ error: "Missing QStash signature" }, { status: 401 });
        }

        const body = await req.text();
        const isValid = await receiver.verify({
            signature,
            body,
        }).catch(() => false);

        if (!isValid && process.env.NODE_ENV === "production") {
            return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
        }

        // 2. Extrai clinicId
        const { searchParams } = new URL(req.url);
        const clinicId = searchParams.get("clinicId");

        if (!clinicId) {
            return NextResponse.json({ error: "clinicId is required" }, { status: 400 });
        }

        // 3. Processa lembretes
        const result = await ReminderService.processClinicReminders(clinicId);

        return NextResponse.json({
            ok: true,
            clinicId,
            ...result
        });

    } catch (error: any) {
        console.error("POST /api/reminders/process error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
