import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/admin/audit
 * Lista os logs de AI_FULL_TRACE com suporte a filtros e paginação.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clinicId = session.clinicId as string;
        const { searchParams } = new URL(req.url);
        
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");
        const evaluation = searchParams.get("evaluation"); // GOOD | BAD | CRITICAL | PENDING
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        const where: any = {
            clinicId,
            event: "AI_FULL_TRACE",
        };

        if (evaluation === "PENDING") {
            where.evaluation = null;
        } else if (evaluation) {
            where.evaluation = evaluation;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [total, logs] = await Promise.all([
            prisma.log.count({ where }),
            prisma.log.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    createdAt: true,
                    details: true,
                    evaluation: true,
                    evaluationNote: true,
                    evaluatedAt: true,
                    evaluatedBy: true,
                }
            })
        ]);

        return NextResponse.json({
            ok: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: logs.map(log => ({
                ...log,
                details: log.details ? JSON.parse(log.details) : null
            }))
        });

    } catch (error: any) {
        console.error("[Audit API] GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/audit
 * Atualiza a avaliação de um log de trace.
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clinicId = session.clinicId as string;
        const body = await req.json();
        const { logId, evaluation, evaluationNote } = body;

        if (!logId) {
            return NextResponse.json({ error: "Missing logId" }, { status: 400 });
        }

        if (!evaluation || !["GOOD", "BAD", "CRITICAL"].includes(evaluation)) {
            return NextResponse.json({ error: "Invalid evaluation value" }, { status: 400 });
        }

        // Verificar que o log pertence à clínica do operador
        const log = await prisma.log.findFirst({
            where: { id: logId, clinicId },
            select: { id: true }
        });

        if (!log) {
            return NextResponse.json({ error: "Log not found" }, { status: 404 });
        }

        await prisma.log.update({
            where: { id: logId },
            data: {
                evaluation,
                evaluationNote: evaluationNote || null,
                evaluatedAt: new Date(),
                evaluatedBy: (session as any).user?.email || "admin"
            }
        });

        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error("[Audit API] PATCH Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
