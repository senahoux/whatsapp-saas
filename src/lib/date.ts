const TIMEZONE = 'America/Sao_Paulo';

export function formatDateBR(dateInput: string | Date | null | undefined): string {
    if (!dateInput) return "—";
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: TIMEZONE,
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(dateInput));
    } catch {
        return "—";
    }
}

export function formatTimeBR(dateInput: string | Date | null | undefined): string {
    if (!dateInput) return "—";
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: TIMEZONE,
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(dateInput));
    } catch {
        return "—";
    }
}

export function formatDateOnlyBR(dateInput: string | Date | null | undefined): string {
    if (!dateInput) return "—";
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: TIMEZONE,
            day: '2-digit', month: '2-digit', year: 'numeric'
        }).format(new Date(dateInput));
    } catch {
        return "—";
    }
}
