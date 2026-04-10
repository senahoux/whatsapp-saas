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

    // ── Forensic Replay States ──────────────────────
    const [replayTab, setReplayTab] = useState<'prompt' | 'json' | 'contexto' | 'comparacao'>('prompt');
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<number[]>([]);
    const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
    const [showSearch, setShowSearch] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [candidateTrace, setCandidateTrace] = useState<any>(null);

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
        setCandidateTrace(null);
        setReplayVerdict(null);
        setReplayVerdictNote("");
        setReplayTab('prompt'); // Reset para a aba principal
        setHasUnsavedChanges(false);
        try {
            const res = await fetch("/api/admin/replay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceLogId: selectedLog.id })
            });
            const data = await res.json();
            if (data.ok) {
                setReplayExperimentId(data.experiment.id);
                // Prioridade: Invocations[0] request content (bruto)
                const traceRaw = data.experiment.frozenSnapshot.metadata?.traceId ? data.experiment.frozenSnapshot : null;
                setReplayPrompt(data.experiment.candidatePrompt || data.experiment.frozenSnapshot.originalPrompt);
                setReplayOriginalResponse(data.experiment.originalResponse);
                setCandidateTrace(data.experiment.candidateTrace || null);
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
                setCandidateTrace(data.trace);
                setReplayTab('comparacao'); // Muda para a aba de comparação após rodar
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
            setHasUnsavedChanges(false);
            setReplayOpen(false);
        } catch {
            alert("Erro ao salvar veredicto.");
        } finally {
            setReplaySaving(false);
        }
    }

    // ── Internal Search Engine ────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!replayOpen) return;
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                setShowSearch(true);
                setTimeout(() => document.getElementById('internal-search-input')?.focus(), 50);
            }
            if (showSearch && e.key === 'Enter') {
                if (e.shiftKey) {
                    navigateSearch(-1);
                } else {
                    navigateSearch(1);
                }
            }
            if (e.key === 'Escape') {
                setShowSearch(false);
                setSearchQuery("");
                setSearchResults([]);
                setActiveSearchIndex(-1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [replayOpen, showSearch, searchQuery, searchResults, activeSearchIndex]);

    // Auto-scroll para a ocorrência ativa
    useEffect(() => {
        if (activeSearchIndex !== -1 && showSearch) {
            // Pequeno delay para garantir que o render do realce terminou
            setTimeout(() => {
                const activeEl = document.querySelector('.search-highlight.active');
                if (activeEl) {
                    activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                // Para o textarea, a lógica é diferente (seleção de texto)
                if (replayTab === 'prompt') {
                    const textarea = document.querySelector('.replay-prompt-editor') as HTMLTextAreaElement;
                    if (textarea && searchResults[activeSearchIndex] !== undefined) {
                        const start = searchResults[activeSearchIndex];
                        const end = start + searchQuery.length;
                        textarea.focus();
                        textarea.setSelectionRange(start, end);
                        
                        // Scroll manual aproximado para o textarea se necessário
                        const lineHeight = 20; // Aproximado
                        const textBefore = replayPrompt.substring(0, start);
                        const linesBefore = textBefore.split('\n').length;
                        textarea.scrollTop = (linesBefore * lineHeight) - (textarea.clientHeight / 2);
                    }
                }
            }, 50);
        }
    }, [activeSearchIndex, showSearch, replayTab, searchResults, searchQuery]);

    function performSearch(query: string) {
        setSearchQuery(query);
        if (!query || query.length < 2) {
            setSearchResults([]);
            setActiveSearchIndex(-1);
            return;
        }

        // Busca básica por texto na aba ativa
        let contentToSearch = "";
        if (replayTab === 'prompt') contentToSearch = replayPrompt;
        if (replayTab === 'json') contentToSearch = JSON.stringify({ original: selectedLog?.details, candidate: candidateTrace }, null, 2);
        if (replayTab === 'contexto') contentToSearch = JSON.stringify(selectedLog?.details?.input?.clinicContextSnapshot, null, 2);

        const regex = new RegExp(query, 'gi');
        const matches = [];
        let match;
        while ((match = regex.exec(contentToSearch)) !== null) {
            matches.push(match.index);
        }

        setSearchResults(matches);
        setActiveSearchIndex(matches.length > 0 ? 0 : -1);
    }

    function navigateSearch(direction: number) {
        if (searchResults.length === 0) return;
        let nextIndex = activeSearchIndex + direction;
        if (nextIndex >= searchResults.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = searchResults.length - 1;
        setActiveSearchIndex(nextIndex);
    }

    const highlightText = (text: string) => {
        if (!searchQuery || searchQuery.length < 2) return text;
        const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
        let matchCount = 0;
        return (
            <>
                {parts.map((part, i) => {
                    const isMatch = part.toLowerCase() === searchQuery.toLowerCase();
                    if (isMatch) {
                        const currentMatchIndex = matchCount;
                        matchCount++;
                        return (
                            <span 
                                key={i} 
                                className={`search-highlight ${activeSearchIndex === currentMatchIndex ? 'active' : ''}`}
                            >
                                {part}
                            </span>
                        );
                    }
                    return part;
                })}
            </>
        );
    };

    function handleCloseReplay() {
        if (hasUnsavedChanges) {
            if (!window.confirm("Você tem alterações não salvas no prompt. Deseja realmente sair?")) {
                return;
            }
        }
        setReplayOpen(false);
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
                <div className="replay-overlay" onClick={handleCloseReplay}>
                    <div className="replay-modal" onClick={e => e.stopPropagation()}>
                        <div className="replay-modal-header">
                            <div className="header-left">
                                <h3>🔬 Laboratório de Replay</h3>
                                <div className="replay-tabs-nav">
                                    <button className={`tab-link ${replayTab === 'prompt' ? 'active' : ''}`} onClick={() => setReplayTab('prompt')}>Prompt Bruto</button>
                                    <button className={`tab-link ${replayTab === 'json' ? 'active' : ''}`} onClick={() => setReplayTab('json')}>JSON Completo</button>
                                    <button className={`tab-link ${replayTab === 'contexto' ? 'active' : ''}`} onClick={() => setReplayTab('contexto')}>Contexto</button>
                                    <button className={`tab-link ${replayTab === 'comparacao' ? 'active' : ''}`} onClick={() => setReplayTab('comparacao')}>Comparação</button>
                                </div>
                            </div>
                            <div className="header-right">
                                <button className="btn-close" onClick={handleCloseReplay}>×</button>
                            </div>
                        </div>

                        {/* Barra de Busca Interna */}
                        {showSearch && (
                            <div className="internal-search-bar">
                                <div className="search-input-wrapper">
                                    <input
                                        id="internal-search-input"
                                        type="text"
                                        placeholder="Buscar neste conteúdo..."
                                        value={searchQuery}
                                        onChange={e => performSearch(e.target.value)}
                                        autoComplete="off"
                                    />
                                    {searchResults.length > 0 && (
                                        <span className="search-counter">
                                            {activeSearchIndex + 1} de {searchResults.length}
                                        </span>
                                    )}
                                    {searchQuery && searchResults.length === 0 && (
                                        <span className="search-no-results">Nenhuma ocorrência</span>
                                    )}
                                </div>
                                <div className="search-nav-buttons">
                                    <button className="btn-search-nav" onClick={() => navigateSearch(-1)} title="Anterior (Shift+Enter)">↑</button>
                                    <button className="btn-search-nav" onClick={() => navigateSearch(1)} title="Próximo (Enter)">↓</button>
                                    <button className="btn-search-nav clear" onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); setActiveSearchIndex(-1); }}>×</button>
                                </div>
                            </div>
                        )}

                        {replayLoading && !replayCandidateResponse ? (
                            <div className="empty-panel modal-loading">Congelando snapshot e preparando experimento...</div>
                        ) : (
                            <div className="replay-modal-body">
                                {/* Aba 1: Prompt Bruto */}
                                {replayTab === 'prompt' && (
                                    <div className="replay-section">
                                        <h4 className="panel-title">Prompt bruto da execução original</h4>
                                        <small className="replay-hint">Você está editando o system prompt real daquele trace.</small>
                                        <textarea
                                            className="replay-prompt-editor"
                                            value={replayPrompt}
                                            onChange={e => { setReplayPrompt(e.target.value); setHasUnsavedChanges(true); }}
                                            rows={20}
                                            spellCheck={false}
                                        />
                                        <div className="editor-footer">
                                            <button className="btn-action replay-run-btn" onClick={handleRunReplay} disabled={replayLoading}>
                                                {replayLoading ? "Executando..." : "▶ Executar Replay"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Aba 2: JSON */}
                                {replayTab === 'json' && (
                                    <div className="replay-section">
                                        <h4 className="panel-title">Forense: Traces Completos</h4>
                                        <div className="json-compare-view">
                                            <div className="json-block">
                                                <label>Original Trace (AI_FULL_TRACE)</label>
                                                <pre className="code-block read-only">
                                                    {highlightText(JSON.stringify(selectedLog?.details, null, 2))}
                                                </pre>
                                            </div>
                                            {candidateTrace && (
                                                <div className="json-block">
                                                    <label>Candidate Trace (Replay)</label>
                                                    <pre className="code-block read-only">
                                                        {highlightText(JSON.stringify(candidateTrace, null, 2))}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Aba 3: Contexto */}
                                {replayTab === 'contexto' && (
                                    <div className="replay-section">
                                        <h4 className="panel-title">Contexto de Clínica (Congelado)</h4>
                                        <pre className="code-block read-only">
                                            {highlightText(JSON.stringify(selectedLog?.details?.input?.clinicContextSnapshot, null, 2))}
                                        </pre>
                                    </div>
                                )}

                                {/* Aba 4: Comparação */}
                                {replayTab === 'comparacao' && (
                                    <div className="replay-section">
                                        <h4 className="panel-title">Comparação: Original vs Candidato</h4>
                                        
                                        <div className="replay-metrics-row">
                                            <div className="metric">
                                                <label>Latência Original</label>
                                                <span>{selectedLog?.details?.metadata?.totalLatencyMs}ms</span>
                                            </div>
                                            <div className="metric">
                                                <label>Latência Candidata</label>
                                                <span className={candidateTrace?.metadata?.totalLatencyMs > selectedLog?.details?.metadata?.totalLatencyMs ? 'worse' : 'better'}>
                                                    {candidateTrace?.metadata?.totalLatencyMs}ms
                                                </span>
                                            </div>
                                            <div className="metric">
                                                <label>Tokens (Total)</label>
                                                <span>{ (candidateTrace?.invocations?.[0]?.response_meta?.usage?.total_tokens) || '—' }</span>
                                            </div>
                                        </div>

                                        <div className="replay-compare-grid">
                                            <div className="replay-compare-card original">
                                                <div className="card-header">
                                                    <span className="replay-compare-label">Resposta Original</span>
                                                    <span className="action-tag">{selectedLog?.details?.finalOutput?.actionFinal}</span>
                                                </div>
                                                <p>{replayOriginalResponse}</p>
                                            </div>
                                            <div className="replay-compare-card candidate">
                                                <div className="card-header">
                                                    <span className="replay-compare-label">Resposta Candidata</span>
                                                    <span className="action-tag">{candidateTrace?.finalOutput?.actionFinal}</span>
                                                </div>
                                                <p>{replayCandidateResponse || "Aguardando execução..."}</p>
                                            </div>
                                        </div>

                                        {/* Veredicto */}
                                        <div className="replay-verdict-section card">
                                            <h4 className="panel-title">Veredicto Qualitativo</h4>
                                            <div className="verdict-buttons">
                                                <button className={`btn-verdict better ${replayVerdict === 'BETTER' ? 'active' : ''}`} onClick={() => setReplayVerdict('BETTER')}>✓ Melhor</button>
                                                <button className={`btn-verdict equivalent ${replayVerdict === 'EQUIVALENT' ? 'active' : ''}`} onClick={() => setReplayVerdict('EQUIVALENT')}>≡ Equivalente</button>
                                                <button className={`btn-verdict worse ${replayVerdict === 'WORSE' ? 'active' : ''}`} onClick={() => setReplayVerdict('WORSE')}>✗ Pior</button>
                                            </div>
                                            <textarea
                                                placeholder="Por que esta versão é melhor/pior? (Opcional)"
                                                value={replayVerdictNote}
                                                onChange={e => setReplayVerdictNote(e.target.value)}
                                                rows={2}
                                            />
                                            <button className="btn-action save-btn" onClick={handleSaveVerdict} disabled={!replayVerdict || replaySaving}>
                                                {replaySaving ? "Salvando..." : "Finalizar Experimento"}
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
