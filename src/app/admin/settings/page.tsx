"use client";

import { useEffect, useState } from "react";
import "./settings.css";

const WEEKDAYS = [
    { value: 1, label: "Seg" },
    { value: 2, label: "Ter" },
    { value: 3, label: "Qua" },
    { value: 4, label: "Qui" },
    { value: 5, label: "Sex" },
    { value: 6, label: "Sáb" },
    { value: 0, label: "Dom" },
];

interface WorkingShift {
    period: string;
    start: string;
    end: string;
}

export default function SettingsPage() {
    const [clinic, setClinic] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    // Operacional
    const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [workingShifts, setWorkingShifts] = useState<WorkingShift[]>([
        { period: "manha", start: "08:00", end: "12:00" },
        { period: "tarde", start: "13:00", end: "18:00" },
    ]);
    const [prioritySuggestions, setPrioritySuggestions] = useState<any[]>([]);
    const [newSuggestion, setNewSuggestion] = useState({ date: "", period: "manha" });

    // Clínica Info
    const [nomeClinica, setNomeClinica] = useState("");
    const [nomeMedico, setNomeMedico] = useState("");
    const [endereco, setEndereco] = useState("");
    const [telefone, setTelefone] = useState("");
    const [consultaValor, setConsultaValor] = useState(0);
    const [consultaDuracao, setConsultaDuracao] = useState(0);
    const [descricaoServicos, setDescricaoServicos] = useState("");

    // IA Config
    const [nomeAssistente, setNomeAssistente] = useState("Assistente");
    const [aiContextMode, setAiContextMode] = useState("LEGACY");
    const [faq, setFaq] = useState<{ pergunta: string; resposta: string }[]>([]);
    const [regrasPersonalizadas, setRegrasPersonalizadas] = useState<string[]>([]);

    useEffect(() => {
        fetch(`/api/settings`)
            .then(res => res.json())
            .then(data => {
                const { clinic } = data;
                setClinic(clinic);
                
                // Dados Básicos
                setNomeClinica(clinic.nomeClinica || "");
                setNomeMedico(clinic.nomeMedico || "");
                setEndereco(clinic.endereco || "");
                setTelefone(clinic.telefone || "");
                setConsultaValor(clinic.consultaValor || 0);
                setConsultaDuracao(clinic.consultaDuracao || 0);
                setDescricaoServicos(clinic.descricaoServicos || "");

                // IA Config
                setNomeAssistente(clinic.nomeAssistente || "Assistente");
                setAiContextMode(clinic.aiContextMode || "LEGACY");

                // Parse de FAQ e Regras
                try { 
                    if (clinic.faq) setFaq(JSON.parse(clinic.faq));
                } catch { setFaq([]); }

                try {
                    if (clinic.regrasPersonalizadas) setRegrasPersonalizadas(JSON.parse(clinic.regrasPersonalizadas));
                } catch { setRegrasPersonalizadas([]); }

                // Carregar configurações de calendário da clínica
                if (clinic.workingDays) setWorkingDays(clinic.workingDays);
                if (clinic.workingShifts) setWorkingShifts(clinic.workingShifts);
                if (clinic.prioritySuggestions) setPrioritySuggestions(clinic.prioritySuggestions);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    async function handleSave() {
        setSaving(true);
        setMessage("");

        try {
            const res = await fetch(`/api/settings`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // Operacional
                    robotEnabled: clinic.settings.robotEnabled,
                    debounceSeconds: Number(clinic.settings.debounceSeconds),
                    workingDays,
                    workingShifts,
                    prioritySuggestions,
                    // Clínica
                    nomeClinica,
                    nomeMedico,
                    endereco,
                    telefone,
                    consultaValor: Number(consultaValor),
                    consultaDuracao: Number(consultaDuracao),
                    descricaoServicos,
                    faq,
                    // IA
                    nomeAssistente,
                    aiContextMode,
                    regrasPersonalizadas
                }),
            });

            if (res.ok) {
                setMessage("Configurações salvas com sucesso!");
                setTimeout(() => setMessage(""), 3000);
            } else {
                setMessage("Falha ao salvar configurações.");
            }
        } catch (err) {
            setMessage("Erro na conexão.");
        } finally {
            setSaving(false);
        }
    }

    // ── Handlers ────────────────────────────────────

    function toggleDay(day: number) {
        setWorkingDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
        );
    }

    function updateShift(index: number, field: keyof WorkingShift, value: string) {
        const updated = [...workingShifts];
        updated[index] = { ...updated[index], [field]: value };
        setWorkingShifts(updated);
    }

    function addShift() {
        setWorkingShifts([...workingShifts, { period: "manha", start: "08:00", end: "12:00" }]);
    }

    function removeShift(index: number) {
        if (workingShifts.length <= 1) return; // mínimo 1 turno
        setWorkingShifts(workingShifts.filter((_, i) => i !== index));
    }

    function addSuggestion() {
        if (!newSuggestion.date) return;
        setPrioritySuggestions([...prioritySuggestions, newSuggestion]);
        setNewSuggestion({ date: "", period: "manha" });
    }

    function removeSuggestion(index: number) {
        setPrioritySuggestions(prioritySuggestions.filter((_, i) => i !== index));
    }

    // ── FAQ Handlers ────────────────────────────────
    function addFaq() {
        setFaq([...faq, { pergunta: "", resposta: "" }]);
    }

    function updateFaq(index: number, field: "pergunta" | "resposta", value: string) {
        const updated = [...faq];
        updated[index] = { ...updated[index], [field]: value };
        setFaq(updated);
    }

    function removeFaq(index: number) {
        setFaq(faq.filter((_, i) => i !== index));
    }

    // ── Regras Handlers ─────────────────────────────
    function addRegra() {
        setRegrasPersonalizadas([...regrasPersonalizadas, ""]);
    }

    function updateRegra(index: number, value: string) {
        const updated = [...regrasPersonalizadas];
        updated[index] = value;
        setRegrasPersonalizadas(updated);
    }

    function removeRegra(index: number) {
        setRegrasPersonalizadas(regrasPersonalizadas.filter((_, i) => i !== index));
    }

    // ── Render ──────────────────────────────────────

    if (loading) return <div className="loading">Carregando...</div>;
    if (!clinic) return <div className="error">Clínica não encontrada.</div>;
    if (!clinic.settings) return <div className="error">Configurações operacionais ainda não inicializadas para esta unidade.</div>;

    const { settings } = clinic;

    return (
        <div className="settings-container">
            <header className="page-header">
                <h2 className="page-title">Configurações da Unidade</h2>
                <div className="clinic-badge">
                    ID: <code>{clinic.id}</code> — <span className={`status-dot ${aiContextMode}`}></span> {aiContextMode} Mode
                </div>
            </header>

            {/* ── Seção: Informações da Clínica ────────────────── */}
            <section className="settings-section">
                <div className="section-header">
                    <h3>🏥 Informações da Clínica</h3>
                    <p>Dados básicos usados para identificação e no prompt da IA.</p>
                </div>
                <div className="card">
                    <div className="settings-grid">
                        <div className="form-group">
                            <label>Nome da Clínica</label>
                            <input value={nomeClinica} onChange={e => setNomeClinica(e.target.value)} placeholder="Ex: Clínica Nova Vida" />
                        </div>
                        <div className="form-group">
                            <label>Médico / Profissional Responsável</label>
                            <input value={nomeMedico} onChange={e => setNomeMedico(e.target.value)} placeholder="Ex: Dr. Lucas Sena" />
                        </div>
                        <div className="form-group">
                            <label>Telefone Exibido</label>
                            <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="Ex: (11) 99999-9999" />
                        </div>
                        <div className="form-group">
                            <label>Valor da Consulta (R$)</label>
                            <input type="number" value={consultaValor} onChange={e => setConsultaValor(Number(e.target.value))} />
                        </div>
                        <div className="form-group">
                            <label>Duração da Consulta (Minutos)</label>
                            <input type="number" value={consultaDuracao} onChange={e => setConsultaDuracao(Number(e.target.value))} />
                        </div>
                        <div className="form-group full-width">
                            <label>Endereço Completo</label>
                            <input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, Número, Bairro, Cidade - UF" />
                        </div>
                        <div className="form-group full-width">
                            <label>Descrição dos Serviços</label>
                            <textarea 
                                value={descricaoServicos} 
                                onChange={e => setDescricaoServicos(e.target.value)} 
                                placeholder="Descreva brevemente o que a clínica faz..."
                                rows={3}
                            />
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h4>❓ FAQ (Perguntas Frequentes)</h4>
                        <button type="button" onClick={addFaq} className="btn-small">+ Adicionar</button>
                    </div>
                    <div className="dynamic-list">
                        {faq.map((item, i) => (
                            <div key={i} className="faq-row">
                                <div className="faq-inputs">
                                    <input 
                                        placeholder="Pergunta (ex: Atende convênio?)" 
                                        value={item.pergunta} 
                                        onChange={e => updateFaq(i, "pergunta", e.target.value)} 
                                    />
                                    <textarea 
                                        placeholder="Resposta curta e direta..." 
                                        value={item.resposta} 
                                        onChange={e => updateFaq(i, "resposta", e.target.value)} 
                                        rows={2}
                                    />
                                </div>
                                <button type="button" onClick={() => removeFaq(i)} className="btn-icon">×</button>
                            </div>
                        ))}
                        {faq.length === 0 && <p className="empty-msg">Nenhuma pergunta frequente cadastrada.</p>}
                    </div>
                </div>
            </section>

            {/* ── Seção: Configurações da IA ────────────────────── */}
            <section className="settings-section">
                <div className="section-header">
                    <h3>🤖 Configurações da IA</h3>
                    <p>Controle como a assistente virtual se comporta e responde.</p>
                </div>
                
                <div className="card">
                    <div className="settings-grid">
                        <div className="form-group">
                            <label>Nome da Secretária Virtual</label>
                            <input value={nomeAssistente} onChange={e => setNomeAssistente(e.target.value)} placeholder="Ex: Rafaela" />
                        </div>
                        <div className="form-group">
                            <label>Modo de Contexto da IA</label>
                            <select value={aiContextMode} onChange={e => setAiContextMode(e.target.value)}>
                                <option value="LEGACY">LEGACY (Prompt Hardcoded)</option>
                                <option value="DYNAMIC">DYNAMIC (Prompt baseado nestas configurações)</option>
                            </select>
                            <small className="help-text">Use DYNAMIC para ativar os dados acima no robô.</small>
                        </div>
                    </div>

                    <div className="form-group toggle mt-20">
                        <label>
                            <input
                                type="checkbox"
                                checked={settings.robotEnabled}
                                onChange={e => setClinic({
                                    ...clinic,
                                    settings: { ...settings, robotEnabled: e.target.checked }
                                })}
                            />
                            Robô Ativado (IA responde automaticamente)
                        </label>
                    </div>

                    <div className="form-group mt-10">
                        <label>Debounce (Segundos de espera)</label>
                        <input
                            type="number"
                            value={settings.debounceSeconds}
                            min={1}
                            max={60}
                            onChange={e => setClinic({
                                ...clinic,
                                settings: { ...settings, debounceSeconds: Number(e.target.value) }
                            })}
                        />
                        <small>Tempo antes de enviar a resposta à IA.</small>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h4>📜 Regras e Políticas Personalizadas</h4>
                        <button type="button" onClick={addRegra} className="btn-small">+ Adicionar</button>
                    </div>
                    <p className="description">Instruções específicas sobre o que a IA deve ou não fazer.</p>
                    <div className="dynamic-list">
                        {regrasPersonalizadas.map((regra, i) => (
                            <div key={i} className="rule-row">
                                <input 
                                    placeholder="Ex: Nunca dê descontos em consultas particulares." 
                                    value={regra} 
                                    onChange={e => updateRegra(i, e.target.value)} 
                                />
                                <button type="button" onClick={() => removeRegra(i)} className="btn-icon">×</button>
                            </div>
                        ))}
                        {regrasPersonalizadas.length === 0 && <p className="empty-msg">Nenhuma regra personalizada cadastrada.</p>}
                    </div>
                </div>
            </section>

            {/* ── Seção: Operacional e Agenda ──────────────────── */}
            <section className="settings-section border-top">
                <div className="section-header">
                    <h3>📅 Operacional e Agenda</h3>
                    <p>Dias, horários e prioridades da agenda WhatsApp.</p>
                </div>

                <div className="card">
                    <label className="sub-label">Dias de Atendimento</label>
                    <div className="weekday-selector">
                        {WEEKDAYS.map(day => (
                            <button
                                key={day.value}
                                type="button"
                                className={`weekday-btn ${workingDays.includes(day.value) ? "active" : ""}`}
                                onClick={() => toggleDay(day.value)}
                            >
                                {day.label}
                            </button>
                        ))}
                    </div>
                    <div className="weekday-presets">
                        <button type="button" className="btn-preset" onClick={() => setWorkingDays([1, 2, 3, 4, 5])}>Seg–Sex</button>
                        <button type="button" className="btn-preset" onClick={() => setWorkingDays([1, 2, 3, 4, 5, 6])}>Seg–Sáb</button>
                        <button type="button" className="btn-preset" onClick={() => setWorkingDays([0, 1, 2, 3, 4, 5, 6])}>Todos</button>
                    </div>
                </div>

                <div className="card">
                    <label className="sub-label">Turnos de Atendimento</label>
                    <div className="shifts-list">
                        {workingShifts.map((shift, i) => (
                            <div key={i} className="shift-row">
                                <select value={shift.period} onChange={e => updateShift(i, "period", e.target.value)} className="shift-select">
                                    <option value="manha">Manhã</option>
                                    <option value="tarde">Tarde</option>
                                </select>
                                <div className="shift-time-group">
                                    <label>De</label>
                                    <input type="time" value={shift.start} onChange={e => updateShift(i, "start", e.target.value)} />
                                    <label>às</label>
                                    <input type="time" value={shift.end} onChange={e => updateShift(i, "end", e.target.value)} />
                                </div>
                                {workingShifts.length > 1 && (
                                    <button type="button" onClick={() => removeShift(i)} className="btn-icon">×</button>
                                )}
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addShift} className="btn-add-shift">+ Adicionar turno</button>
                </div>

                <div className="card">
                    <label className="sub-label">Sugestões Prioritárias de Agenda</label>
                    <div className="suggestions-list">
                        {prioritySuggestions.map((s, i) => (
                            <div key={i} className="suggestion-item">
                                <span>{s.date} — <strong>{s.period === "manha" ? "Manhã" : "Tarde"}</strong></span>
                                <button onClick={() => removeSuggestion(i)} className="btn-icon">×</button>
                            </div>
                        ))}
                        {prioritySuggestions.length === 0 && <div className="empty-state">Nenhuma sugestão cadastrada.</div>}
                    </div>
                    <div className="add-suggestion-form">
                        <input type="date" value={newSuggestion.date} onChange={e => setNewSuggestion({ ...newSuggestion, date: e.target.value })} />
                        <select value={newSuggestion.period} onChange={e => setNewSuggestion({ ...newSuggestion, period: e.target.value })}>
                            <option value="manha">Manhã</option>
                            <option value="tarde">Tarde</option>
                        </select>
                        <button type="button" onClick={addSuggestion} className="btn-secondary">Adicionar</button>
                    </div>
                </div>
            </section>

            <div className="save-bar">
                <button onClick={handleSave} disabled={saving} className="btn-primary btn-save-global">
                    {saving ? "Salvando..." : "💾 Salvar Todas as Configurações"}
                </button>
                {message && <p className="form-message">{message}</p>}
            </div>
        </div>
    );
}
