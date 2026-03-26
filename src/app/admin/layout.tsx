import Link from "next/link";
import "./admin.css";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();
    const clinicId = (session?.clinicId as string) || "Desconhecida";
    return (
        <div className="admin-container">
            <aside className="admin-sidebar">
                <div className="sidebar-header">
                    <h2>Kainós IA</h2>
                    <span className="badge">Admin</span>
                </div>

                <nav className="sidebar-nav">
                    <Link href="/admin" className="nav-link">Dashboard</Link>
                    <Link href="/admin/appointments" className="nav-link">Agenda</Link>
                    <Link href="/admin/patients" className="nav-link">Pacientes</Link>
                    <Link href="/admin/settings" className="nav-link">Configurações</Link>
                    <Link href="/admin/logs" className="nav-link">Logs de Sistema</Link>
                </nav>

                <div className="sidebar-footer">
                    <div className="clinic-info">
                        <span className="label">Clínica Atual</span>
                        {/* Identidade dinâmica via Sessão Autenticada */}
                        <span className="value">{clinicId}</span>
                    </div>
                </div>
            </aside>

            <main className="admin-main">
                <header className="admin-header">
                    <h1>Painel de Controle</h1>
                    <div className="user-profile">
                        <div className="avatar">A</div>
                        <span>Admin</span>
                    </div>
                </header>

                <div className="admin-content">
                    {children}
                </div>
            </main>
        </div>
    );
}
