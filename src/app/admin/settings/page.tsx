"use client";

import { useEffect, useState, useMemo } from "react";
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

const LIMITS = {
    nomeClinica: 80,
    nomeMedico: 80,
    nomeAssistente: 40,
    telefone: 20,
    endereco: 180,
    descricaoServicos: 350,
    faqPergunta: 120,
    faqResposta: 300,
    regra: 160
};

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
    const [error, setError] = useState("");

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

    // Original state for isDirty check
    const [original, setOriginal] = useState<any>(null);

    useEffect(() => {
        fetch(`/api/settings`)
            .then(res => res.json())
            .then(data => {
                const { clinic } = data;
                setClinic(clinic);
                
                const initial = {
                    nomeClinica: clinic.nomeClinica || "",
                    nomeMedico: clinic.nomeMedico || "",
                    endereco: clinic.endereco || "",
                    telefone: clinic.telefone || "",
                    consultaValor: clinic.consultaValor || 0,
                    consultaDuracao: clinic.consultaDuracao || 0,
                    descricaoServicos: clinic.descricaoServicos || "",
                    nomeAssistente: clinic.nomeAssistente || "Assistente",
                    aiContextMode: clinic.aiContextMode || "LEGACY",
                    faq: JSON.parse(clinic.faq || "[]"),
                    regrasPersonalizadas: JSON.parse(clinic.regrasPersonalizadas || "[]"),
                    workingDays: clinic.workingDays || [1, 2, 3, 4, 5],
                    workingShifts: clinic.workingShifts || [],
                    prioritySuggestions: clinic.prioritySuggestions || [],
                    robotEnabled: clinic.settings?.robotEnabled ?? true,
                    debounceSeconds: clinic.settings?.debounceSeconds ?? 8
                };

                setOriginal(initial);

                // Set local states
                setNomeClinica(initial.nomeClinica);
                setNomeMedico(initial.nomeMedico);
                setEndereco(initial.endereco);
                setTelefone(initial.telefone);
                setConsultaValor(initial.consultaValor);
                setConsultaDuracao(initial.consultaDuracao);
                setDescricaoServicos(initial.descricaoServicos);
                setNomeAssistente(initial.nomeAssistente);
                setAiContextMode(initial.aiContextMode);
                setFaq(initial.faq);
                setRegrasPersonalizadas(initial.regrasPersonalizadas);
                setWorkingDays(initial.workingDays);
                setWorkingShifts(initial.workingShifts);
                setPrioritySuggestions(initial.prioritySuggestions);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const isDirty = useMemo(() => {
        if (!original) return false;
        return (
            nomeClinica !== original.nomeClinica ||
            nomeMedico !== original.nomeMedico ||
            endereco !== original.endereco ||
            telefone !== original.telefone ||
            consultaValor !== original.consultaValor ||
            consultaDuracao !== original.consultaDuracao ||
            descricaoServicos !== original.descricaoServicos ||
            nomeAssistente !== original.nomeAssistente ||
            aiContextMode !== original.aiContextMode ||
            JSON.stringify(faq) !== JSON.stringify(original.faq) ||
            JSON.stringify(regrasPersonalizadas) !== JSON.stringify(original.regrasPersonalizadas) ||
            JSON.stringify(workingDays) !== JSON.stringify(original.workingDays) ||
            JSON.stringify(workingShifts) !== JSON.stringify(original.workingShifts) ||
            JSON.stringify(prioritySuggestions) !== JSON.stringify(original.prioritySuggestions) ||
            clinic?.settings?.robotEnabled !== original.robotEnabled ||
            clinic?.settings?.debounceSeconds !== original.debounceSeconds
        );
    }, [nomeClinica, nomeMedico, endereco, telefone, consultaValor, consultaDuracao, descricaoServicos, nomeAssistente, aiContextMode, faq, regrasPersonalizadas, workingDays, workingShifts, prioritySuggestions, clinic, original]);

    async function handleSave() {
        setSaving(true);
        setMessage("");
        setError("");

        try {
            const res = await fetch(`/api/settings`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    robotEnabled: clinic.settings.robotEnabled,
                    debounceSeconds: Number(clinic.settings.debounceSeconds),
                    workingDays,
                    workingShifts,
                    prioritySuggestions,
                    nomeClinica,
                    nomeMedico,
                    endereco,
                    telefone,
                    consultaValor: Number(consultaValor),
                    consultaDuracao: Number(consultaDuracao),
                    descricaoServicos,
                    faq,
                    nomeAssistente,
                    aiContextMode,
                    regrasPersonalizadas
                }),
            });

            if (res.ok) {
                setMessage("Alterações persistidas com sucesso.");
                setOriginal({
                    nomeClinica, nomeMedico, endereco, telefone, consultaValor, consultaDuracao,
                    descricaoServicos, nomeAssistente, aiContextMode, faq, regrasPersonalizadas,
                    workingDays, workingShifts, prioritySuggestions,
                    robotEnabled: clinic.settings.robotEnabled,
                    debounceSeconds: clinic.settings.debounceSeconds
                });
                setTimeout(() => setMessage(""), 5000);
            } else {
                const data = await res.json();
                setError(data.error || "Erro ao salvar as configurações.");
            }
        } catch (err) {
            setError("Erro de rede ou servidor indisponível.");
        } finally {
            setSaving(false);
        }
    }

    // ── Handlers ────────────────────────────────────
    function toggleDay(day: number) {
        setWorkingDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
    }

    // ── FAQ / Regras Handlers ───────────────────────
    function addFaq() { setFaq([...faq, { pergunta: "", resposta: "" }]); }
    function removeFaq(index: number) { setFaq(faq.filter((_, i) => i !== index)); }
    function updateFaq(index: number, field: "pergunta" | "resposta", value: string) {
        const updated = [...faq];
        updated[index] = { ...updated[index], [field]: value };
        setFaq(updated);
    }

    function addRegra() { setRegrasPersonalizadas([...regrasPersonalizadas, ""]); }
    function removeRegra(index: number) { setRegrasPersonalizadas(regrasPersonalizadas.filter((_, i) => i !== index)); }
    function updateRegra(index: number, value: string) {
        const updated = [...regrasPersonalizadas];
        updated[index] = value;
        setRegrasPersonalizadas(updated);
    }

    // ── Render Helpers ──────────────────────────────
    const CharCounter = ({ current, max }: { current: number; max: number }) => (
        <span className={`char-counter ${current > max ? "exceeded" : ""}`}>
            {current} / {max}
        </span>
    );

    if (loading) return <div className="loading">Sincronizando dados...</div>;
    if (!clinic) return <div className="error">Unidade clínica não identificada.</div>;

    return (
        <div className="settings-container">
            <header className="page-header">
                <div className="header-content">
                    <h2 className="page-title">Configurações da Unidade</h2>
                    <p className="page-subtitle">Gestão de identidade, IA e disponibilidade operacional</p>
                </div>
                <div className="clinic-status-badge">
                    <span className="id-label">ID {clinic.id}</span>
                    <span className={`mode-label ${aiContextMode}`}>{aiContextMode} Mode</span>
                </div>
            </header>

            {/* ── SEÇÃO 1: INFORMAÇÕES DA CLÍNICA ────────────────── */}
            <section className="settings-section">
                <div className="section-intro">
                    <h3>Informações da Clínica</h3>
                    <p>Dados fundamentais usados para identificação e no contexto da IA.</p>
                </div>
                <div className="card">
                    <div className="form-grid">
                        <div className="form-group">
                            <div className="label-row">
                                <label>Nome da Unidade</label>
                                <CharCounter current={nomeClinica.length} max={LIMITS.nomeClinica} />
                            </div>
                            <input 
                                value={nomeClinica} 
                                maxLength={LIMITS.nomeClinica}
                                onChange={e => setNomeClinica(e.target.value)} 
                                placeholder="Clínica Exemplo" 
                            />
                        </div>
                        <div className="form-group">
                            <div className="label-row">
                                <label>Profissional Responsável</label>
                                <CharCounter current={nomeMedico.length} max={LIMITS.nomeMedico} />
                            </div>
                            <input 
                                value={nomeMedico} 
                                maxLength={LIMITS.nomeMedico}
                                onChange={e => setNomeMedico(e.target.value)} 
                                placeholder="Dr. Nome do Médico" 
                            />
                        </div>
                        <div className="form-group">
                            <div className="label-row">
                                <label>Telefone para Contato</label>
                                <CharCounter current={telefone.length} max={LIMITS.telefone} />
                            </div>
                            <input 
                                value={telefone} 
                                maxLength={LIMITS.telefone}
                                onChange={e => setTelefone(e.target.value)} 
                                placeholder="Ex: (11) 99999-9999" 
                            />
                        </div>
                        <div className="form-group-row">
                            <div className="form-group">
                                <label>Valor da Consulta (R$)</label>
                                <input type="number" value={consultaValor} onChange={e => setConsultaValor(Number(e.target.value))} />
                            </div>
                            <div className="form-group">
                                <label>Duração (Minutos)</label>
                                <input type="number" value={consultaDuracao} onChange={e => setConsultaDuracao(Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="form-group full-width">
                            <div className="label-row">
                                <label>Endereço Completo</label>
                                <CharCounter current={endereco.length} max={LIMITS.endereco} />
                            </div>
                            <input 
                                value={endereco} 
                                maxLength={LIMITS.endereco}
                                onChange={e => setEndereco(e.target.value)} 
                                placeholder="Rua, Número, Bairro, Cidade - UF" 
                            />
                        </div>
                        <div className="form-group full-width">
                            <div className="label-row">
                                <label>Descrição dos Serviços</label>
                                <CharCounter current={descricaoServicos.length} max={LIMITS.descricaoServicos} />
                            </div>
                            <textarea 
                                value={descricaoServicos} 
                                maxLength={LIMITS.descricaoServicos}
                                onChange={e => setDescricaoServicos(e.target.value)} 
                                placeholder="Descreva as especialidades e principais atendimentos..."
                                rows={3}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* ── SEÇÃO 2: CONFIGURAÇÕES DA IA ────────────────────── */}
            <section className="settings-section">
                <div className="section-intro">
                    <h3>Configurações da IA</h3>
                    <p>Controle de identidade e comportamento do motor de conversação.</p>
                </div>
                <div className="card">
                    <div className="form-grid">
                        <div className="form-group">
                            <div className="label-row">
                                <label>Nome da Assistente Virtual</label>
                                <CharCounter current={nomeAssistente.length} max={LIMITS.nomeAssistente} />
                            </div>
                            <input 
                                value={nomeAssistente} 
                                maxLength={LIMITS.nomeAssistente}
                                onChange={e => setNomeAssistente(e.target.value)} 
                                placeholder="Ex: Clotilde" 
                            />
                        </div>
                        <div className="form-group">
                            <label>Motor de Contexto</label>
                            <select value={aiContextMode} onChange={e => setAiContextMode(e.target.value)}>
                                <option value="LEGACY">LEGACY (Padrão de Fábrica)</option>
                                <option value="DYNAMIC">DYNAMIC (Dados da Clínica)</option>
                            </select>
                            <small className="help-text">DYNAMIC ativa o uso do FAQ e Regras no robô.</small>
                        </div>
                    </div>

                    <div className="assistant-preview-box">
                        <span className="preview-label">Preview da Apresentação:</span>
                        <p className="preview-text">
                            "Olá. Sou a {nomeAssistente || "[Nome]"}, assistente da clínica {nomeClinica || "[Clínica]"}. Vou te ajudar por aqui."
                        </p>
                    </div>

                    <div className="admin-toggles mt-20">
                        <div className="toggle-group">
                            <input
                                type="checkbox"
                                id="robotEnabled"
                                checked={clinic.settings.robotEnabled}
                                onChange={e => setClinic({
                                    ...clinic,
                                    settings: { ...clinic.settings, robotEnabled: e.target.checked }
                                })}
                            />
                            <label htmlFor="robotEnabled">Ativar atendimento automático via IA</label>
                        </div>
                        <div className="form-group mt-15">
                            <label>Intervalo de Resposta (Segundos)</label>
                            <input
                                type="number"
                                className="small-input"
                                value={clinic.settings.debounceSeconds}
                                min={1} max={60}
                                onChange={e => setClinic({
                                    ...clinic,
                                    settings: { ...clinic.settings, debounceSeconds: Number(e.target.value) }
                                })}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* ── SEÇÃO 3: FAQ DA CLÍNICA ─────────────────────── */}
            <section className="settings-section">
                <div className="section-intro">
                    <div className="title-row">
                        <h3>Perguntas Frequentes (FAQ)</h3>
                        <button type="button" onClick={addFaq} className="btn-action">+ Nova Pergunta</button>
                    </div>
                    <p>Base de conhecimento para a IA responder dúvidas recorrentes.</p>
                </div>
                <div className="dynamic-items-container">
                    {faq.map((item, i) => (
                        <div key={i} className="dynamic-card">
                            <div className="card-controls">
                                <button type="button" onClick={() => removeFaq(i)} className="btn-delete">Remover</button>
                            </div>
                            <div className="form-group">
                                <div className="label-row">
                                    <label>Pergunta</label>
                                    <CharCounter current={item.pergunta.length} max={LIMITS.faqPergunta} />
                                </div>
                                <input 
                                    maxLength={LIMITS.faqPergunta}
                                    value={item.pergunta} 
                                    onChange={e => updateFaq(i, "pergunta", e.target.value)} 
                                    placeholder="Ex: Aceitam convênio?"
                                />
                            </div>
                            <div className="form-group">
                                <div className="label-row">
                                    <label>Resposta</label>
                                    <CharCounter current={item.resposta.length} max={LIMITS.faqResposta} />
                                </div>
                                <textarea 
                                    maxLength={LIMITS.faqResposta}
                                    value={item.resposta} 
                                    onChange={e => updateFaq(i, "resposta", e.target.value)} 
                                    placeholder="Resposta profissional..."
                                    rows={2}
                                />
                            </div>
                        </div>
                    ))}
                    {faq.length === 0 && <div className="empty-panel">Nenhuma FAQ cadastrada.</div>}
                </div>
            </section>

            {/* ── SEÇÃO 4: REGRAS E POLÍTICAS ──────────────────── */}
            <section className="settings-section">
                <div className="section-intro">
                    <div className="title-row">
                        <h3>Regras e Políticas da IA</h3>
                        <button type="button" onClick={addRegra} className="btn-action">+ Nova Regra</button>
                    </div>
                    <p>Diretrizes estritas de comportamento para a assistente virtual.</p>
                </div>
                <div className="dynamic-items-container">
                    {regrasPersonalizadas.map((regra, i) => (
                        <div key={i} className="dynamic-card single-field">
                            <div className="form-group">
                                <div className="label-row">
                                    <label>Regra/Diretriz</label>
                                    <CharCounter current={regra.length} max={LIMITS.regra} />
                                </div>
                                <div className="input-with-action">
                                    <input 
                                        maxLength={LIMITS.regra}
                                        value={regra} 
                                        onChange={e => updateRegra(i, e.target.value)} 
                                        placeholder="Ex: Nunca oferecer descontos por WhatsApp."
                                    />
                                    <button type="button" onClick={() => removeRegra(i)} className="btn-delete">×</button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {regrasPersonalizadas.length === 0 && <div className="empty-panel">Nenhuma diretriz cadastrada.</div>}
                </div>
            </section>

            {/* ── SEÇÃO 5: OPERACIONAL (AGENDA) ────────────────── */}
            <section className="settings-section border-top">
                <div className="section-intro">
                    <h3>Disponibilidade Operacional</h3>
                    <p>Dias e turnos em que a agenda WhatsApp permite marcações.</p>
                </div>
                
                <div className="card">
                    <div className="form-group mb-24">
                        <label>Dias de Atendimento</label>
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
                        <small className="help-text">Selecione os dias da semana em que há expediente clínico.</small>
                    </div>

                    <div className="form-group mb-24">
                        <label>Turnos de Funcionamento</label>
                        <div className="shifts-list">
                            {workingShifts.map((shift, i) => (
                                <div key={i} className="shift-row">
                                    <select 
                                        value={shift.period} 
                                        onChange={e => {
                                            const updated = [...workingShifts];
                                            updated[i].period = e.target.value;
                                            setWorkingShifts(updated);
                                        }}
                                    >
                                        <option value="manha">Manhã</option>
                                        <option value="tarde">Tarde</option>
                                        <option value="noite">Noite</option>
                                    </select>
                                    <div className="time-inputs">
                                        <input type="time" value={shift.start} onChange={e => {
                                            const updated = [...workingShifts];
                                            updated[i].start = e.target.value;
                                            setWorkingShifts(updated);
                                        }} />
                                        <span className="time-sep">até</span>
                                        <input type="time" value={shift.end} onChange={e => {
                                            const updated = [...workingShifts];
                                            updated[i].end = e.target.value;
                                            setWorkingShifts(updated);
                                        }} />
                                    </div>
                                    <button type="button" onClick={() => setWorkingShifts(workingShifts.filter((_, idx) => idx !== i))} className="btn-delete-small">×</button>
                                </div>
                            ))}
                            <button type="button" onClick={() => setWorkingShifts([...workingShifts, { period: "manha", start: "08:00", end: "12:00" }])} className="btn-add-outline">
                                + Adicionar Turno
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Sugestões Prioritárias (Próximas Datas)</label>
                        <div className="suggestions-compact-container">
                            <div className="suggestion-input-row">
                                <input type="date" value={newSuggestion.date} onChange={e => setNewSuggestion({...newSuggestion, date: e.target.value})} />
                                <select value={newSuggestion.period} onChange={e => setNewSuggestion({...newSuggestion, period: e.target.value})}>
                                    <option value="manha">Manhã</option>
                                    <option value="tarde">Tarde</option>
                                    <option value="dia_todo">Dia Todo</option>
                                </select>
                                <button type="button" onClick={() => {
                                    if (!newSuggestion.date) return;
                                    setPrioritySuggestions([...prioritySuggestions, newSuggestion]);
                                    setNewSuggestion({ date: "", period: "manha" });
                                }} className="btn-action">Adicionar</button>
                            </div>
                            <div className="suggestions-tags-list">
                                {prioritySuggestions.map((s, i) => (
                                    <div key={i} className="suggestion-tag">
                                        <span>{s.date} ({s.period})</span>
                                        <button type="button" onClick={() => setPrioritySuggestions(prioritySuggestions.filter((_, idx) => idx !== i))}>×</button>
                                    </div>
                                ))}
                                {prioritySuggestions.length === 0 && <span className="empty-hint">Nenhuma data prioritária cadastrada.</span>}
                            </div>
                        </div>
                        <small className="help-text">Estas datas serão oferecidas primeiro pelo robô ao paciente.</small>
                    </div>
                </div>
            </section>

            <div className={`bottom-save-bar ${isDirty ? "dirty" : ""}`}>
                <div className="save-container">
                    {isDirty && <span className="dirty-indicator">Você tem alterações não salvas</span>}
                    <button onClick={handleSave} disabled={saving} className="btn-save-final">
                        {saving ? "Processando..." : "Salvar Configurações"}
                    </button>
                </div>
                {message && <div className="success-toast">{message}</div>}
                {error && <div className="error-toast">{error}</div>}
            </div>
        </div>
    );
}
