import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/admin/replay/[id]
 * Busca um experimento por ID (com snapshot, comparação e veredicto).
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clinicId = session.clinicId as string;
        const { id } = await params;

        const experiment = await prisma.replayExperiment.findFirst({
            where: { id, clinicId },
        });

        if (!experiment) {
            return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
        }

        return NextResponse.json({
            ok: true,
            experiment: {
                ...experiment,
                frozenSnapshot: JSON.parse(experiment.frozenSnapshot),
                candidateTrace: experiment.candidateTrace ? JSON.parse(experiment.candidateTrace) : null,
            }
        });

    } catch (error: any) {
        console.error("[Replay API] GET [id] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/replay/[id]
 * Salva veredicto humano (BETTER | WORSE | EQUIVALENT).
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clinicId = session.clinicId as string;
        const { id } = await params;
        const body = await req.json();
        const { verdict, verdictNote } = body;

        if (!verdict || !["BETTER", "WORSE", "EQUIVALENT"].includes(verdict)) {
            return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
        }

        const experiment = await prisma.replayExperiment.findFirst({
            where: { id, clinicId },
            select: { id: true }
        });

        if (!experiment) {
            return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
        }

        await prisma.replayExperiment.update({
            where: { id },
            data: {
                verdict,
                verdictNote: verdictNote || null,
                evaluationProvider: "HUMAN",
                status: "EVALUATED",
            }
        });

        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error("[Replay API] PATCH [id] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
