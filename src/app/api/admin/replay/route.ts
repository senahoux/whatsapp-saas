import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { FrozenSnapshot } from "@/lib/replay/types";

/**
 * GET /api/admin/replay
 * Lista experimentos de replay do clinicId com paginação.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clinicId = session.clinicId as string;
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");

        const [total, experiments] = await Promise.all([
            prisma.replayExperiment.count({ where: { clinicId } }),
            prisma.replayExperiment.findMany({
                where: { clinicId },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            })
        ]);

        return NextResponse.json({
            ok: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: experiments.map(exp => ({
                ...exp,
                frozenSnapshot: JSON.parse(exp.frozenSnapshot),
                candidateTrace: exp.candidateTrace ? JSON.parse(exp.candidateTrace) : null,
            }))
        });

    } catch (error: any) {
        console.error("[Replay API] GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/admin/replay
 * Cria um experimento a partir de um sourceLogId (trace real).
 * Congela o snapshot do trace original.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clinicId = session.clinicId as string;
        const body = await req.json();
        const { sourceLogId } = body;

        if (!sourceLogId) {
            return NextResponse.json({ error: "Missing sourceLogId" }, { status: 400 });
        }

        // Buscar o trace original (seguro por clinicId)
        const sourceLog = await prisma.log.findFirst({
            where: { id: sourceLogId, clinicId, event: "AI_FULL_TRACE" },
        });

        if (!sourceLog || !sourceLog.details) {
            return NextResponse.json({ error: "Trace not found" }, { status: 404 });
        }

        const trace = JSON.parse(sourceLog.details);

        // Extrair e congelar o snapshot
        const snapshot: FrozenSnapshot = {
            patientMessage: trace.input?.patientMessage || "",
            patientName: trace.input?.contactName || null,
            history: trace.input?.recentMessagesUsed || [],
            clinicContext: trace.input?.clinicContextSnapshot || null,
            conversationStatus: trace.input?.conversationStatus || "NORMAL",
            activeTemporalFilter: trace.input?.activeSchedulingFilter || null,
            agendaSnapshot: trace.input?.agendaSnapshot || null,
            originalPrompt: trace.invocations?.[0]?.request?.messages?.[0]?.content || "",
            metadata: {
                traceId: trace.metadata?.traceId || sourceLogId,
                model: trace.metadata?.model || "unknown",
                promptVersion: trace.metadata?.promptVersion || "unknown",
                totalLatencyMs: trace.metadata?.totalLatencyMs || 0,
                inputTokens: trace.invocations?.[0]?.response_meta?.usage?.prompt_tokens,
                outputTokens: trace.invocations?.[0]?.response_meta?.usage?.completion_tokens,
            }
        };

        // Resposta original
        const originalResponse = trace.finalOutput?.messageSent
            || trace.finalOutput?.messageText
            || "(sem resposta)";

        // Criar experimento em DRAFT
        const experiment = await prisma.replayExperiment.create({
            data: {
                clinicId,
                sourceLogId,
                frozenSnapshot: JSON.stringify(snapshot),
                candidatePrompt: snapshot.originalPrompt, // começa com o prompt original
                originalResponse,
                status: "DRAFT",
                createdBy: (session as any).user?.email || "admin",
            }
        });

        return NextResponse.json({
            ok: true,
            experiment: {
                ...experiment,
                frozenSnapshot: snapshot,
            }
        });

    } catch (error: any) {
        console.error("[Replay API] POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
