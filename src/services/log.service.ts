/**
 * LogService — WhatsApp SaaS
 *
 * Registra eventos do sistema no banco, sempre isolados por clinicId.
 * Estrutura leve para o MVP — pronta para expansão (filtros, exportação, alertas).
 *
 * Uso:
 *   await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, { phone: "..." })
 *   await LogService.error(clinicId, LogEvent.ERROR, { error: "..." })
 */

import { prisma } from "@/lib/prisma";
import { LogLevel, LogEvent } from "@/lib/types";

// Tipo inferido do Prisma client — compatível com SQLite e PostgreSQL
export type Log = NonNullable<Awaited<ReturnType<typeof prisma.log.findFirst>>>;

export interface ListLogsOptions {
    level?: string;    // filtro por LogLevel
    event?: string;    // filtro por LogEvent
    page?: number;     // 1-indexed (default: 1)
    pageSize?: number; // default: 100
}

export const LogService = {
    /**
     * Cria um registro de log vinculado à clínica.
     * details é serializado como JSON para análise futura.
     */
    async create(
        clinicId: string,
        event: string,
        level: string = LogLevel.INFO,
        details?: Record<string, unknown>
    ): Promise<Log> {
        console.log(`>>> [LogService] Criando evento: ${event} para ${clinicId}`);
        try {
            return await prisma.log.create({
                data: {
                    clinicId,
                    event,
                    level,
                    details: details ? JSON.stringify(details) : null,
                },
            });
        } catch (error) {
            console.error(`!!! [LogService] ERRO ao persistir log: ${event}. O fluxo continuará sem log persistido.`, error);
            // Retorna um objeto fake para não quebrar quem espera o retorno (quase ninguém usa o retorno)
            return {
                id: "error-log-" + Date.now(),
                clinicId,
                event,
                level,
                details: details ? JSON.stringify(details) : null,
                createdAt: new Date()
            } as Log;
        }
    },

    /** Shortcut para nível INFO */
    async info(
        clinicId: string,
        event: string,
        details?: Record<string, unknown>
    ): Promise<Log> {
        return LogService.create(clinicId, event, LogLevel.INFO, details);
    },

    /** Shortcut para nível WARN */
    async warn(
        clinicId: string,
        event: string,
        details?: Record<string, unknown>
    ): Promise<Log> {
        return LogService.create(clinicId, event, LogLevel.WARN, details);
    },

    /** Shortcut para nível ERROR */
    async error(
        clinicId: string,
        event: string,
        details?: Record<string, unknown>
    ): Promise<Log> {
        return LogService.create(clinicId, event, LogLevel.ERROR, details);
    },

    /** Shortcut para nível DEBUG */
    async debug(
        clinicId: string,
        event: string,
        details?: Record<string, unknown>
    ): Promise<Log> {
        return LogService.create(clinicId, event, LogLevel.DEBUG, details);
    },

    /**
     * Lista logs de uma clínica com filtros e paginação.
     * Sempre filtra por clinicId — nunca vaza logs entre clínicas.
     */
    async list(
        clinicId: string,
        options: ListLogsOptions = {}
    ): Promise<{ data: Log[]; total: number }> {
        const page = options.page ?? 1;
        const pageSize = options.pageSize ?? 100;
        const skip = (page - 1) * pageSize;

        const where = {
            clinicId,
            ...(options.level ? { level: options.level } : {}),
            ...(options.event ? { event: options.event } : {}),
        };

        const [data, total] = await prisma.$transaction([
            prisma.log.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: pageSize,
            }),
            prisma.log.count({ where }),
        ]);

        return { data, total };
    },
};
