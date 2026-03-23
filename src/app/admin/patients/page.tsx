export const dynamic = "force-dynamic";

import "./patients.css";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
const CLINIC_ID = process.env.CLINIC_ID || "clinic-demo-id";

// Nao importamos services diretamente. Consumimos a API.
async function getPatients(page = 1) {
    try {
        const res = await fetch(`${API_URL}/api/contacts?clinicId=${CLINIC_ID}&page=${page}&pageSize=50`, {
            cache: "no-store",
        });
        if (!res.ok) return { data: [], total: 0 };
        return await res.json();
    } catch (err) {
        console.error("Fetch patients error:", err);
        return { data: [], total: 0 };
    }
}

export default async function PatientsPage({
    searchParams,
}: {
    searchParams: { page?: string };
}) {
    const page = Number(searchParams.page) || 1;
    const { data: contacts, total } = await getPatients(page);

    return (
        <>
            <div className="page-header">
                <h2 className="page-title">Pacientes</h2>
                <div className="total-badge">Total: {total}</div>
            </div>

            <div className="card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Telefone</th>
                            <th>Status</th>
                            <th>Cadastrado em</th>
                        </tr>
                    </thead>
                    <tbody>
                        {contacts.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="empty-state">Nenhum paciente encontrado.</td>
                            </tr>
                        ) : (
                            contacts.map((contact: any) => (
                                <tr key={contact.id}>
                                    <td>
                                        <div className="contact-name">
                                            {contact.name || "Sem nome"}
                                            {contact.isAdmin && <span className="tag admin">Admin</span>}
                                        </div>
                                    </td>
                                    <td>{contact.phoneNumber}</td>
                                    <td>
                                        {contact.isHotLead ? (
                                            <span className="badge-hot">🔥 Lead Quente</span>
                                        ) : (
                                            <span className="badge-normal">Contato</span>
                                        )}
                                    </td>
                                    <td>{new Date(contact.createdAt).toLocaleDateString("pt-BR")}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
