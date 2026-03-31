"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import "./logs.css";
import { formatLogTime } from "@/lib/date";

interface LogEntry {
  id: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  event: string;
  details: string;
  createdAt: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const levelParam = levelFilter === "ALL" ? "" : `&level=${levelFilter}`;
      const res = await fetch(`/api/logs?page=1&pageSize=100${levelParam}`);
      if (!res.ok) throw new Error("Falha ao buscar logs");
      const result = await res.json();
      setLogs(result.data || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error("Fetch logs error:", err);
    } finally {
      setLoading(false);
    }
  }, [levelFilter]);

  // Initial fetch and manual refresh
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  // Local filtering logic
  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(log => 
      log.event.toLowerCase().includes(q) || 
      log.details.toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  // Summary extractor helper
  const getLogSummary = (detailsStr: string) => {
    try {
      const details = JSON.parse(detailsStr);
      const summary = details.note || details.patientMessage || details.action || details.message || "";
      if (typeof summary !== 'string') return "";
      return summary.length > 80 ? summary.substring(0, 80) + "..." : summary;
    } catch {
      return detailsStr.length > 80 ? detailsStr.substring(0, 80) + "..." : detailsStr;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("Copiado para a área de transferência!");
    });
  };

  const handleDownload = async (limit: number) => {
    try {
      const res = await fetch(`/api/logs/export?limit=${limit}`);
      if (!res.ok) throw new Error("Falha ao baixar logs");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = `logs-export-${limit}.md`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      alert("Erro ao baixar relatório de logs.");
    }
  };

  const copyAllVisible = () => {
    const text = filteredLogs.map(log => {
      const time = formatLogTime(log.createdAt);
      const summary = getLogSummary(log.details);
      return `[${time}] [${log.level}] ${log.event} — ${summary}`;
    }).join("\n");
    copyToClipboard(text);
  };

  return (
    <div className="logs-container">
      {/* Barra de Controles */}
      <div className="logs-controls">
        <div className="level-filters">
          {["ALL", "INFO", "WARN", "ERROR"].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`filter-btn ${lvl.toLowerCase()} ${levelFilter === lvl ? "active" : ""}`}
            >
              {lvl === "ALL" ? "Todos" : lvl}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Buscar no evento ou detalhes..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="control-actions">
          <button className="action-btn" onClick={() => fetchLogs()} disabled={loading}>
            <span>↻</span> {loading ? "Carregando..." : "Atualizar"}
          </button>
          
          <button className="action-btn" onClick={() => handleDownload(50)}>
            <span>📥</span> Baixar 50
          </button>

          <button className="action-btn" onClick={() => handleDownload(100)}>
            <span>📥</span> Baixar 100
          </button>
          
          <button className="action-btn" onClick={copyAllVisible}>
            <span>📋</span> Copiar logs
          </button>

          <label className="auto-refresh">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)} 
            />
            Auto (10s)
          </label>
        </div>

        <div className="log-count">
          Exibindo {filteredLogs.length} de {total} registros
        </div>
      </div>

      {/* Lista de Logs */}
      <div className="logs-list">
        {filteredLogs.length === 0 && !loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Nenhum registro encontrado para os filtros atuais.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="log-row-container">
              <div 
                className="log-row" 
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <div className="log-timestamp">{formatLogTime(log.createdAt)}</div>
                <div className="log-level-col">
                  <span className={`badge ${log.level.toLowerCase()}`}>{log.level}</span>
                </div>
                <div className="log-event-col">{log.event}</div>
                <div className="log-summary-col">{getLogSummary(log.details)}</div>
              </div>

              {/* Accordion Detail */}
              {expandedId === log.id && (
                <div className="log-detail">
                  <div className="detail-header">
                    <span className="detail-title">Metadados Completos</span>
                    <button 
                      className="copy-inner-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(JSON.stringify(JSON.parse(log.details), null, 2));
                      }}
                    >
                      Copiar JSON
                    </button>
                  </div>
                  <pre>{JSON.stringify(JSON.parse(log.details), null, 2)}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
