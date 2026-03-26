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
                    debounceSeconds: Number(clinic.settings.debounceSeconds)
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

    if (loading) return <div className="loading">Carregando...</div>;
    if (!clinic) return <div className="error">Clínica não encontrada.</div>;

    const { settings } = clinic;

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
