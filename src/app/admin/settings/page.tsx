"use client";

import { useEffect, useState } from "react";
import "./settings.css";

export default function SettingsPage() {
    const [clinic, setClinic] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        fetch(`/api/settings`)
            .then(res => res.json())
            .then(data => {
                setClinic(data.clinic);
                setPrioritySuggestions(data.clinic.prioritySuggestions || []);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    async function handleUpdate(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setMessage("");

        try {
            const res = await fetch(`/api/settings`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    robotEnabled: clinic.settings.robotEnabled,
                    debounceSeconds: Number(clinic.settings.debounceSeconds),
                    prioritySuggestions
                })
            });

            if (res.ok) {
                setMessage("Configurações salvas com sucesso!");
            } else {
                setMessage("Falha ao salvar configurações.");
            }
        } catch (err) {
            setMessage("Erro na conexão.");
        } finally {
            setSaving(false);
        }
    }

    const [prioritySuggestions, setPrioritySuggestions] = useState<any[]>([]);
    const [newSuggestion, setNewSuggestion] = useState({ date: "", period: "manha" });

    function addSuggestion() {
        if (!newSuggestion.date) return;
        setPrioritySuggestions([...prioritySuggestions, newSuggestion]);
        setNewSuggestion({ date: "", period: "manha" });
    }

    function removeSuggestion(index: number) {
        setPrioritySuggestions(prioritySuggestions.filter((_, i) => i !== index));
    }

    if (loading) return <div className="loading">Carregando...</div>;
    if (!clinic) return <div className="error">Clínica não encontrada.</div>;

    const { settings } = clinic;

    // Se para essa clínica a row setting não existir, exiba elegantemente:
    if (!settings) return <div className="error">Configurações operacionais ainda não inicializadas para esta unidade.</div>;

    return (
        <div className="settings-container">
            <header className="page-header">
                <h2 className="page-title">Configurações Operacionais</h2>
            </header>

            <div className="card">
                <h3>Controle do Robô</h3>
                <form onSubmit={handleUpdate} className="settings-form">
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

                    <button type="submit" disabled={saving} className="btn-primary">
                        {saving ? "Salvando..." : "Salvar Alterações"}
                    </button>

                    {message && <p className="form-message">{message}</p>}
                </form>
            </div>

            <div className="card">
                <h3>📅 Sugestões Prioritárias de Agenda</h3>
                <p className="description">Defina períodos que o robô deve oferecer primeiro aos pacientes.</p>

                <div className="suggestions-list">
                    {prioritySuggestions.map((s, i) => (
                        <div key={i} className="suggestion-item">
                            <span>{s.date} - <strong>{s.period.toUpperCase()}</strong></span>
                            <button onClick={() => removeSuggestion(i)} className="btn-icon">×</button>
                        </div>
                    ))}
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
                        <option value="manha">Manhã (8h-12h)</option>
                        <option value="tarde">Tarde (12h-18h)</option>
                        <option value="noite">Noite (18h-23h)</option>
                    </select>
                    <button onClick={addSuggestion} className="btn-secondary">Adicionar</button>
                </div>

                <div style={{ marginTop: '20px' }}>
                    <button onClick={handleUpdate} disabled={saving} className="btn-primary">
                        {saving ? "Salvando..." : "Salvar Configurações de Agenda"}
                    </button>
                </div>
            </div>

            <div className="card read-only">
                <h3>Dados da Clínica (V1 - Apenas Leitura)</h3>
                <div className="info-grid">
                    <div className="info-item"><span>Nome:</span> <strong>{clinic.nomeClinica}</strong></div>
                    <div className="info-item"><span>Médico:</span> <strong>{clinic.nomeMedico}</strong></div>
                    <div className="info-item"><span>Status:</span> <span className="badge online">Ativo Cloud</span></div>
                </div>
            </div>
        </div>
    );
}
