"use client";

import { useEffect, useState } from "react";
import "./appointments.css";

function getTodayStr() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
    const [currentDate, setCurrentDate] = useState<string>(getTodayStr());
    const [appointments, setAppointments] = useState<any[]>([]);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [isBlocked, setIsBlocked] = useState(false);
    const [loading, setLoading] = useState(false);

    async function loadDay() {
        setLoading(true);
        try {
            const resAppt = await fetch(`/api/appointments?date=${currentDate}&pageSize=100`);
            const dataAppt = await resAppt.json();

            const resSlots = await fetch(`/api/appointments/slots?date=${currentDate}`);
            const dataSlots = await resSlots.json();

            const resBlocks = await fetch(`/api/schedule-blocks`);
            const dataBlocks = await resBlocks.json();

            setAppointments(dataAppt.data || []);
            setAvailableSlots(dataSlots.data?.horarios_disponiveis || []);

            const blocked = dataBlocks.data?.some((b: any) => b.blockDate === currentDate && !b.isAvailable);
            setIsBlocked(!!blocked);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        // Evita chamadas com datas parciais enquanto o usuário digita (Fase 3.5 fix)
        if (currentDate && currentDate.length === 10) {
            loadDay();
        }
    }, [currentDate]);

    async function toggleBlock() {
        if (!confirm(`Deseja ${isBlocked ? 'DESBLOQUEAR' : 'BLOQUEAR'} o dia ${currentDate}?`)) return;
        try {
            if (isBlocked) {
                await fetch(`/api/schedule-blocks?blockDate=${currentDate}`, { method: "DELETE" });
            } else {
                await fetch(`/api/schedule-blocks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ blockDate: currentDate, reason: "Bloqueio manual" })
                });
            }
            loadDay();
        } catch (err) {
            alert("Erro ao alterar bloqueio");
        }
    }

    async function handleCancel(id: string) {
        if (!confirm("Deseja realmente cancelar este agendamento?")) return;
        try {
            const res = await fetch(`/api/appointments/${id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes: "Cancelado pelo Admin via Web" })
            });
            if (!res.ok) throw new Error("Falha no cancelamento");
            loadDay();
        } catch (err) {
            alert("Erro ao cancelar");
        }
    }

    const allTimes = Array.from(new Set([
        ...appointments.map(a => a.time),
        ...availableSlots
    ])).sort();

    return (
        <div className="agenda-container">
            <header className="page-header">
                <div>
                    <h2 className="page-title">Grade Diária da Clínica</h2>
                    <p className="text-muted" style={{ marginTop: '4px', fontSize: '0.9rem' }}>Navegue nos dias para gerenciar blocos e cancelamentos</p>
                </div>
                <div className="date-picker-wrap">
                    <input
                        type="date"
                        value={currentDate}
                        onChange={e => setCurrentDate(e.target.value)}
                        className="date-input"
                    />
                    <button
                        className={`btn-block ${isBlocked ? 'unblock' : 'block'}`}
                        onClick={toggleBlock}
                    >
                        {isBlocked ? "🔓 Reabrir Dia" : "🔒 Bloquear Dia"}
                    </button>
                    <button className="btn-refresh" onClick={loadDay} disabled={loading}>
                        🔄 Atualizar
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="loading-state">Calculando agenda...</div>
            ) : isBlocked ? (
                <div className="blocked-state">
                    <h3>🚫 Dia Bloqueado Manualmente</h3>
                    <p>Nenhum robô ou paciente pode agendar horários neste dia.</p>
                </div>
            ) : allTimes.length === 0 ? (
                <div className="empty-state">
                    <h3>Nenhum horário operante configurado</h3>
                </div>
            ) : (
                <div className="timeline">
                    {allTimes.map(time => {
                        const apptsAtTime = appointments.filter(a => a.time === time);
                        const isFree = availableSlots.includes(time);

                        return (
                            <div key={time} className="timeline-row">
                                <div className="time-label">{time}</div>
                                <div className="slots-container">
                                    {isFree && (
                                        <div className="slot-card free">
                                            <div className="slot-info">
                                                <span className="slot-type">Disponível</span>
                                            </div>
                                            <span className="slot-action text-muted" style={{ fontSize: '0.8rem' }}>(Fase 4: Criação Manual)</span>
                                        </div>
                                    )}
                                    {apptsAtTime.map(a => {
                                        const isCanceled = a.status === "CANCELADO";
                                        return (
                                            <div key={a.id} className={`slot-card ${isCanceled ? 'canceled' : 'occupied'}`}>
                                                <div className="slot-info">
                                                    <strong>{a.contact?.name || "Sem contato base"}</strong>
                                                    <span className="phone">{a.contact?.phoneNumber}</span>
                                                    <span className={`status-badge ${a.status.toLowerCase()}`}>{a.status} (Fonte: {a.source})</span>
                                                </div>
                                                {!isCanceled && (
                                                    <button className="btn-cancel" onClick={() => handleCancel(a.id)}>Cancelar / Libertar Horário</button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
