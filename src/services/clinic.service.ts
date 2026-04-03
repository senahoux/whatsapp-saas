/**
 * ClinicService — WhatsApp SaaS
 *
 * Acesso aos dados da clínica e suas configurações.
 * Usado pelo backend para montar contexto dinâmico da IA
 * e para validar clinicId nas requisições do robô.
 *
 * A IA nunca recebe clinicId — apenas o conteúdo do contexto_clinica.
 */

import { prisma } from "@/lib/prisma";

// Tipos inferidos do Prisma client — compatíveis com SQLite e PostgreSQL
export type Clinic = any; // Fallback para garantir build se a inferência do @prisma/client falhar com campos JSON
export type Setting = any;

export interface ClinicContext {
    nomeClinica: string;
    nomeMedico: string;
    endereco: string | null;
    telefone: string | null;
    consultaValor: number | null;
    consultaDuracao: number | null;
    promocaoAtiva: boolean;
    promocaoTexto: string | null;
    descricaoServicos: string | null;
    faq: unknown[];
    regrasPersonalizadas: unknown[];
    prioritySuggestions?: any;
    aiContextMode: string;
    nomeAssistente: string;
}

export const ClinicService = {
    /**
     * Valida se o clinicId existe no banco.
     * Usado no webhook para rejeitar requisições de clínicas desconhecidas.
     */
    async validateClinicId(clinicId: string): Promise<boolean> {
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { id: true },
        });
        return !!clinic;
    },

    /**
     * Busca dados completos da clínica por id.
     */
    async findById(clinicId: string): Promise<Clinic | null> {
        return prisma.clinic.findUnique({ where: { id: clinicId } });
    },

    /**
     * Busca settings da clínica (debounce, modo padrão, admin phone, robot enabled).
     */
    async getSettings(clinicId: string): Promise<Setting | null> {
        return prisma.setting.findUnique({ where: { clinicId } });
    },

    /**
     * Monta o contexto_clinica para envio à IA.
     * A IA usa esses dados para responder como assistente da clínica.
     * FAQ e regras são deserializados do JSON armazenado no banco.
     * clinicId nunca é incluído neste contexto — a IA não sabe de multi-tenancy.
     */
    async buildContextForAI(clinicId: string): Promise<ClinicContext | null> {
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
        }) as any;

        if (!clinic) return null;

        let faq: unknown[] = [];
        let regrasPersonalizadas: unknown[] = [];

        try {
            if (clinic.faq) faq = JSON.parse(clinic.faq);
        } catch {
            faq = [];
        }

        try {
            if (clinic.regrasPersonalizadas) {
                regrasPersonalizadas = JSON.parse(clinic.regrasPersonalizadas);
            }
        } catch {
            regrasPersonalizadas = [];
        }

        // ... existing ...
        return {
            nomeClinica: clinic.nomeClinica,
            nomeMedico: clinic.nomeMedico,
            endereco: clinic.endereco,
            telefone: clinic.telefone,
            consultaValor: clinic.consultaValor,
            consultaDuracao: clinic.consultaDuracao,
            promocaoAtiva: clinic.promocaoAtiva,
            promocaoTexto: clinic.promocaoTexto,
            descricaoServicos: clinic.descricaoServicos,
            faq,
            regrasPersonalizadas,
            aiContextMode: clinic.aiContextMode,
            nomeAssistente: clinic.nomeAssistente,
        };
    },

    /**
     * Busca clínica incluindo seus settings.
     * Usado pelo painel Admin para exibir as configurações.
     */
    async getClinicWithSettings(clinicId: string) {
        return prisma.clinic.findUnique({
            where: { id: clinicId },
            include: { settings: true }
        });
    },

    /**
     * Atualiza dados da clínica. Sempre isolado por clinicId.
     */
    async updateClinic(clinicId: string, data: Partial<Omit<Clinic, "id" | "createdAt" | "updatedAt">>) {
        const exists = await ClinicService.validateClinicId(clinicId);
        if (!exists) throw new Error("Clinic not found");

        return prisma.clinic.update({
            where: { id: clinicId },
            data,
        });
    }
};
