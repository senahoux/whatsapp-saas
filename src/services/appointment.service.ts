/**
 * AppointmentService — WhatsApp SaaS
 *
 * Passo 4: getAvailableSlots + _getSlotsForDate (loop VER_AGENDA)
 * Passo 5: create, reschedule, cancel, list, blockDay, unblockDay
 *
 * REGRA: clinicId é sempre o primeiro parâmetro. Nenhuma query sem tenant filter.
 * Nenhum endpoint acessa Prisma diretamente — tudo passa por este service.
 */

import { prisma } from "@/lib/prisma";
import { AppointmentStatus, AppointmentSource } from "@/lib/types";
import type { AgendaContext } from "./ai.service";

// ──────────────────────────────────────────────
// Helpers de horário (imutáveis entre os passos)
// ──────────────────────────────────────────────

const WORK_START = 8;
const WORK_END = 18;

function generateDaySlots(slotDurationMinutes: number): string[] {
    const slots: string[] = [];
    const totalMinutes = (WORK_END - WORK_START) * 60;
    for (let m = 0; m < totalMinutes; m += slotDurationMinutes) {
        const hour = Math.floor(m / 60) + WORK_START;
        const min = m % 60;
        slots.push(`${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
    }
    return slots;
}

function toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function getNextDates(from: Date, count: number): string[] {
    const dates: string[] = [];
    const cur = new Date(from);
    cur.setDate(cur.getDate() + 1);
    while (dates.length < count) {
        dates.push(toDateStr(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

// ──────────────────────────────────────────────
// Input types
// ──────────────────────────────────────────────

export interface CreateAppointmentInput {
    contactId: string;
    type?: string;          // AppointmentType (default: CONSULTA)
    subtype?: string | null;
    date: string;           // YYYY-MM-DD
    time: string;           // HH:MM
    source?: string;        // AppointmentSource (default: MANUAL)
    notes?: string | null;
}

export interface RescheduleAppointmentInput {
    date: string;           // YYYY-MM-DD
    time: string;           // HH:MM
    notes?: string | null;
}

export interface ListAppointmentsOptions {
    date?: string;
    contactId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export const AppointmentService = {

    // ── Passo 4: consulta de slots para loop VER_AGENDA ──────────────

    async getAvailableSlots(
        clinicId: string,
        targetDate?: string,
    ): Promise<AgendaContext> {
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { consultaDuracao: true },
        });
        const slotDuration = clinic?.consultaDuracao ?? 30;
        const allSlots = generateDaySlots(slotDuration);

        const today = new Date();
        const resolvedDate =
            targetDate ??
            toDateStr(new Date(today.setDate(today.getDate() + 1)));

        const availableForDate = await AppointmentService._getSlotsForDate(
            clinicId,
            resolvedDate,
            allSlots,
        );

        const nextDates = getNextDates(new Date(resolvedDate), 7);
        const nextAvailableDates: string[] = [];
        for (const d of nextDates) {
            if (nextAvailableDates.length >= 3) break;
            const slots = await AppointmentService._getSlotsForDate(clinicId, d, allSlots);
            if (slots.length > 0) nextAvailableDates.push(d);
        }

        return {
            data_consultada: resolvedDate,
            horarios_disponiveis: availableForDate,
            proximos_dias_disponiveis: nextAvailableDates,
        };
    },

    /** Interno — use getAvailableSlots externamente */
    async _getSlotsForDate(
        clinicId: string,
        date: string,
        allSlots: string[],
    ): Promise<string[]> {
        const block = await prisma.scheduleBlock.findFirst({
            where: { clinicId, blockDate: date, isAvailable: false },
        });
        if (block) return [];

        const occupied = await prisma.appointment.findMany({
            where: { clinicId, date, status: "AGENDADO" },
            select: { time: true },
        });
        const occupiedTimes = new Set(occupied.map((a: { time: string }) => a.time));
        return allSlots.filter((slot) => !occupiedTimes.has(slot));
    },

    // ── Passo 5: CRUD de agendamentos ────────────────────────────────

    /**
     * Cria um agendamento com validação de conflito e bloqueio de dia.
     * Lança erro se slot já ocupado ou dia bloqueado.
     */
    async create(clinicId: string, input: CreateAppointmentInput) {
        // Verifica conflito de horário na clínica
        const conflict = await prisma.appointment.findFirst({
            where: {
                clinicId,
                date: input.date,
                time: input.time,
                status: AppointmentStatus.AGENDADO,
            },
        });
        if (conflict) {
            throw new Error(
                `Slot ${input.date} ${input.time} already booked in clinic ${clinicId}`,
            );
        }

        // Verifica se o dia está bloqueado
        const block = await prisma.scheduleBlock.findFirst({
            where: { clinicId, blockDate: input.date, isAvailable: false },
        });
        if (block) {
            throw new Error(
                `Day ${input.date} is blocked in clinic ${clinicId}${block.reason ? ": " + block.reason : ""}`,
            );
        }

        return prisma.appointment.create({
            data: {
                clinicId,
                contactId: input.contactId,
                type: input.type ?? "CONSULTA",
                subtype: input.subtype ?? null,
                status: AppointmentStatus.AGENDADO,
                date: input.date,
                time: input.time,
                source: input.source ?? AppointmentSource.MANUAL,
                notes: input.notes ?? null,
            },
        });
    },

    /**
     * Remarca agendamento para nova data/hora.
     * Valida clinicId — garante isolamento multi-tenant.
     */
    async reschedule(
        clinicId: string,
        appointmentId: string,
        input: RescheduleAppointmentInput,
    ) {
        const appt = await prisma.appointment.findFirst({
            where: { id: appointmentId, clinicId },
        });
        if (!appt) {
            throw new Error(
                `Appointment ${appointmentId} not found or does not belong to clinic ${clinicId}`,
            );
        }

        // Conflito no novo slot (exclui o próprio agendamento)
        const conflict = await prisma.appointment.findFirst({
            where: {
                clinicId,
                date: input.date,
                time: input.time,
                status: AppointmentStatus.AGENDADO,
                NOT: { id: appointmentId },
            },
        });
        if (conflict) {
            throw new Error(`New slot ${input.date} ${input.time} already booked`);
        }

        return prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                date: input.date,
                time: input.time,
                status: AppointmentStatus.REMARCADO,
                notes: input.notes !== undefined ? input.notes : appt.notes,
            },
        });
    },

    /**
     * Cancela um agendamento. Valida clinicId obrigatoriamente.
     */
    async cancel(clinicId: string, appointmentId: string, notes?: string) {
        const appt = await prisma.appointment.findFirst({
            where: { id: appointmentId, clinicId },
        });
        if (!appt) {
            throw new Error(
                `Appointment ${appointmentId} not found or does not belong to clinic ${clinicId}`,
            );
        }
        return prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                status: AppointmentStatus.CANCELADO,
                notes: notes ?? appt.notes,
            },
        });
    },

    /**
     * Lista agendamentos com filtros e paginação.
     * Sempre filtra por clinicId.
     */
    async list(clinicId: string, options: ListAppointmentsOptions = {}) {
        const page = options.page ?? 1;
        const pageSize = options.pageSize ?? 50;
        const skip = (page - 1) * pageSize;

        const where = {
            clinicId,
            ...(options.date ? { date: options.date } : {}),
            ...(options.contactId ? { contactId: options.contactId } : {}),
            ...(options.status ? { status: options.status } : {}),
        };

        const [data, total] = await prisma.$transaction([
            prisma.appointment.findMany({
                where,
                orderBy: [{ date: "asc" }, { time: "asc" }],
                skip,
                take: pageSize,
                include: {
                    contact: { select: { name: true, phoneNumber: true } },
                },
            }),
            prisma.appointment.count({ where }),
        ]);

        return { data, total };
    },

    // ── Passo 5: bloqueios de agenda ──────────────────────────────────

    /**
     * Bloqueia um dia inteiro na agenda (idempotente).
     */
    async blockDay(clinicId: string, blockDate: string, reason?: string) {
        const existing = await prisma.scheduleBlock.findFirst({
            where: { clinicId, blockDate },
            select: { id: true },
        });

        if (existing) {
            return prisma.scheduleBlock.update({
                where: { id: existing.id },
                data: { isAvailable: false, reason: reason ?? null },
            });
        }

        return prisma.scheduleBlock.create({
            data: { clinicId, blockDate, isAvailable: false, reason: reason ?? null },
        });
    },

    /**
     * Remove bloqueio de um dia. Retorna null se não havia bloqueio.
     */
    async unblockDay(clinicId: string, blockDate: string) {
        const block = await prisma.scheduleBlock.findFirst({
            where: { clinicId, blockDate },
        });
        if (!block) return null;
        return prisma.scheduleBlock.update({
            where: { id: block.id },
            data: { isAvailable: true },
        });
    },

    /**
     * Lista bloqueios de agenda da clínica.
     */
    async listBlocks(clinicId: string, onlyBlocked = true) {
        return prisma.scheduleBlock.findMany({
            where: {
                clinicId,
                ...(onlyBlocked ? { isAvailable: false } : {}),
            },
            orderBy: { blockDate: "asc" },
        });
    },
};
