import { NextRequest, NextResponse } from "next/server";
import { 
    ClinicService, 
    AIService, 
    AppointmentService
} from "@/services";
import { getSession } from "@/lib/auth";

/**
 * POST /api/admin/cockpit
 * Endpoint da Área de Teste (Cockpit) — Simula o pipeline real sem IO.
 */
export async function POST(req: NextRequest) {
    const startTimeOverall = Date.now();
    
    // Objeto consolidado do Trace (Fase 4 - Cockpit)
    const fullTrace: any = {
        metadata: {
            traceId: `cockpit_${Math.random().toString(36).substring(2, 11)}`,
            timestamp: new Date().toISOString(),
            isCockpit: true,
            pipelineVersion: "cockpit-mvp-v1"
        },
        input: {},
        invocations: [],
        finalOutput: {
            isSimulation: true
        }
    };

    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { messageText, history = [] } = body;
        const clinicId = session.clinicId as string;

        if (!messageText || !clinicId) {
            return NextResponse.json({ error: "Missing params" }, { status: 400 });
        }

        // ── 1. Contexto da Clínica ───────────────────────────────────
        const clinicContext = await ClinicService.buildContextForAI(clinicId);
        if (!clinicContext) return NextResponse.json({ error: "Clinic context not found" }, { status: 500 });

        const timezone = 'America/Sao_Paulo';
        // Simulação de Data Atual para o Mock
        const data_referencia = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        // Constrói o histórico resumido a partir do array enviado pelo frontend
        // No Cockpit, confiamos no histórico que o frontend mantém para o "Continuar Conversa"
        const historico_resumido = history.map((m: any) => `${m.role === 'user' ? 'PACIENTE' : 'ASSISTENTE'}: ${m.content}`).join("\n");
        const tabela_temporal = AIService.getDateReferences(timezone);

        const aiCtx: any = {
            mensagem_paciente: messageText,
            nome_paciente: "Paciente de Teste (Cockpit)",
            historico_resumido,
            status_conversa: "PRIMARY", 
            contexto_clinica: clinicContext,
            agenda_snapshot: null,
            foco_temporal_ativo: body.activeFilter || null,
            data_referencia,
            timezone,
            tabela_temporal
        };

        // Snapshot inicial para o trace
        fullTrace.metadata.clinicId = clinicId;
        fullTrace.metadata.promptVersion = clinicContext.aiContextMode;
        fullTrace.input = {
            patientMessage: messageText,
            recentMessagesUsed: history,
            clinicContextSnapshot: clinicContext,
            isCockpit: true
        };

        // ── 2. Chamada à IA (Pernada 1) ────────────────────────────────
        let aiResponse = await AIService.respond(aiCtx, {
            stage: "PRIMARY",
            invocationIndex: 0,
            reason: "Cockpit: Interpretação inicial",
            onTrace: (t) => fullTrace.invocations.push(t)
        });

        if (!aiResponse) throw new Error("AI communication failed");

        // ── 3. Loop de Agenda (VER_AGENDA) ───────────────────────────
        if (aiResponse.acao_backend === "VER_AGENDA") {
            const dataFocal = aiResponse.referencia_temporal_resolvida || body.activeFilter || undefined;
            
            const snapshot = await AppointmentService.getAgendaSnapshot(
                clinicId,
                dataFocal,
                aiResponse.referencia_temporal_bruta,
                15
            );
            
            aiCtx.agenda_snapshot = snapshot;
            
            // Pernada 2 (com dados da agenda)
            aiResponse = await AIService.respond(aiCtx, {
                stage: "AGENDA_LOOP",
                invocationIndex: fullTrace.invocations.length,
                reason: "Cockpit: Re-avaliação com snapshot real",
                onTrace: (t) => fullTrace.invocations.push(t)
            });
            if (!aiResponse) throw new Error("AI communication failed in loop");
        }

        // ── 4. Simulação de Ações (Efeitos Colaterais) ───────────────
        const acao = aiResponse.acao_backend;
        fullTrace.finalOutput.actionFinal = acao;
        fullTrace.finalOutput.messageText = aiResponse.mensagem;
        
        if (acao === "AGENDAR") {
            fullTrace.finalOutput.simulationNote = `A IA executaria a criação de um agendamento real para ${aiResponse.slot_escolhido?.data} ${aiResponse.slot_escolhido?.hora}. (Simulação Cockpit: Nenhuma escrita efetuada).`;
        } else if (acao === "CANCELAR") {
            fullTrace.finalOutput.simulationNote = `A IA executaria o cancelamento do agendamento ativo. (Simulação Cockpit: Nenhuma escrita efetuada).`;
        }

        fullTrace.metadata.totalLatencyMs = Date.now() - startTimeOverall;

        return NextResponse.json({ 
            ok: true, 
            message: aiResponse.mensagem,
            action: acao,
            trace: fullTrace
        });

    } catch (error: any) {
        console.error("[Cockpit API] Error:", error);
        return NextResponse.json({ error: error.message || "Internal Error" }, { status: 500 });
    }
}
