import { DashboardService } from "@/services/dashboard.service";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/services/notification.service";
import "./dashboard.css";

const CLINIC_ID = process.env.CLINIC_ID || "clinic-demo-id";

async function getHealth() {
    try {
        // DB Ping (Simples e Honesto)
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const dbLatency = Date.now() - start;

        // Provider Config Check (UAZAPI)
        const hasProvider = !!process.env.UAZAPI_API_KEY && !!process.env.UAZAPI_INSTANCE_KEY;

        return {
            database: { status: "online", latency: `${dbLatency}ms` },
            whatsapp: { status: hasProvider ? "configurado" : "pendente", provider: "Uazapi" }
        };
    } catch {
        return {
            database: { status: "offline", latency: "N/A" },
            whatsapp: { status: "erro", provider: "Uazapi" }
        };
    }
}

async function getRecentAlerts() {
    const { data } = await NotificationService.list(CLINIC_ID, { pageSize: 5 });
    return data;
}

export default async function AdminDashboard() {
    const stats = await DashboardService.getStats(CLINIC_ID);
    const health = await getHealth();
    const alerts = await getRecentAlerts();

    return (
        <div className="dashboard-container">
            <header className="page-header">
                <h2 className="page-title">Visão Geral</h2>
                <div className="sync-badge">Cloud-Native Architecture</div>
            </header>

            <div className="stats-grid">
                <div className="stat-card">
                    <span className="stat-label">Conversas Ativas (IA)</span>
                    <span className="stat-value">{stats.conversasAtivas}</span>
                </div>
                <div className="stat-card urgent">
                    <span className="stat-label">Intervenção Humana</span>
                    <span className="stat-value">{stats.intervencoesHumanas}</span>
                </div>
                <div className="stat-card success">
                    <span className="stat-label">Agendamentos (Hoje)</span>
                    <span className="stat-value">{stats.agendamentosConfirmadosHoje}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Leads Quentes</span>
                    <span className="stat-value">{stats.leadsQuentes}</span>
                </div>
            </div>

            <div className="dashboard-main">
                <div className="card alerts-card">
                    <h3>Últimos Alerta Operacionais</h3>
                    <div className="alerts-list">
                        {alerts.length === 0 ? (
                            <p className="empty-state">Nenhum alerta recente.</p>
                        ) : (
                            alerts.map((a: any) => (
                                <div key={a.id} className={`alert-item ${a.type.toLowerCase()}`}>
                                    <div className="alert-header">
                                        <span className={`badge-alert ${a.type.toLowerCase()}`}>{a.type}</span>
                                        <small>{new Date(a.createdAt).toLocaleTimeString("pt-BR")}</small>
                                    </div>
                                    <p className="alert-text">{a.message}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="card status-card">
                    <h3>Status da Infraestrutura</h3>
                    <div className="health-grid">
                        <div className="health-item">
                            <span>Banco de Dados (Supabase)</span>
                            <strong className={health.database.status}>{health.database.status.toUpperCase()} ({health.database.latency})</strong>
                        </div>
                        <div className="health-item">
                            <span>WhatsApp Provider ({health.whatsapp.provider})</span>
                            <strong className={health.whatsapp.status === "configurado" ? "online" : "error"}>
                                {health.whatsapp.status === "configurado" ? "CONECTADO (API CONFIGURADA)" : "PENDENTE"}
                            </strong>
                        </div>
                    </div>
                    <div className="info-box" style={{ marginTop: "20px" }}>
                        <p><strong>Nota:</strong> Indicadores baseados em latência real de DB e presença de credenciais de Provider.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
