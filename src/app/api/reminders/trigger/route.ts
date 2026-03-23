/**
 * API Route: POST /api/reminders/trigger
 * Chamada pelo Cron do QStash (Daily Batch).
 */

import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { ReminderService } from "@/services/reminder.service";

const qstash = new Client({
    token: process.env.QSTASH_TOKEN || "",
});

const APP_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://your-app.com";

export async function POST(req: Request) {
    try {
        // 1. Validação básica de segurança (Shared Secret ou Cron Header se não usar QStash Signature aqui)
        // O Cron do QStash pode enviar um header customizado
        const auth = req.headers.get("Authorization");
        if (process.env.QSTASH_CRON_SECRET && auth !== `Bearer ${process.env.QSTASH_CRON_SECRET}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Busca clínicas elegíveis (Settings: robotEnabled = true)
        const clinics = await ReminderService.getEligibleClinics();

        if (clinics.length === 0) {
            return NextResponse.json({ ok: true, message: "No eligible clinics found" });
        }

        // 3. Enfileira um job no QStash para cada clínica
        const jobs = await Promise.all(
            clinics.map(clinicId =>
                qstash.publishJSON({
                    url: `${APP_URL}/api/reminders/process?clinicId=${clinicId}`,
                    // O processador terá sua própria validação de assinatura QStash
                })
            )
        );

        return NextResponse.json({
            ok: true,
            clinicsProcessed: clinics.length,
            jobsEnqueued: jobs.length
        });

    } catch (error: any) {
        console.error("POST /api/reminders/trigger error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
