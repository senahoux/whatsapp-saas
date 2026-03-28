"use client";

import { useState } from "react";

interface Props {
    initialEnabled: boolean;
}

/**
 * RobotControlCard — Controle operacional do robô (Modo Passivo Estrito).
 * Permite ligar/desligar a automação da clínica.
 */
export default function RobotControlCard({ initialEnabled }: Props) {
    const [isEnabled, setIsEnabled] = useState(initialEnabled);
    const [loading, setLoading] = useState(false);

    const toggleRobot = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/admin/settings/robot", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: !isEnabled })
            });

            if (res.ok) {
                const data = await res.json();
                setIsEnabled(data.robotEnabled);
            } else {
                alert("Falha ao atualizar status do robô.");
            }
        } catch (error) {
            console.error("Toggle robot error:", error);
            alert("Erro de conexão ao tentar alterar status.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`card robot-control-card ${isEnabled ? "active" : "disabled"}`}>
            <div className="robot-header">
                <h3>Controle do Robô</h3>
                <span className={`status-indicator ${isEnabled ? "active" : "disabled"}`}>
                    {isEnabled ? "ROBÔ ATIVO" : "MODO PASSIVO ESTRITO"}
                </span>
            </div>

            <div className="robot-content">
                <p>
                    {isEnabled 
                        ? "O robô está processando mensagens e agendamentos automaticamente." 
                        : "O robô está DESLIGADO. Novas mensagens serão apenas registradas, sem respostas ou ações automáticas."}
                </p>
                
                <button 
                    className={`btn-toggle-robot ${isEnabled ? "off" : "on"}`}
                    onClick={toggleRobot}
                    disabled={loading}
                >
                    {loading ? "Processando..." : (isEnabled ? "DESLIGAR ROBÔ" : "LIGAR ROBÔ")}
                </button>
            </div>

            <div className="robot-footer">
                <small>As mudanças são aplicadas instantaneamente a todas as conversas da clínica.</small>
            </div>
        </div>
    );
}
