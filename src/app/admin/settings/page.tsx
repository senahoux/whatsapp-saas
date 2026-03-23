import "./settings.css";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
const CLINIC_ID = process.env.CLINIC_ID || "clinic-demo-id";

async function getSettings() {
    try {
        const res = await fetch(`${API_URL}/api/settings?clinicId=${CLINIC_ID}`, {
            cache: "no-store",
        });
        if (!res.ok) return null;
        const body = await res.json();
        return body.clinic;
    } catch (err) {
        console.error("Fetch settings error:", err);
        return null;
    }
}

export default async function SettingsPage() {
    const clinic = await getSettings();

    if (!clinic) {
        return (
            <div className="card">
                <p className="error-text">Falha ao carregar configurações ou clínica não encontrada.</p>
            </div>
        );
    }

    // Tabela `setting` (1:1)
    const settings = clinic.settings || {};

    return (
        <>
            <div className="page-header">
                <h2 className="page-title">Configurações da Clínica</h2>
            </div>

            <div className="settings-grid">
                <div className="card">
                    <h3>Dados Básicos</h3>
                    <form className="settings-form">
                        <div className="form-group">
                            <label>Nome da Clínica</label>
                            <input type="text" defaultValue={clinic.nomeClinica} disabled />
                            <small>Modo readonly na V1</small>
                        </div>
                        <div className="form-group">
                            <label>Nome do Médico(a)</label>
                            <input type="text" defaultValue={clinic.nomeMedico} disabled />
                        </div>
                        <div className="form-group">
                            <label>Telefone</label>
                            <input type="text" defaultValue={clinic.telefone || ""} disabled />
                        </div>
                    </form>
                </div>

                <div className="card">
                    <h3>Parâmetros de IA</h3>
                    <form className="settings-form">
                        <div className="form-group">
                            <label>Duração Consulta (min)</label>
                            <input type="number" defaultValue={clinic.consultaDuracao || 30} disabled />
                        </div>
                        <div className="form-group">
                            <label>Valor Consulta (R$)</label>
                            <input type="number" defaultValue={clinic.consultaValor || ""} disabled />
                        </div>
                        <div className="form-group">
                            <label>Descrição de Serviços</label>
                            <textarea defaultValue={clinic.descricaoServicos || ""} rows={3} disabled></textarea>
                        </div>
                        <div className="form-group">
                            <label>FAQ (JSON Local)</label>
                            <textarea defaultValue={clinic.faq || ""} rows={4} disabled></textarea>
                        </div>
                    </form>
                </div>

                <div className="card">
                    <h3>Comportamento do Robô</h3>
                    <div className="settings-summary">
                        <div className="summary-item">
                            <span>Robô Ativado:</span>
                            <strong>{settings.robotEnabled ? "Sim" : "Não"}</strong>
                        </div>
                        <div className="summary-item">
                            <span>Modo Padrão:</span>
                            <strong>{settings.robotModeDefault || "AUTO"}</strong>
                        </div>
                        <div className="summary-item">
                            <span>Telefone Admin:</span>
                            <strong>{settings.adminPhoneNumber || "Não configurado"}</strong>
                        </div>
                        <div className="summary-item">
                            <span>Debounce (s):</span>
                            <strong>{settings.debounceSeconds || 8}</strong>
                        </div>
                    </div>
                    <p className="text-muted" style={{ marginTop: "16px" }}>Edição dessas configurações chegará na versão V2.</p>
                </div>
            </div>
        </>
    );
}
