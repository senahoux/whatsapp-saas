import { prisma } from "@/lib/prisma";

export interface ResolvedClinicContext {
    nomeAssistente: string;
    nomeMedico: string;
    nomeClinica: string;
    endereco: string | null;
    consultaValor: number | null;
    consultaDuracao: number | null;
    descricaoServicos: string | null;
    faq: any | null;
    regrasPersonalizadas: any | null;
    [key: string]: any;
}

/**
 * ReplayContextResolver — Fonte oficial de verdade para reconstrução histórica.
 * Resolve o contexto clínico para um instante específico (traceTimestamp).
 */
export class ReplayContextResolver {
    /**
     * Resolve o contexto clínico mesclando o que existe no trace com a versão histórica.
     * 
     * @param clinicId ID da clínica
     * @param traceTimestamp Timestamp original do trace (DATE)
     * @param rawClinicContext Atributos já presentes no trace (prioridade máxima)
     */
    static async resolve(
        clinicId: string,
        traceTimestamp: Date,
        rawClinicContext: any = {}
    ): Promise<ResolvedClinicContext> {
        // 1. Buscar a versão histórica válida para este instante
        const versions = await prisma.clinicContextVersion.findMany({
            where: {
                clinicId,
                effectiveFrom: { lte: traceTimestamp },
                OR: [
                    { effectiveTo: null },
                    { effectiveTo: { gte: traceTimestamp } }
                ]
            }
        });

        // 2. Proteção contra inconsistência temporal (Regra 5)
        if (versions.length > 1) {
            throw new Error(
                `[ReplayContextResolver] Ambiguidade detectada: ${versions.length} versões válidas para a clínica ${clinicId} em ${traceTimestamp.toISOString()}`
            );
        }

        const historicalVersion = versions[0];

        if (!historicalVersion) {
            throw new Error(
                `[ReplayContextResolver] Nenhuma versão histórica encontrada para a clínica ${clinicId} no instante ${traceTimestamp.toISOString()}. A reconstrução é impossível sem fonte de verdade.`
            );
        }

        // 3. Mesclar dados: Trace (Prioridade) > Versão Histórica
        // A regra diz: completar o que faltar com a versão histórica.
        const resolved: ResolvedClinicContext = {
            nomeAssistente: rawClinicContext.nomeAssistente || historicalVersion.nomeAssistente,
            nomeMedico: rawClinicContext.nomeMedico || historicalVersion.nomeMedico,
            nomeClinica: rawClinicContext.nomeClinica || historicalVersion.nomeClinica,
            endereco: rawClinicContext.endereco || historicalVersion.endereco,
            consultaValor: rawClinicContext.consultaValor ?? historicalVersion.consultaValor,
            consultaDuracao: rawClinicContext.consultaDuracao ?? historicalVersion.consultaDuracao,
            descricaoServicos: rawClinicContext.descricaoServicos || historicalVersion.descricaoServicos,
            // FAQ e Regras no trace costumam vir como JSON já.
            faq: rawClinicContext.faq || historicalVersion.faq,
            regrasPersonalizadas: rawClinicContext.regrasPersonalizadas || historicalVersion.regrasPersonalizadas,
        };

        // Adicionar outros campos que possam estar no rawClinicContext mas não no model histórico básico
        return {
            ...historicalVersion, // Inicia com tudo da versão histórica
            ...resolved,          // Sobrescreve com a lógica de mesclagem (trace > histórico)
            ...rawClinicContext,  // Garante que qualquer outro campo do trace seja preservado
        };
    }
}
