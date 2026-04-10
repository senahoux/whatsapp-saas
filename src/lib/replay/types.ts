/**
 * Replay Laboratory — Types & Contracts
 * Fase 6: Interfaces plugáveis para futuro EvaluationProvider (Gemma)
 * 
 * REGRA: Nenhuma implementação de Gemma aqui. Apenas contratos neutros.
 */

// ── Snapshot Congelado ──────────────────────────────────────
export interface FrozenSnapshot {
    /** Mensagem original do paciente */
    patientMessage: string;
    /** Nome do paciente (se disponível) */
    patientName: string | null;
    /** Histórico de mensagens usado na execução original */
    history: { role: 'user' | 'assistant'; content: string }[];
    /** Contexto completo da clínica no momento da execução */
    clinicContext: any;
    /** Status da conversa no momento (NORMAL, HUMANO, etc) */
    conversationStatus: string;
    /** Foco temporal ativo (ex: "2026-04" ou "2026-04-10") */
    activeTemporalFilter: string | null;
    /** Snapshot da agenda, se VER_AGENDA foi acionado */
    agendaSnapshot: any | null;
    /** Prompt original completo (system prompt) */
    originalPrompt: string;
    /** Metadata do trace original */
    metadata: {
        traceId: string;
        model: string;
        promptVersion: string;
        totalLatencyMs: number;
        inputTokens?: number;
        outputTokens?: number;
    };
}

// ── Replay Context (para avaliação) ─────────────────────────
export interface ReplayContext {
    patientMessage: string;
    clinicContext: any;
    history: { role: 'user' | 'assistant'; content: string }[];
    originalPrompt: string;
    candidatePrompt: string;
    originalResponse: string;
    candidateResponse: string;
}

// ── EvaluationProvider (contrato plugável) ───────────────────
/**
 * Interface neutra para avaliação de qualidade.
 * Na Fase 6: apenas HUMAN (manual).
 * Futuro: GemmaEvaluationProvider, GPTJudgeProvider, etc.
 */
export interface EvaluationProvider {
    name: string;
    evaluate(context: ReplayContext): Promise<EvaluationResult>;
}

export interface EvaluationResult {
    /** Score de 0 a 100 */
    score: number;
    /** Veredicto: a resposta candidata é melhor, pior ou equivalente? */
    verdict: 'BETTER' | 'WORSE' | 'EQUIVALENT';
    /** Justificativa textual */
    reasoning: string;
    /** Nome do provider que avaliou */
    provider: string;
    /** Timestamp da avaliação */
    evaluatedAt: Date;
}

// ── Human Evaluation Provider (implementação mínima) ────────
/**
 * Provider manual — o operador preenche o veredicto pela UI.
 * Esta é a única implementação da Fase 6.
 */
export class HumanEvaluationProvider implements EvaluationProvider {
    name = 'HUMAN';

    async evaluate(context: ReplayContext): Promise<EvaluationResult> {
        // No-op: a avaliação humana é feita via UI, não por código.
        // Este provider existe para completude do contrato.
        return {
            score: 0,
            verdict: 'EQUIVALENT',
            reasoning: 'Avaliação pendente — será preenchida pelo operador.',
            provider: this.name,
            evaluatedAt: new Date()
        };
    }
}
