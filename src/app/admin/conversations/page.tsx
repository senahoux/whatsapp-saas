"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import "./conversations.css";

type Tab = "ASSISTENTE" | "HUMANO";

interface ConversationItem {
    id: string;
    status: string;
    contactId: string;
    lastMessageAt: string | null;
    updatedAt: string;
    contact: {
        name: string | null;
        phoneNumber: string;
    } | null;
}

interface ApiResponse {
    data: ConversationItem[];
    total: number;
    page: number;
    pageSize: number;
}

export default function ConversationsPage() {
    const [tab, setTab] = useState<Tab>("ASSISTENTE");
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);
    const router = useRouter();

    const loadConversations = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/conversations?status=${tab}&pageSize=50`
            );
            if (!res.ok) throw new Error(`Erro ${res.status}`);
            const json: ApiResponse = await res.json();
            setConversations(json.data);
            setTotal(json.total);
        } catch (err) {
            setError("Não foi possível carregar as conversas. Tente novamente.");
        } finally {
            setLoading(false);
        }
    }, [tab]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    async function releaseAI(convId: string) {
        setProcessing(convId);
        try {
            const res = await fetch(
                `/api/conversations/${convId}/release-ai`,
                { method: "POST" }
            );
            if (res.ok) {
                await loadConversations();
            } else {
                alert("Erro ao liberar resposta da IA.");
            }
        } catch {
            alert("Erro na conexão.");
        } finally {
            setProcessing(null);
        }
    }

    function displayName(conv: ConversationItem): string {
        return conv.contact?.name || conv.contact?.phoneNumber || conv.contactId;
    }

    function formatTime(raw: string | null): string {
        if (!raw) return "—";
        return new Date(raw).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    return (
        <div className="conv-container">
            <header className="page-header">
                <h2 className="page-title">Gerenciar Conversas</h2>
                {!loading && !error && (
                    <span style={{ fontSize: "0.85rem", color: "#888" }}>
                        {total} conversa{total !== 1 ? "s" : ""}
                    </span>
                )}
            </header>

            <div className="tabs">
                <button
                    className={tab === "ASSISTENTE" ? "active" : ""}
                    onClick={() => setTab("ASSISTENTE")}
                >
                    Revisão IA (ASSISTENTE)
                </button>
                <button
                    className={tab === "HUMANO" ? "active" : ""}
                    onClick={() => setTab("HUMANO")}
                >
                    Intervenção Humana
                </button>
            </div>

            <div className="conv-list">
                {loading && <p className="empty">Carregando conversas...</p>}

                {!loading && error && (
                    <div className="empty" style={{ color: "#e55" }}>
                        {error}
                        <button
                            onClick={loadConversations}
                            style={{ marginLeft: "12px", cursor: "pointer" }}
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}

                {!loading && !error && conversations.length === 0 && (
                    <p className="empty">Nenhuma conversa pendente nesta categoria.</p>
                )}

                {!loading && !error && conversations.map((conv) => (
                    <div key={conv.id} className="conv-card">
                        <div className="conv-info">
                            <strong>{displayName(conv)}</strong>
                            {conv.contact?.name && (
                                <span style={{ fontSize: "0.8rem", color: "#888", marginLeft: "8px" }}>
                                    {conv.contact.phoneNumber}
                                </span>
                            )}
                            <p className="last-msg">
                                Última mensagem: {formatTime(conv.lastMessageAt || conv.updatedAt)}
                            </p>
                        </div>
                        <div className="conv-actions">
                            {tab === "ASSISTENTE" && (
                                <button
                                    disabled={processing === conv.id}
                                    onClick={() => releaseAI(conv.id)}
                                    className="btn-release"
                                >
                                    {processing === conv.id ? "Liberando..." : "🚀 Liberar Resposta IA"}
                                </button>
                            )}
                            <button
                                className="btn-open"
                                onClick={() => router.push(`/admin/conversations/${conv.id}`)}
                            >
                                Abrir Chat
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
