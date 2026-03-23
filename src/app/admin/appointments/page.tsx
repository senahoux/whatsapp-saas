import "./appointments.css";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
const CLINIC_ID = process.env.CLINIC_ID || "clinic-demo-id";

async function getAppointments(page = 1) {
    try {
        const res = await fetch(`${API_URL}/api/appointments?clinicId=${CLINIC_ID}&page=${page}&pageSize=50`, {
            cache: "no-store",
        });
        if (!res.ok) return { data: [], total: 0 };
        return await res.json();
    } catch (err) {
        console.error("Fetch appointments error:", err);
        return { data: [], total: 0 };
    }
}

export default async function AppointmentsPage({
    searchParams,
}: {
    searchParams: { page?: string };
}) {
    const page = Number(searchParams.page) || 1;
    const { data: appointments, total } = await getAppointments(page);

    return (
        <>
            <div className="page-header">
                <h2 className="page-title">Agenda Consultas</h2>
                <div className="total-badge">Total: {total}</div>
            </div>

            <div className="card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Data/Hora</th>
                            <th>Paciente</th>
                            <th>Status</th>
                            <th>Tipo</th>
                            <th>Fonte</th>
                        </tr>
                    </thead>
                    <tbody>
                        {appointments.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="empty-state">Nenhum agendamento encontrado.</td>
                            </tr>
                        ) : (
                            appointments.map((appt: any) => (
                                <tr key={appt.id}>
                                    <td>
                                        <strong>{new Date(appt.date).toLocaleDateString("pt-BR")}</strong>
                                        <br />
                                        <span className="text-muted">{appt.time}</span>
                                    </td>
                                    <td>
                                        {appt.contact?.name || "Sem nome"}
                                        <br />
                                        <span className="text-muted">{appt.contact?.phoneNumber}</span>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${appt.status.toLowerCase()}`}>
                                            {appt.status}
                                        </span>
                                    </td>
                                    <td>{appt.type}</td>
                                    <td>{appt.source}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
