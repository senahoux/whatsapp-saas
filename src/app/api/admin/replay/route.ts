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

        // --- 1. NORMALIZAÇÃO DE HISTÓRICO ---
        // O trace pode vir com history em formatos variados. Forçamos {role, content}[]
        const rawHistory = trace.input?.recentMessagesUsed || [];
        const normalizedHistory = Array.isArray(rawHistory) ? rawHistory.map((m: any) => {
            if (typeof m === 'string') return { role: 'user', content: m };
            return {
                role: m.role || (m.author === 'ROBO' ? 'assistant' : 'user'),
                content: m.content || m.text || ""
            };
        }) : [];

        // --- 2. EXTRAÇÃO DE METADADOS ---
        const patientMessage = trace.input?.patientMessage || "";
        const patientName = trace.input?.contactName || trace.input?.nome_paciente || null;
        const conversationStatus = trace.input?.conversationStatus || trace.input?.status_conversa || "NORMAL";
        const activeTemporalFilter = trace.input?.activeSchedulingFilter || trace.input?.foco_temporal_ativo || null;

        // --- 3. NORMALIZAÇÃO LEGACY-TO-DYNAMIC ---
        const clinicContext = normalizeClinicContext(trace.input?.clinicContextSnapshot || trace.input?.contexto_clinica || {});


        // Extrair e congelar o snapshot normalizado
        const snapshot: FrozenSnapshot = {
            patientMessage,
            patientName,
            history: normalizedHistory,
            clinicContext,
            conversationStatus,
            activeTemporalFilter,
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

        // Criar experimento em DRAFT (Populando os campos de candidata para edição inicial)
        const experiment = await prisma.replayExperiment.create({
            data: {
                clinicId,
                sourceLogId,
                frozenSnapshot: JSON.stringify(snapshot),
                candidatePrompt: snapshot.originalPrompt,
                candidateMessage: snapshot.patientMessage,
                candidateHistory: normalizedHistory.map(m => `${m.role === 'assistant' ? 'ASSISTENTE' : 'PACIENTE'}: ${m.content}`).join("\n"),
                candidateContext: JSON.stringify(snapshot.clinicContext),
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

/**
 * Auxiliar de Normalização: Encapsula dados de migração LEGACY -> DYNAMIC.
 * Mantém o corpo da API limpo de hardcodes históricos.
 */
function normalizeClinicContext(ctx: any): any {
    const isLegacy = !ctx.aiContextMode || ctx.aiContextMode === 'LEGACY';
    if (!isLegacy) return ctx;

    return {
        ...ctx,
        aiContextMode: 'DYNAMIC',
        nomeAssistente: ctx.nomeAssistente || "Rafaela",
        nomeMedico: ctx.nomeMedico || "Dr. Lucas Sena",
        nomeClinica: ctx.nomeClinica || "ClinCare",
        endereco: ctx.endereco || "ClinCare\nRua Manoel de Paula, 33\nCapela, Mogi Guaçu - SP",
        consultaValor: ctx.consultaValor || 400,
        consultaDuracao: ctx.consultaDuracao || 60,
        descricaoServicos: ctx.descricaoServicos || "Saúde hormonal, performance, reposição hormonal, emagrecimento, implantes hormonais.",
        faq: ctx.faq || [
            { pergunta: "Quanto tempo dura o implante no corpo?", resposta: "O implante costuma durar em média 6 meses no organismo." },
            { pergunta: "Qual o valor do implante?", resposta: "Em média, costuma ficar em torno de 3.500 reais." },
            { pergunta: "Como é o procedimento?", resposta: "É um procedimento simples, feito em consultório, com anestesia local, e dura em média 30 minutos." }
        ],
        regrasPersonalizadas: ctx.regrasPersonalizadas || [
            "Não use emojis ou emoticons.",
            "Fale como se já estivesse garantido no sistema ao agendar.",
            "Nunca dê diagnóstico ou fale efeitos colaterais."
        ]
    };
}
