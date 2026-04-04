import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import "./audit.module.css";

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

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: "15"
            });
            if (filter.evaluation !== "ALL") params.append("evaluation", filter.evaluation);
            if (filter.startDate) params.append("startDate", filter.startDate);
            if (filter.endDate) params.append("endDate", filter.endDate);

            const res = await fetch(`/api/admin/audit?${params.toString()}`);
            const data = await res.json();
            if (data.ok) {
                setLogs(data.data);
                setTotal(data.total);
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

    return (
        <div className="audit-container">
            <header className="audit-header">
                <div className="header-info">
                    <h1>Auditoria de Conversas</h1>
                    <p>Revisão forense e feedback de qualidade para a IA.</p>
                </div>
                <div className="audit-filters">
                    <select value={filter.evaluation} onChange={e => setFilter({ ...filter, evaluation: e.target.value })}>
                        <option value="ALL">Todas</option>
                        <option value="PENDING">Não Revisadas</option>
                        <option value="GOOD">Boas</option>
                        <option value="BAD">Ruins</option>
                        <option value="CRITICAL">Críticas</option>
                    </select>
                    <input type="date" value={filter.startDate} onChange={e => setFilter({ ...filter, startDate: e.target.value })} />
                    <input type="date" value={filter.endDate} onChange={e => setFilter({ ...filter, endDate: e.target.value })} />
                    <button onClick={() => setPage(1)} className="btn-refresh">Filtrar</button>
                </div>
            </header>
            <main className="audit-layout">
                <aside className="audit-sidebar">
                    {loading ? (
                        <div className="loading-state">Carregando traces...</div>
                    ) : (
                        <div className="log-list">
                            {logs.map(log => (
                                <div
                                    key={log.id}
                                    className={`log-item ${selectedLog?.id === log.id ? 'active' : ''} ${log.evaluation || 'PENDING'}`}
                                    onClick={() => { setSelectedLog(log); setEvalNote(log.evaluationNote || ""); }}
                                >
                                    <div className="log-item-meta">
                                        <span>{format(new Date(log.createdAt), "HH:mm:ss dd/MM", { locale: ptBR })}</span>
                                        <span className={`badge ${log.evaluation || 'PENDING'}`}>{log.evaluation || 'PENDING'}</span>
                                    </div>
                                    <div className="log-item-preview">
                                        {log.details?.input?.patientMessage?.substring(0, 45)}...
                                    </div>
                                </div>
                            ))}
                            {logs.length === 0 && <div className="empty-state">Nenhum log encontrado.</div>}
                        </div>
                    )}
                    <div className="pagination-controls">
                        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
                        <span>Página {page}</span>
                        <button disabled={logs.length < 15} onClick={() => setPage(p => p + 1)}>Próxima</button>
                    </div>
                </aside>
                <section className="audit-details">
                    {!selectedLog ? (
                        <div className="details-placeholder">Selecione uma interação para auditar.</div>
                    ) : (
                        <div className="audit-workspace">
                            <div className="workspace-top">
                                <div className="turn-summary">
                                    <div className="turn-bubble user">
                                        <small>Paciente</small>
                                        <p>{selectedLog.details?.input?.patientMessage}</p>
                                    </div>
                                    <div className="turn-bubble ai">
                                        <small>IA (Resposta Final)</small>
                                        <p>{selectedLog.details?.finalOutput?.messageSent || selectedLog.details?.finalOutput?.messageText}</p>
                                    </div>
                                </div>
                                <div className="evaluation-panel">
                                    <h3>Avaliação Qualitativa</h3>
                                    <div className="eval-buttons">
                                        <button className={`btn-eval good ${selectedLog.evaluation === 'GOOD' ? 'selected' : ''}`} onClick={() => handleSaveEvaluation('GOOD')} disabled={saving}>Boa</button>
                                        <button className={`btn-eval bad ${selectedLog.evaluation === 'BAD' ? 'selected' : ''}`} onClick={() => handleSaveEvaluation('BAD')} disabled={saving}>Ruim</button>
                                        <button className={`btn-eval critical ${selectedLog.evaluation === 'CRITICAL' ? 'selected' : ''}`} onClick={() => handleSaveEvaluation('CRITICAL')} disabled={saving}>Crítica</button>
                                    </div>
                                    <textarea placeholder="Observação da auditoria..." value={evalNote} onChange={e => setEvalNote(e.target.value)} />
                                    {selectedLog.evaluatedAt && (
                                        <small className="audit-timestamp">Revisado por {selectedLog.evaluatedBy} em {format(new Date(selectedLog.evaluatedAt), "dd/MM/yy HH:mm")}</small>
                                    )}
                                </div>
                            </div>
                            <div className="audit-inspector">
                                <div className="inspector-tabs">
                                    <button className={activeTab === 'resumo' ? 'active' : ''} onClick={() => setActiveTab('resumo')}>Resumo</button>
                                    <button className={activeTab === 'prompt' ? 'active' : ''} onClick={() => setActiveTab('prompt')}>Prompt</button>
                                    <button className={activeTab === 'contexto' ? 'active' : ''} onClick={() => setActiveTab('contexto')}>Contexto</button>
                                    <button className={activeTab === 'json' ? 'active' : ''} onClick={() => setActiveTab('json')}>JSON</button>
                                </div>
                                <div className="inspector-content-audit">
                                    {activeTab === 'resumo' && (
                                        <div className="summary-view">
                                            <div className="a-card">
                                                <label>Intenção</label>
                                                <span>{selectedLog.details?.invocations?.[0]?.response?.estado_paciente || "-"}</span>
                                            </div>
                                            <div className="a-card">
                                                <label>Ação Backend</label>
                                                <span className={`badge-action ${selectedLog.details?.finalOutput?.actionFinal}`}>{selectedLog.details?.finalOutput?.actionFinal}</span>
                                            </div>
                                            <div className="a-card">
                                                <label>Latência</label>
                                                <span>{selectedLog.details?.metadata?.totalLatencyMs}ms</span>
                                            </div>
                                        </div>
                                    )}
                                    {activeTab === 'prompt' && (
                                        <div className="prompt-view-audit"><pre>{selectedLog.details?.invocations?.[0]?.request?.messages?.[0]?.content}</pre></div>
                                    )}
                                    {activeTab === 'contexto' && (
                                        <div className="context-view-audit"><pre>{JSON.stringify(selectedLog.details?.input?.clinicContextSnapshot, null, 2)}</pre></div>
                                    )}
                                    {activeTab === 'json' && (
                                        <pre className="json-view-audit">{JSON.stringify(selectedLog.details, null, 2)}</pre>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
