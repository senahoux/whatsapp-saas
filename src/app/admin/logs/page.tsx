export const dynamic = "force-dynamic";

import "./logs.css";
import { getSession } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

// Endpoint nativo da api/logs consome o LogService no servidor
async function getLogs(clinicId: string, page = 1) {
    try {
        const res = await fetch(`${API_URL}/api/logs?clinicId=${clinicId}&page=${page}&pageSize=100`, {
            cache: "no-store",
        });
        if (!res.ok) return { data: [], total: 0 };
        return await res.json();
    } catch (err) {
        console.error("Fetch logs error:", err);
        return { data: [], total: 0 };
    }
}

export default async function LogsPage({
    searchParams,
}: {
    searchParams: { page?: string };
}) {
    const session = await getSession();
    const clinicId = session?.clinicId as string || "Desconhecida";
    const page = Number(searchParams.page) || 1;
    const { data: logs, total } = await getLogs(clinicId, page);

    return (
        <>
            <div className="page-header">
                <h2 className="page-title">Logs do Sistema</h2>
                <div className="total-badge">Total Registros: {total}</div>
            </div>

            <div className="card">
                <table className="data-table log-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Level</th>
                            <th>Evento</th>
                            <th>Detalhes (Metadata)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="empty-state">Nenhum log encontrado.</td>
                            </tr>
                        ) : (
                            logs.map((log: any) => {
                                let formattedMeta = "{}";
                                try {
                                    formattedMeta = JSON.stringify(JSON.parse(log.details || "{}"), null, 2);
                                } catch {
                                    formattedMeta = log.details;
                                }

                                return (
                                    <tr key={log.id}>
                                        <td className="log-time">
                                            {new Date(log.createdAt).toLocaleString("pt-BR")}
                                        </td>
                                        <td>
                                            <span className={`log-level ${log.level.toLowerCase()}`}>
                                                {log.level}
                                            </span>
                                        </td>
                                        <td className="log-event">{log.event}</td>
                                        <td className="log-meta">
                                            <pre>{formattedMeta}</pre>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
