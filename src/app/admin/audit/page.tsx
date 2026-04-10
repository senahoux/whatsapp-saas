"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import "./audit.css";

type AuditLog = {
    id: string;
    evaluation: string | null;
    evaluationNote: string | null;
    evaluatedAt: string | null;
    evaluatedBy: string | null;
    createdAt: string;
    details: any;
};

export default function AuditPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [filter, setFilter] = useState({
        evaluation: "ALL",
        startDate: "",
        endDate: ""
    });
    const [activeTab, setActiveTab] = useState<'resumo' | 'prompt' | 'contexto' | 'json'>('resumo');
    const [evalNote, setEvalNote] = useState("");
    const [saving, setSaving] = useState(false);

    // ── Replay Laboratory State ──────────────────────
    const [replayOpen, setReplayOpen] = useState(false);
    const [replayLoading, setReplayLoading] = useState(false);
    const [replayPrompt, setReplayPrompt] = useState("");
    const [replayExperimentId, setReplayExperimentId] = useState<string | null>(null);
    const [replayOriginalResponse, setReplayOriginalResponse] = useState("");
    const [replayCandidateResponse, setReplayCandidateResponse] = useState<string | null>(null);
    const [replayVerdict, setReplayVerdict] = useState<string | null>(null);
    const [replayVerdictNote, setReplayVerdictNote] = useState("");
    const [replaySaving, setReplaySaving] = useState(false);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: "20"
            });
            if (filter.evaluation !== "ALL") params.append("evaluation", filter.evaluation);
            if (filter.startDate) params.append("startDate", filter.startDate);
            if (filter.endDate) params.append("endDate", filter.endDate);

            const res = await fetch(`/api/admin/audit?${params.toString()}`);
            const data = await res.json();
            if (data.ok) {
                setLogs(data.data);
                setTotal(data.total);
                setTotalPages(data.totalPages || 1);
            }
        } finally {
            setLoading(false);
        }
    }, [page, filter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    async function handleSaveEvaluation(evaluation: string) {
        if (!selectedLog) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/audit", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    logId: selectedLog.id,
                    evaluation,
                    evaluationNote: evalNote
                })
            });
            const data = await res.json();
            if (data.ok && selectedLog) {
                const updated = logs.map(l => l.id === selectedLog.id ? { ...l, evaluation, evaluationNote: evalNote, evaluatedAt: new Date().toISOString() } : l);
                setLogs(updated);
                setSelectedLog({ ...selectedLog, evaluation, evaluationNote: evalNote });
            }
        } finally {
            setSaving(false);
        }
    }

    // ── Replay Laboratory Handlers ────────────────────
    async function handleStartReplay() {
        if (!selectedLog) return;
        setReplayLoading(true);
        setReplayOpen(true);
        setReplayCandidateResponse(null);
        setReplayVerdict(null);
        setReplayVerdictNote("");
        try {
            const res = await fetch("/api/admin/replay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceLogId: selectedLog.id })
            });
            const data = await res.json();
            if (data.ok) {
                setReplayExperimentId(data.experiment.id);
                setReplayPrompt(data.experiment.frozenSnapshot.originalPrompt);
                setReplayOriginalResponse(data.experiment.originalResponse);
            } else {
                alert(data.error || "Erro ao criar experimento.");
                setReplayOpen(false);
            }
        } catch {
            alert("Erro de conexão.");
            setReplayOpen(false);
        } finally {
            setReplayLoading(false);
        }
    }

    async function handleRunReplay() {
        if (!replayExperimentId) return;
        setReplayLoading(true);
        try {
            const res = await fetch(`/api/admin/replay/${replayExperimentId}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ candidatePrompt: replayPrompt })
            });
            const data = await res.json();
            if (data.ok) {
                setReplayCandidateResponse(data.candidateResponse);
            } else {
                alert(data.error || "Erro na execução do replay.");
            }
        } catch {
            alert("Erro de conexão.");
        } finally {
            setReplayLoading(false);
        }
    }

    async function handleSaveVerdict() {
        if (!replayExperimentId || !replayVerdict) return;
        setReplaySaving(true);
        try {
            await fetch(`/api/admin/replay/${replayExperimentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ verdict: replayVerdict, verdictNote: replayVerdictNote })
            });
            setReplayOpen(false);
        } catch {
            alert("Erro ao salvar veredicto.");
        } finally {
            setReplaySaving(false);
        }
    }

    function getContactLabel(details: any): string {
        return details?.input?.contactPhone || details?.input?.contactId || "Contato";
    }

    function getPatientMessage(details: any): string {
        return details?.input?.patientMessage || "(sem mensagem)";
    }

    function getAiResponse(details: any): string {
        return details?.finalOutput?.messageSent || details?.finalOutput?.messageText || "(sem resposta)";
    }

    return (
        <div className="audit-page">
            {/* ── HEADER ─────────────────────────── */}
            <header className="page-header">
                <div className="header-content">
                    <h2 className="page-title">Auditoria de Conversas</h2>
                    <p className="page-subtitle">Revisão forense e feedback de qualidade para a IA</p>
                </div>
                <div className="audit-stats">
                    <span className="stat-badge">{total} trace{total !== 1 ? 's' : ''}</span>
                </div>
            </header>

            {/* ── FILTROS ────────────────────────── */}
            <section className="audit-filters-section">
                <div className="card">
                    <div className="filters-row">
                        <div className="filter-group">
                            <label>Status</label>
                            <select value={filter.evaluation} onChange={e => { setFilter({ ...filter, evaluation: e.target.value }); setPage(1); }}>
                                <option value="ALL">Todas</option>
                                <option value="PENDING">Não Revisadas</option>
                                <option value="GOOD">Boas</option>
                                <option value="BAD">Ruins</option>
                                <option value="CRITICAL">Críticas</option>
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>De</label>
                            <input type="date" value={filter.startDate} onChange={e => setFilter({ ...filter, startDate: e.target.value })} />
                        </div>
                        <div className="filter-group">
                            <label>Até</label>
                            <input type="date" value={filter.endDate} onChange={e => setFilter({ ...filter, endDate: e.target.value })} />
                        </div>
                        <button onClick={() => setPage(1)} className="btn-action">Filtrar</button>
                    </div>
                </div>
            </section>

            {/* ── CONTEÚDO PRINCIPAL ──────────────── */}
            <div className="audit-body">
                {/* ── LISTA DE TRACES ── */}
                <aside className="audit-list-panel">
                    <div className="card list-card">
                        <h4 className="panel-title">Interações ({total})</h4>
                        {loading ? (
                            <div className="empty-panel">Carregando traces...</div>
                        ) : logs.length === 0 ? (
                            <div className="empty-panel">Nenhum log encontrado para os filtros atuais.</div>
                        ) : (
                            <div className="trace-list">
                                {logs.map(log => (
                                    <div
                                        key={log.id}
                                        className={`trace-item ${selectedLog?.id === log.id ? 'selected' : ''}`}
                                        onClick={() => { setSelectedLog(log); setEvalNote(log.evaluationNote || ""); setActiveTab('resumo'); }}
                                    >
                                        <div className="trace-meta">
                                            <span className="trace-time">
                                                {format(new Date(log.createdAt), "dd/MM HH:mm:ss", { locale: ptBR })}
                                            </span>
                                            <span className={`eval-badge ${log.evaluation || 'PENDING'}`}>
                                                {log.evaluation === 'GOOD' ? '✓ Boa' : log.evaluation === 'BAD' ? '✗ Ruim' : log.evaluation === 'CRITICAL' ? '⚠ Crítica' : 'Pendente'}
                                            </span>
                                        </div>
                                        <div className="trace-preview">{getPatientMessage(log.details).substring(0, 60)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="list-pagination">
                            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-page">← Anterior</button>
                            <span className="page-info">{page} / {totalPages}</span>
                            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-page">Próxima →</button>
                        </div>
                    </div>
                </aside>

                {/* ── DETALHE DO TRACE ── */}
                <main className="audit-detail-panel">
                    {!selectedLog ? (
                        <div className="card detail-placeholder">
                            <div className="placeholder-icon">🔍</div>
                            <p>Selecione uma interação na lista para inspecionar o trace completo.</p>
                        </div>
                    ) : (
                        <>
                            {/* Turno: Paciente → IA */}
                            <section className="card turn-section">
                                <h4 className="panel-title">Turno da Conversa</h4>
                                <div className="turn-grid">
                                    <div className="turn-card patient">
                                        <span className="turn-label">Paciente</span>
                                        <p>{getPatientMessage(selectedLog.details)}</p>
                                    </div>
                                    <div className="turn-card assistant">
                                        <span className="turn-label">IA (Resposta Final)</span>
                                        <p>{getAiResponse(selectedLog.details)}</p>
                                    </div>
                                </div>
                            </section>

                            {/* Ação: Ramificar Teste */}
                            <section className="card replay-action-section">
                                <div className="replay-action-row">
                                    <button className="btn-replay" onClick={handleStartReplay} disabled={replayLoading}>
                                        🔬 Ramificar Teste
                                    </button>
                                    <small>Cria uma ramificação de laboratório a partir deste trace real.</small>
                                </div>
                            </section>

                            {/* Avaliação */}
                            <section className="card eval-section">
                                <h4 className="panel-title">Avaliação Qualitativa</h4>
                                <div className="eval-row">
                                    <div className="eval-buttons">
                                        <button className={`btn-eval good ${selectedLog.evaluation === 'GOOD' ? 'active' : ''}`} onClick={() => handleSaveEvaluation('GOOD')} disabled={saving}>✓ Boa</button>
                                        <button className={`btn-eval bad ${selectedLog.evaluation === 'BAD' ? 'active' : ''}`} onClick={() => handleSaveEvaluation('BAD')} disabled={saving}>✗ Ruim</button>
                                        <button className={`btn-eval critical ${selectedLog.evaluation === 'CRITICAL' ? 'active' : ''}`} onClick={() => handleSaveEvaluation('CRITICAL')} disabled={saving}>⚠ Crítica</button>
                                    </div>
                                    <textarea
                                        placeholder="Observação da auditoria (opcional)..."
                                        value={evalNote}
                                        onChange={e => setEvalNote(e.target.value)}
                                        rows={2}
                                    />
                                    {selectedLog.evaluatedAt && (
                                        <small className="eval-stamp">Revisado por {selectedLog.evaluatedBy} em {format(new Date(selectedLog.evaluatedAt), "dd/MM/yy HH:mm")}</small>
                                    )}
                                </div>
                            </section>

                            {/* Inspector */}
                            <section className="card inspector-section">
                                <div className="inspector-tabs">
                                    <button className={`tab-btn ${activeTab === 'resumo' ? 'active' : ''}`} onClick={() => setActiveTab('resumo')}>Resumo</button>
                                    <button className={`tab-btn ${activeTab === 'prompt' ? 'active' : ''}`} onClick={() => setActiveTab('prompt')}>Prompt</button>
                                    <button className={`tab-btn ${activeTab === 'contexto' ? 'active' : ''}`} onClick={() => setActiveTab('contexto')}>Contexto</button>
                                    <button className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`} onClick={() => setActiveTab('json')}>JSON Completo</button>
                                </div>
                                <div className="inspector-viewport">
                                    {activeTab === 'resumo' && (
                                        <div className="summary-grid">
                                            <div className="summary-card">
                                                <label>Intenção Detectada</label>
                                                <span>{selectedLog.details?.invocations?.[0]?.response?.estado_paciente || "—"}</span>
                                            </div>
                                            <div className="summary-card">
                                                <label>Ação Backend</label>
                                                <span className="action-tag">{selectedLog.details?.finalOutput?.actionFinal || "—"}</span>
                                            </div>
                                            <div className="summary-card">
                                                <label>Latência Total</label>
                                                <span>{selectedLog.details?.metadata?.totalLatencyMs ? `${selectedLog.details.metadata.totalLatencyMs}ms` : "—"}</span>
                                            </div>
                                            <div className="summary-card">
                                                <label>Contato</label>
                                                <span>{getContactLabel(selectedLog.details)}</span>
                                            </div>
                                        </div>
                                    )}
                                    {activeTab === 'prompt' && (
                                        <pre className="code-block">{selectedLog.details?.invocations?.[0]?.request?.messages?.[0]?.content || "(prompt não disponível)"}</pre>
                                    )}
                                    {activeTab === 'contexto' && (
                                        <pre className="code-block">{JSON.stringify(selectedLog.details?.input?.clinicContextSnapshot, null, 2) || "(contexto não disponível)"}</pre>
                                    )}
                                    {activeTab === 'json' && (
                                        <pre className="code-block">{JSON.stringify(selectedLog.details, null, 2)}</pre>
                                    )}
                                </div>
                            </section>
                        </>
                    )}
                </main>
            </div>

            {/* ── REPLAY LABORATORY MODAL ──────────────── */}
            {replayOpen && (
                <div className="replay-overlay" onClick={() => setReplayOpen(false)}>
                    <div className="replay-modal" onClick={e => e.stopPropagation()}>
                        <div className="replay-modal-header">
                            <h3>🔬 Laboratório de Replay</h3>
                            <button className="btn-close" onClick={() => setReplayOpen(false)}>×</button>
                        </div>

                        {replayLoading && !replayCandidateResponse ? (
                            <div className="empty-panel">Congelando snapshot e preparando experimento...</div>
                        ) : (
                            <div className="replay-modal-body">
                                {/* Editor de Prompt */}
                                <div className="replay-section">
                                    <h4 className="panel-title">Prompt Candidato</h4>
                                    <small className="replay-hint">Edite o prompt abaixo e execute o replay para ver como a IA responde.</small>
                                    <textarea
                                        className="replay-prompt-editor"
                                        value={replayPrompt}
                                        onChange={e => setReplayPrompt(e.target.value)}
                                        rows={12}
                                    />
                                    <button className="btn-action replay-run-btn" onClick={handleRunReplay} disabled={replayLoading}>
                                        {replayLoading ? "Executando..." : "▶ Executar Replay"}
                                    </button>
                                </div>

                                {/* Comparação */}
                                {replayCandidateResponse !== null && (
                                    <div className="replay-section">
                                        <h4 className="panel-title">Comparação: Original vs Candidato</h4>
                                        <div className="replay-compare-grid">
                                            <div className="replay-compare-card original">
                                                <span className="replay-compare-label">Resposta Original</span>
                                                <p>{replayOriginalResponse}</p>
                                            </div>
                                            <div className="replay-compare-card candidate">
                                                <span className="replay-compare-label">Resposta Candidata</span>
                                                <p>{replayCandidateResponse}</p>
                                            </div>
                                        </div>

                                        {/* Veredicto */}
                                        <div className="replay-verdict-section">
                                            <h4 className="panel-title">Veredicto</h4>
                                            <div className="verdict-buttons">
                                                <button className={`btn-verdict better ${replayVerdict === 'BETTER' ? 'active' : ''}`} onClick={() => setReplayVerdict('BETTER')}>✓ Melhor</button>
                                                <button className={`btn-verdict equivalent ${replayVerdict === 'EQUIVALENT' ? 'active' : ''}`} onClick={() => setReplayVerdict('EQUIVALENT')}>≡ Equivalente</button>
                                                <button className={`btn-verdict worse ${replayVerdict === 'WORSE' ? 'active' : ''}`} onClick={() => setReplayVerdict('WORSE')}>✗ Pior</button>
                                            </div>
                                            <textarea
                                                placeholder="Observação do veredicto (opcional)..."
                                                value={replayVerdictNote}
                                                onChange={e => setReplayVerdictNote(e.target.value)}
                                                rows={2}
                                            />
                                            <button className="btn-action" onClick={handleSaveVerdict} disabled={!replayVerdict || replaySaving}>
                                                {replaySaving ? "Salvando..." : "Salvar Veredicto"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
