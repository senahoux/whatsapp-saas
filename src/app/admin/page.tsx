import "./dashboard.css";
import { DashboardStats } from "@/lib/types";

// Como estamos no ambiente Local V1, usamos a variavel de ambiente e o clinicId hardcoded
const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
const CLINIC_ID = process.env.CLINIC_ID || "clinic-demo-id";

async function getDashboardStats(): Promise<DashboardStats | null> {
    try {
        const res = await fetch(`${API_URL}/api/dashboard?clinicId=${CLINIC_ID}`, {
            // no-store para garantir dados frescos no painel
            cache: "no-store",
        });

        if (!res.ok) return null;

        const data = await res.json();
        return data.stats;
    } catch (err) {
        console.error("Dashboard fetch error:", err);
        return null;
    }
}

export default async function AdminDashboard() {
    const stats = await getDashboardStats();

    return (
        <>
            <h2 className="page-title">Dashboard Operacional</h2>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Conversas Ativas (IA/Robô)</div>
                    <div className="stat-value">{stats?.conversasAtivas ?? "--"}</div>
                    <div className="stat-desc">Aguardando processamento ou envio</div>
                </div>

                <div className="stat-card warning">
                    <div className="stat-label">Requerem Intervenção</div>
                    <div className="stat-value">{stats?.intervencoesHumanas ?? "--"}</div>
                    <div className="stat-desc">Pacientes aguardando humano</div>
                </div>

                <div className="stat-card success">
                    <div className="stat-label">Agendamentos Hoje</div>
                    <div className="stat-value">{stats?.agendamentosConfirmadosHoje ?? "--"}</div>
                    <div className="stat-desc">Marcados para a data de hoje</div>
                </div>

                <div className="stat-card highlight">
                    <div className="stat-label">Leads Quentes</div>
                    <div className="stat-value">{stats?.leadsQuentes ?? "--"}</div>
                    <div className="stat-desc">Pacientes com intenção de compra alta</div>
                </div>
            </div>

            <div className="dashboard-content">
                <div className="card">
                    <h3>Status do Sistema</h3>
                    <ul className="status-list">
                        <li>
                            <span className="status-indicator online"></span>
                            <strong>Backend API:</strong> Online e respondendo
                        </li>
                        <li>
                            <span className="status-indicator online"></span>
                            <strong>Banco de Dados:</strong> Conectado
                        </li>
                        <li className="robot-status-notice">
                            ⚠️ O robô do WhatsApp Web roda localmente no seu computador e faz polling via API.
                            Verifique o terminal do Playwright (Passo 7) para o status de conexão ao WhatsApp.
                        </li>
                    </ul>
                </div>
            </div>
        </>
    );
}
