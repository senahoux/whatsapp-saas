/**
 * AppointmentService — WhatsApp SaaS
 *
 * Responsável pela agenda da clínica.
 * Usa workingDays + workingShifts da clínica para gerar slots dinâmicos.
 * O backend é a FONTE DE VERDADE da disponibilidade.
 *
 * REGRA: clinicId é sempre o primeiro parâmetro. Nenhuma query sem tenant filter.
 */

import { prisma } from "@/lib/prisma";
import { AppointmentStatus, AppointmentSource } from "@/lib/types";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface WorkingShift {
    period: "manha" | "tarde";
    start: string; // HH:MM
    end: string;   // HH:MM
}

export interface AvailableSlot {
    date: string;   // YYYY-MM-DD
    time: string;   // HH:MM
    period: "manha" | "tarde";
}

export interface AgendaSnapshot {
    initialSuggestions: string[];  // ["YYYY-MM-DD HH:MM", ...] — sugestões prioritárias da clínica
    availableSlots: AvailableSlot[];
    activeFilter: string | null;  // Filtro temporal ativo do paciente
}

export interface CreateAppointmentInput {
    contactId: string;
    type?: string;
    subtype?: string | null;
    date: string;       // YYYY-MM-DD
    time: string;       // HH:MM
    source?: string;
    notes?: string | null;
}

export interface RescheduleAppointmentInput {
    date: string;
    time: string;
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
// Helpers
// ──────────────────────────────────────────────

function toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function generateSlotsForShift(shift: WorkingShift, durationMinutes: number): string[] {
    const slots: string[] = [];
    const [startH, startM] = shift.start.split(":").map(Number);
    const [endH, endM] = shift.end.split(":").map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    for (let m = startTotal; m + durationMinutes <= endTotal; m += durationMinutes) {
        const hour = Math.floor(m / 60);
        const min = m % 60;
        slots.push(`${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
    }
    return slots;
}

function classifyPeriod(time: string): "manha" | "tarde" {
    const hour = parseInt(time.split(":")[0]);
    return hour < 12 ? "manha" : "tarde";
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export const AppointmentService = {

    /**
     * Gera um AgendaSnapshot estruturado para a IA.
     * 
     * @param clinicId - ID da clínica
     * @param filter - Filtro temporal opcional (ex: "2026-04", "2026-04-01", "2026-W14")
     * @param activeFilter - Label do filtro ativo para passthrough (ex: "abril")
     * @param maxSlots - Máximo de slots no snapshot (default: 15)
     */
    async getAgendaSnapshot(
        clinicId: string,
        filter?: string,
        activeFilter?: string | null,
        maxSlots: number = 15,
    ): Promise<AgendaSnapshot> {
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            select: {
                consultaDuracao: true,
                workingDays: true,
                workingShifts: true,
                prioritySuggestions: true,
            },
        });

        const duration = clinic?.consultaDuracao ?? 30;
        const workingDays: number[] = (clinic?.workingDays as number[]) ?? [1, 2, 3, 4, 5];
        const shifts: WorkingShift[] = (clinic?.workingShifts as unknown as WorkingShift[]) ?? [
            { period: "manha", start: "08:00", end: "12:00" },
            { period: "tarde", start: "13:00", end: "18:00" },
        ];
        const priorities = (clinic?.prioritySuggestions as any[]) || [];

        // Determinar período de busca
        const today = new Date();
        let searchStart = new Date(today);
        searchStart.setDate(searchStart.getDate() + 1); // começa amanhã
        let searchDays = 14;

        if (filter) {
            // Filtro por data específica (YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) {
                searchStart = new Date(filter + "T00:00:00");
                searchDays = 1;
            }
            // Filtro por mês (YYYY-MM)
            else if (/^\d{4}-\d{2}$/.test(filter)) {
                const [y, m] = filter.split("-").map(Number);
                searchStart = new Date(y, m - 1, 1);
                // Se o mês já começou, começa de amanhã
                if (searchStart < today) {
                    searchStart = new Date(today);
                    searchStart.setDate(searchStart.getDate() + 1);
                }
                searchDays = 30; // busca até 30 dias no mês
            }
        }

        // Gerar todas as datas válidas no período
        const validDates: string[] = [];
        const cursor = new Date(searchStart);
        for (let i = 0; i < searchDays && validDates.length < 30; i++) {
            const dayOfWeek = cursor.getDay();
            if (workingDays.includes(dayOfWeek)) {
                validDates.push(toDateStr(cursor));
            }
            cursor.setDate(cursor.getDate() + 1);
        }

        // Gerar slots possíveis por turno
        const allTimeSlotsPerShift: { shift: WorkingShift; times: string[] }[] = shifts.map(s => ({
            shift: s,
            times: generateSlotsForShift(s, duration),
        }));
        const allTimeSlots = allTimeSlotsPerShift.flatMap(s => s.times);

        // Buscar bloqueios e ocupação real para todas as datas
        const blocks = await prisma.scheduleBlock.findMany({
            where: { clinicId, blockDate: { in: validDates }, isAvailable: false },
            select: { blockDate: true },
        });
        const blockedDates = new Set(blocks.map(b => b.blockDate));

        const occupied = await prisma.appointment.findMany({
            where: {
                clinicId,
                date: { in: validDates },
                status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.REMARCADO] },
            },
            select: { date: true, time: true },
        });
        const occupiedSet = new Set(occupied.map(a => `${a.date} ${a.time}`));

        // Montar slots disponíveis
        const availableSlots: AvailableSlot[] = [];
        for (const date of validDates) {
            if (blockedDates.has(date)) continue;
            for (const time of allTimeSlots) {
                if (occupiedSet.has(`${date} ${time}`)) continue;
                availableSlots.push({
                    date,
                    time,
                    period: classifyPeriod(time),
                });
                if (availableSlots.length >= maxSlots) break;
            }
            if (availableSlots.length >= maxSlots) break;
        }

        // Montar sugestões iniciais (só se não há filtro ativo)
        const initialSuggestions: string[] = [];
        if (!activeFilter && priorities.length > 0) {
            for (const p of priorities) {
                const pDate = p.date;
                const pPeriod = p.period;
                const matching = availableSlots.find(
                    s => s.date === pDate && s.period === pPeriod
                );
                if (matching) {
                    initialSuggestions.push(`${matching.date} ${matching.time}`);
                }
            }
        }

        return {
            initialSuggestions,
            availableSlots,
            activeFilter: activeFilter ?? null,
        };
    },

    /**
     * Backward-compatible: retorna slots flat (usado por confirmação).
     */
    async getAvailableSlots(
        clinicId: string,
        targetDate?: string,
    ): Promise<{ data_consultada: string; horarios_disponiveis: string[]; proximos_dias_disponiveis: string[] }> {
        const filter = targetDate ?? undefined;
        const snapshot = await AppointmentService.getAgendaSnapshot(clinicId, filter);
        const flatSlots = snapshot.availableSlots.map(s => `${s.date} ${s.time}`);
        return {
            data_consultada: targetDate ?? toDateStr(new Date()),
            horarios_disponiveis: flatSlots,
            proximos_dias_disponiveis: [],
        };
    },

    /**
     * Internal: busca slots para uma data específica (usado em validação).
     */
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
            where: {
                clinicId,
                date,
                status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.REMARCADO] },
            },
            select: { time: true },
        });
        const occupiedTimes = new Set(occupied.map((a: { time: string }) => a.time));
        return allSlots.filter((slot) => !occupiedTimes.has(slot));
    },

    // ── CRUD de agendamentos ────────────────────────────────

    async create(clinicId: string, input: CreateAppointmentInput) {
        const isDuplicate = await AppointmentService.isDuplicate(
            clinicId, input.contactId, input.date, input.time
        );
        if (isDuplicate) {
            throw new Error(`Duplicate appointment detected for contact ${input.contactId} at ${input.date} ${input.time}`);
        }

        const conflict = await prisma.appointment.findFirst({
            where: {
                clinicId,
                date: input.date,
                time: input.time,
                status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.REMARCADO] },
            },
        });
        if (conflict) {
            throw new Error(`Slot ${input.date} ${input.time} already booked in clinic ${clinicId}`);
        }

        const block = await prisma.scheduleBlock.findFirst({
            where: { clinicId, blockDate: input.date, isAvailable: false },
        });
        if (block) {
            throw new Error(`Day ${input.date} is blocked in clinic ${clinicId}${block.reason ? ": " + block.reason : ""}`);
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
                notificationStatus: "PENDING",
                notificationAttempts: 0,
            },
        });
    },

    async isDuplicate(clinicId: string, contactId: string, date: string, time: string): Promise<boolean> {
        const existing = await prisma.appointment.findFirst({
            where: {
                clinicId, contactId, date, time,
                status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.REMARCADO] },
            },
            select: { id: true },
        });
        return !!existing;
    },

    async updateNotificationStatus(appointmentId: string, status: "SENT" | "FAILED", error?: string) {
        return prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                notificationStatus: status,
                notificationAttempts: { increment: 1 },
                notificationLastError: error || null,
                notificationLastAttemptAt: new Date(),
            },
        });
    },

    async reschedule(clinicId: string, appointmentId: string, input: RescheduleAppointmentInput) {
        const appt = await prisma.appointment.findFirst({
            where: { id: appointmentId, clinicId },
        });
        if (!appt) {
            throw new Error(`Appointment ${appointmentId} not found or does not belong to clinic ${clinicId}`);
        }

        const conflict = await prisma.appointment.findFirst({
            where: {
                clinicId,
                date: input.date,
                time: input.time,
                status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.REMARCADO] },
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

    async cancel(clinicId: string, appointmentId: string, notes?: string) {
        const appt = await prisma.appointment.findFirst({
            where: { id: appointmentId, clinicId },
        });
        if (!appt) {
            throw new Error(`Appointment ${appointmentId} not found or does not belong to clinic ${clinicId}`);
        }
        return prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                status: AppointmentStatus.CANCELADO,
                notes: notes ?? appt.notes,
            },
        });
    },

    async findActiveAppointment(clinicId: string, contactId: string) {
        return prisma.appointment.findFirst({
            where: {
                clinicId, contactId,
                status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.REMARCADO] },
            },
            orderBy: { createdAt: "desc" },
            include: { contact: { select: { name: true, phoneNumber: true } } },
        });
    },

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
                include: { contact: { select: { name: true, phoneNumber: true } } },
            }),
            prisma.appointment.count({ where }),
        ]);

        return { data, total };
    },

    // ── Bloqueios de agenda ──────────────────────────────────

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
