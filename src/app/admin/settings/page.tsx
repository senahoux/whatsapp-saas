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

    // Calendar state
    const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [workingShifts, setWorkingShifts] = useState<WorkingShift[]>([
        { period: "manha", start: "08:00", end: "12:00" },
        { period: "tarde", start: "13:00", end: "18:00" },
    ]);
    const [prioritySuggestions, setPrioritySuggestions] = useState<any[]>([]);
    const [newSuggestion, setNewSuggestion] = useState({ date: "", period: "manha" });

    useEffect(() => {
        fetch(`/api/settings`)
            .then(res => res.json())
            .then(data => {
                setClinic(data.clinic);
                // Carregar configurações de calendário da clínica
                if (data.clinic.workingDays) setWorkingDays(data.clinic.workingDays);
                if (data.clinic.workingShifts) setWorkingShifts(data.clinic.workingShifts);
                if (data.clinic.prioritySuggestions) setPrioritySuggestions(data.clinic.prioritySuggestions);
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
                    robotEnabled: clinic.settings.robotEnabled,
                    debounceSeconds: Number(clinic.settings.debounceSeconds),
                    workingDays,
                    workingShifts,
                    prioritySuggestions,
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

    // ── Render ──────────────────────────────────────

    if (loading) return <div className="loading">Carregando...</div>;
    if (!clinic) return <div className="error">Clínica não encontrada.</div>;
    if (!clinic.settings) return <div className="error">Configurações operacionais ainda não inicializadas para esta unidade.</div>;

    const { settings } = clinic;

    return (
        <div className="settings-container">
            <header className="page-header">
                <h2 className="page-title">Configurações Operacionais</h2>
            </header>

            {/* ── Controle do Robô ────────────────────────── */}
            <div className="card">
                <h3>🤖 Controle do Robô</h3>
                <div className="settings-form">
                    <div className="form-group toggle">
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

                    <div className="form-group">
                        <label>Debounce (Segundos de espera antes de processar)</label>
                        <input
                            type="number"
                            value={settings.debounceSeconds}
                            min={1}
                            max={60}
                            onChange={e => setClinic({
                                ...clinic,
                                settings: { ...settings, debounceSeconds: e.target.value }
                            })}
                        />
                        <small>Tempo sugerido: 8-12 segundos</small>
                    </div>
                </div>
            </div>

            {/* ── Dias de Atendimento ────────────────────────── */}
            <div className="card">
                <h3>📆 Dias de Atendimento</h3>
                <p className="description">Selecione os dias em que a clínica atende.</p>
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
                    <button
                        type="button"
                        className="btn-preset"
                        onClick={() => setWorkingDays([1, 2, 3, 4, 5])}
                    >
                        Seg–Sex
                    </button>
                    <button
                        type="button"
                        className="btn-preset"
                        onClick={() => setWorkingDays([1, 2, 3, 4, 5, 6])}
                    >
                        Seg–Sáb
                    </button>
                    <button
                        type="button"
                        className="btn-preset"
                        onClick={() => setWorkingDays([0, 1, 2, 3, 4, 5, 6])}
                    >
                        Todos
                    </button>
                </div>
            </div>

            {/* ── Turnos / Faixas Horárias ────────────────────── */}
            <div className="card">
                <h3>⏰ Turnos de Atendimento</h3>
                <p className="description">Configure as faixas horárias de cada turno.</p>
                <div className="shifts-list">
                    {workingShifts.map((shift, i) => (
                        <div key={i} className="shift-row">
                            <select
                                value={shift.period}
                                onChange={e => updateShift(i, "period", e.target.value)}
                                className="shift-select"
                            >
                                <option value="manha">Manhã</option>
                                <option value="tarde">Tarde</option>
                            </select>
                            <div className="shift-time-group">
                                <label>De</label>
                                <input
                                    type="time"
                                    value={shift.start}
                                    onChange={e => updateShift(i, "start", e.target.value)}
                                />
                                <label>às</label>
                                <input
                                    type="time"
                                    value={shift.end}
                                    onChange={e => updateShift(i, "end", e.target.value)}
                                />
                            </div>
                            {workingShifts.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeShift(i)}
                                    className="btn-icon"
                                    title="Remover turno"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <button type="button" onClick={addShift} className="btn-add-shift">
                    + Adicionar turno
                </button>
            </div>

            {/* ── Sugestões Prioritárias ────────────────────── */}
            <div className="card">
                <h3>📋 Sugestões Prioritárias de Agenda</h3>
                <p className="description">
                    Defina períodos que o robô deve oferecer primeiro aos pacientes.
                    São apenas sugestões de abertura — o paciente pode pedir outro período.
                </p>

                <div className="suggestions-list">
                    {prioritySuggestions.map((s, i) => (
                        <div key={i} className="suggestion-item">
                            <span>{s.date} — <strong>{s.period === "manha" ? "Manhã" : s.period === "tarde" ? "Tarde" : s.period}</strong></span>
                            <button onClick={() => removeSuggestion(i)} className="btn-icon">×</button>
                        </div>
                    ))}
                    {prioritySuggestions.length === 0 && (
                        <div className="empty-state">Nenhuma sugestão configurada.</div>
                    )}
                </div>

                <div className="add-suggestion-form">
                    <input
                        type="date"
                        value={newSuggestion.date}
                        onChange={e => setNewSuggestion({ ...newSuggestion, date: e.target.value })}
                    />
                    <select
                        value={newSuggestion.period}
                        onChange={e => setNewSuggestion({ ...newSuggestion, period: e.target.value })}
                    >
                        <option value="manha">Manhã</option>
                        <option value="tarde">Tarde</option>
                    </select>
                    <button onClick={addSuggestion} className="btn-secondary">Adicionar</button>
                </div>
            </div>

            {/* ── Dados da Clínica ────────────────────── */}
            <div className="card read-only">
                <h3>Dados da Clínica (V1 — Apenas Leitura)</h3>
                <div className="info-grid">
                    <div className="info-item"><span>Nome:</span> <strong>{clinic.nomeClinica}</strong></div>
                    <div className="info-item"><span>Médico:</span> <strong>{clinic.nomeMedico}</strong></div>
                    <div className="info-item"><span>Status:</span> <span className="badge online">Ativo Cloud</span></div>
                </div>
            </div>

            {/* ── Botão de salvar global ────────────────── */}
            <div className="save-bar">
                <button onClick={handleSave} disabled={saving} className="btn-primary btn-save-global">
                    {saving ? "Salvando..." : "💾 Salvar Todas as Configurações"}
                </button>
                {message && <p className="form-message">{message}</p>}
            </div>
        </div>
    );
}
