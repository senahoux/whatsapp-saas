"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDateBR } from "@/lib/date";
import "./chat.css";

interface Contact {
    name: string | null;
    phoneNumber: string;
}

interface Message {
    id: string;
    author: string;
    messageType: string;
    content: string;
    sentAt: string | null;
    createdAt: string;
}

interface Conversation {
    id: string;
    status: string;
    lastMessageAt: string | null;
    updatedAt: string;
}

interface ChatData {
    conversation: Conversation;
    contact: Contact | null;
    messages: Message[];
}

const AUTHOR_LABELS: Record<string, string> = {
    CLIENTE: "Paciente",
    ROBO: "IA",
    USUARIO: "Atendente",
    SISTEMA: "Sistema",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    NORMAL: { label: "Normal", color: "#6b7280" },
    HUMANO: { label: "Intervenção Humana", color: "#f59e0b" },
    ASSISTENTE: { label: "Aguardando Revisão", color: "#3b82f6" },
    AGUARDANDO_IA: { label: "Aguardando IA", color: "#8b5cf6" },
    PAUSADA: { label: "Pausada", color: "#9ca3af" },
    ERRO: { label: "Erro", color: "#ef4444" },
};

function formatTime(raw: string | null): string {
    return formatDateBR(raw);
}

export default function ChatDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [data, setData] = useState<ChatData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        fetch(`/api/conversations/${id}`)
            .then((res) => {
                if (!res.ok) throw new Error(`Erro ${res.status}`);
                return res.json();
            })
            .then((json: ChatData) => setData(json))
            .catch(() => setError("Não foi possível carregar a conversa."))
            .finally(() => setLoading(false));
    }, [id]);

    const contactLabel = data?.contact?.name || data?.contact?.phoneNumber || "—";
    const statusInfo = data ? (STATUS_LABELS[data.conversation.status] ?? { label: data.conversation.status, color: "#6b7280" }) : null;

    return (
        <div className="chat-detail-container">
            <div className="chat-detail-header">
                <button className="btn-back" onClick={() => router.back()}>← Voltar</button>

                {data && (
                    <div className="contact-info">
                        <div className="contact-avatar">{(contactLabel[0] || "?").toUpperCase()}</div>
                        <div>
                            <strong className="contact-name">{contactLabel}</strong>
                            {data.contact?.name && (
                                <span className="contact-phone">{data.contact.phoneNumber}</span>
                            )}
                        </div>
                        <span
                            className="status-badge"
                            style={{ background: statusInfo?.color }}
                        >
                            {statusInfo?.label}
                        </span>
                    </div>
                )}
            </div>

            <div className="chat-messages">
                {loading && <p className="chat-state">Carregando mensagens...</p>}

                {!loading && error && (
                    <p className="chat-state chat-error">{error}</p>
                )}

                {!loading && !error && (!data || data.messages.length === 0) && (
                    <p className="chat-state">Nenhuma mensagem nesta conversa.</p>
                )}

                {!loading && !error && data?.messages.map((msg) => {
                    const isOutbound = msg.author === "ROBO" || msg.author === "USUARIO";
                    const isSystem = msg.author === "SISTEMA";

                    if (isSystem) {
                        return (
                            <div key={msg.id} className="msg-system">
                                <span>{msg.content}</span>
                                <time>{formatTime(msg.sentAt || msg.createdAt)}</time>
                            </div>
                        );
                    }

                    return (
                        <div key={msg.id} className={`msg-bubble-wrap ${isOutbound ? "outbound" : "inbound"}`}>
                            <div className="msg-bubble">
                                <div className="msg-meta">
                                    <span className="msg-author">{AUTHOR_LABELS[msg.author] ?? msg.author}</span>
                                    <time className="msg-time">{formatTime(msg.sentAt || msg.createdAt)}</time>
                                </div>
                                <p className="msg-content">{msg.content}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
