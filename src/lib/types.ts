/**
 * Tipos compartilhados do sistema — WhatsApp SaaS
 *
 * Define os enums e contratos de API como constantes TypeScript.
 * SQLite não suporta enum nativo; esses objetos garantem type-safety
 * em toda a aplicação sem depender de enum do banco.
 *
 * Na migração para PostgreSQL (Fase 2), basta adicionar enum nativo
 * no schema.prisma — estes tipos continuam válidos no código.
 */

// ──────────────────────────────────────────────
// Conversation
// ──────────────────────────────────────────────

export const ConversationStatus = {
    NORMAL: "NORMAL",
    HUMANO: "HUMANO",
    ASSISTENTE: "ASSISTENTE",
    PAUSADA: "PAUSADA",
    AGUARDANDO_IA: "AGUARDANDO_IA",
    ERRO: "ERRO",
} as const;
export type ConversationStatus =
    (typeof ConversationStatus)[keyof typeof ConversationStatus];

// ──────────────────────────────────────────────
// Message
// ──────────────────────────────────────────────

export const MessageAuthor = {
    CLIENTE: "CLIENTE",
    USUARIO: "USUARIO",
    ROBO: "ROBO",
    SISTEMA: "SISTEMA",
} as const;
export type MessageAuthor = (typeof MessageAuthor)[keyof typeof MessageAuthor];

export const MessageType = {
    TEXT: "TEXT",
    AUDIO: "AUDIO",
    IMAGE: "IMAGE",
    SYSTEM: "SYSTEM",
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

// ──────────────────────────────────────────────
// Appointment
// ──────────────────────────────────────────────

export const AppointmentType = {
    CONSULTA: "CONSULTA",
    RETORNO: "RETORNO",
    PROCEDIMENTO: "PROCEDIMENTO",
} as const;
export type AppointmentType =
    (typeof AppointmentType)[keyof typeof AppointmentType];

export const AppointmentSubtype = {
    RETORNO_CONSULTA: "RETORNO_CONSULTA",
    RETORNO_PROCEDIMENTO: "RETORNO_PROCEDIMENTO",
} as const;
export type AppointmentSubtype =
    (typeof AppointmentSubtype)[keyof typeof AppointmentSubtype];

export const AppointmentStatus = {
    AGENDADO: "AGENDADO",
    CANCELADO: "CANCELADO",
    REMARCADO: "REMARCADO",
    CONCLUIDO: "CONCLUIDO",
} as const;
export type AppointmentStatus =
    (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const AppointmentSource = {
    MANUAL: "MANUAL",
    ROBO: "ROBO",
} as const;
export type AppointmentSource =
    (typeof AppointmentSource)[keyof typeof AppointmentSource];

// ──────────────────────────────────────────────
// Settings / Robot
// ──────────────────────────────────────────────

export const RobotMode = {
    AUTO: "AUTO",
    ASSISTENTE: "ASSISTENTE",
} as const;
export type RobotMode = (typeof RobotMode)[keyof typeof RobotMode];

// ──────────────────────────────────────────────
// Log
// ──────────────────────────────────────────────

export const LogLevel = {
    INFO: "INFO",
    WARN: "WARN",
    ERROR: "ERROR",
    DEBUG: "DEBUG",
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LogEvent = {
    MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
    MESSAGE_SENT: "MESSAGE_SENT",
    AI_RESPONSE: "AI_RESPONSE",
    ACTION_EXECUTED: "ACTION_EXECUTED",
    APPOINTMENT_CREATED: "APPOINTMENT_CREATED",
    APPOINTMENT_CANCELLED: "APPOINTMENT_CANCELLED",
    APPOINTMENT_RESCHEDULED: "APPOINTMENT_RESCHEDULED",
    NOTIFICATION_SENT: "NOTIFICATION_SENT",
    HUMAN_INTERVENTION: "HUMAN_INTERVENTION",
    DEBOUNCE_TRIGGERED: "DEBOUNCE_TRIGGERED",
    ERROR: "ERROR",
} as const;
export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];

// ──────────────────────────────────────────────
// Notification types
// ──────────────────────────────────────────────

export const NotificationType = {
    NOVO_AGENDAMENTO: "NOVO_AGENDAMENTO",
    LEAD_QUENTE: "LEAD_QUENTE",
    INTERVENCAO_HUMANA: "INTERVENCAO_HUMANA",
    REVISAO_IA: "REVISAO_IA",
    ALERTA: "ALERTA",
} as const;
export type NotificationType =
    (typeof NotificationType)[keyof typeof NotificationType];

// ──────────────────────────────────────────────
// Conversation Mode (resposta da IA)
// ──────────────────────────────────────────────

export const ConversationMode = {
    AUTO: "AUTO",
    ASSISTENTE: "ASSISTENTE",
    HUMANO_URGENTE: "HUMANO_URGENTE",
} as const;
export type ConversationMode =
    (typeof ConversationMode)[keyof typeof ConversationMode];

// ──────────────────────────────────────────────
// AI Response Contract (Passo 4)
// ──────────────────────────────────────────────

export interface AIResponse {
    mensagem: string;
    modo: "AUTO" | "ASSISTENTE" | "HUMANO_URGENTE";
    acao:
    | "NENHUMA"
    | "VER_AGENDA"
    | "AGENDAR"
    | "REMARCAR"
    | "CANCELAR"
    | "TRIAGEM";
    tipo: AppointmentType | null;
    subtipo: AppointmentSubtype | null;
    data: string | null;   // YYYY-MM-DD
    hora: string | null;   // HH:MM
    lead: "QUENTE" | null;
    confianca: "ALTA" | "MEDIA" | "BAIXA";
    precisa_nome: boolean;
    nome_identificado: string | null;
    notificar_admin: boolean;
}

// ──────────────────────────────────────────────
// Shared types between services
// ──────────────────────────────────────────────

export interface HistoryMessage {
    author: string;
    content: string;
    sentAt: Date | null;
}

// ──────────────────────────────────────────────
// Webhook payload (Robô → Backend)
// ──────────────────────────────────────────────

export interface WebhookPayload {
    clinicId: string;
    phoneNumber: string;      // número do remetente
    message: string;          // conteúdo da mensagem
    messageType: MessageType;
    externalMessageId: string;
    sentAt: string;           // ISO 8601
    isFromMe: boolean;        // true = enviada pelo usuário (intervenção humana)
}

// ──────────────────────────────────────────────
// Pending message (Backend → Robô)
// ──────────────────────────────────────────────

export interface PendingMessage {
    id: string;               // Message.id
    clinicId: string;
    phoneNumber: string;
    content: string;
    messageType: MessageType;
}

// ──────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────

export interface DashboardStats {
    conversasAtivas: number;
    intervencoesHumanas: number;
    agendamentosConfirmadosHoje: number;
    leadsQuentes: number;
}
