import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AIService } from "@/services";
import type { FrozenSnapshot } from "@/lib/replay/types";

/**
 * POST /api/admin/replay/[id]/run
 * Executa o replay — reexecuta a IA com o prompt candidato
 * usando o snapshot congelado do trace original.
 * 
 * ZERO SIDE EFFECTS:
 * - Não envia WhatsApp
 * - Não grava appointment
 * - Não altera estado de conversa
 * - Não dispara notificação
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const startTime = Date.now();

    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clinicId = session.clinicId as string;
        const { id } = await params;

        // 1. Buscar o experimento
        const experiment = await prisma.replayExperiment.findFirst({
            where: { id, clinicId },
        });

        if (!experiment) {
            return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
        }

        // 2. Reconstruir o contexto a partir do snapshot congelado + Overrides
        const snapshot: FrozenSnapshot = JSON.parse(experiment.frozenSnapshot);
        const body = await req.json().catch(() => ({}));
        
        // Camadas de Simulação (Ordem de precedência: Request Body > DB Candidate > Snapshot Original)
        const candidatePrompt = body.candidatePrompt || experiment.candidatePrompt || snapshot.originalPrompt;
        const candidateMessage = body.candidateMessage || (experiment as any).candidateMessage || snapshot.patientMessage;
        const candidateHistory = body.candidateHistory || (experiment as any).candidateHistory || null;
        const candidateContextRaw = body.candidateContext || (experiment as any).candidateContext || null;

        // Processar overrides de contexto clínico
        let finalContext = snapshot.clinicContext;
        if (candidateContextRaw) {
            try {
                const overrides = typeof candidateContextRaw === 'string' 
                    ? JSON.parse(candidateContextRaw) 
                    : candidateContextRaw;
                finalContext = { ...finalContext, ...overrides };
            } catch (e) {
                console.error("[Replay Run] Erro ao parsear candidateContext override:", e);
            }
        }

        const timezone = 'America/Sao_Paulo';
        const data_referencia = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        // Processar histórico (se houver override em texto, converter)
        let historico_resumido = "";
        if (candidateHistory) {
            historico_resumido = candidateHistory;
        } else {
            historico_resumido = snapshot.history
                .map(m => `${m.role === 'user' ? 'PACIENTE' : 'ASSISTENTE'}: ${m.content}`)
                .join("\n");
        }

        const tabela_temporal = AIService.getDateReferences(timezone);

        const aiCtx: any = {
            mensagem_paciente: candidateMessage,
            nome_paciente: snapshot.patientName || "Paciente de Teste (Replay)",
            historico_resumido,
            status_conversa: snapshot.conversationStatus || "PRIMARY",
            contexto_clinica: finalContext,
            agenda_snapshot: snapshot.agendaSnapshot,
            foco_temporal_ativo: snapshot.activeTemporalFilter,
            data_referencia,
            timezone,
            tabela_temporal
        };

        // 3. Trace do replay
        const replayTrace: any = {
            metadata: {
                traceId: `replay_${Math.random().toString(36).substring(2, 11)}`,
                timestamp: new Date().toISOString(),
                isReplay: true,
                sourceExperimentId: id,
                pipelineVersion: "replay-lab-v2"
            },
            input: {
                patientMessage: candidateMessage,
                recentMessagesUsed: candidateHistory ? [{ role: 'system', content: 'History Override Active' }] : snapshot.history,
                clinicContextSnapshot: finalContext,
                isReplay: true,
                simulationParameters: {
                    promptModified: candidatePrompt !== snapshot.originalPrompt,
                    messageModified: candidateMessage !== snapshot.patientMessage,
                    contextModified: !!candidateContextRaw
                }
            },
            invocations: [],
            finalOutput: {
                isSimulation: true,
                isReplay: true
            }
        };

        // 4. Executar a IA com o prompt candidato (REUSO DO PIPELINE REAL)
        let aiResponse = await AIService.respond(aiCtx, {
            stage: "PRIMARY",
            invocationIndex: 0,
            reason: "Replay Lab: Execução Multiparamétrica",
            systemPromptOverride: candidatePrompt,
            onTrace: (t) => replayTrace.invocations.push(t)
        });

        if (!aiResponse) throw new Error("AI communication failed during replay");

        // 5. Se o original tinha VER_AGENDA, NÃO refazer a chamada real
        // Usamos o agendaSnapshot congelado em vez de buscar dados novos
        if (aiResponse.acao_backend === "VER_AGENDA" && snapshot.agendaSnapshot) {
            aiCtx.agenda_snapshot = snapshot.agendaSnapshot;

            aiResponse = await AIService.respond(aiCtx, {
                stage: "AGENDA_LOOP",
                invocationIndex: replayTrace.invocations.length,
                reason: "Replay Lab: Re-avaliação com snapshot agenda congelado",
                systemPromptOverride: candidatePrompt,
                onTrace: (t) => replayTrace.invocations.push(t)
            });

            if (!aiResponse) throw new Error("AI communication failed in replay agenda loop");
        }

        // 6. Registrar no trace (sem side effects)
        const acao = aiResponse.acao_backend;
        replayTrace.finalOutput.actionFinal = acao;
        replayTrace.finalOutput.messageText = aiResponse.mensagem;

        if (acao === "AGENDAR") {
            replayTrace.finalOutput.simulationNote = `Replay: AGENDAR detectado para ${aiResponse.slot_escolhido?.data} ${aiResponse.slot_escolhido?.hora}. Nenhuma escrita real.`;
        } else if (acao === "CANCELAR") {
            replayTrace.finalOutput.simulationNote = `Replay: CANCELAR detectado. Nenhuma escrita real.`;
        }

        replayTrace.metadata.totalLatencyMs = Date.now() - startTime;

        // 7. Persistir resultado e salvar os overrides usados
        await prisma.replayExperiment.update({
            where: { id },
            data: {
                candidatePrompt,
                candidateMessage,
                candidateHistory,
                candidateContext: typeof candidateContextRaw === 'object' ? JSON.stringify(candidateContextRaw) : candidateContextRaw,
                candidateResponse: aiResponse.mensagem,
                candidateTrace: JSON.stringify(replayTrace),
                status: "EXECUTED",
            }
        });

        return NextResponse.json({
            ok: true,
            candidateResponse: aiResponse.mensagem,
            candidateAction: acao,
            trace: replayTrace,
            latencyMs: Date.now() - startTime
        });

    } catch (error: any) {
        console.error("[Replay API] RUN Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
