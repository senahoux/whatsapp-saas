import { prisma } from "@/lib/prisma";

/**
 * SettingsService — WhatsApp SaaS
 * 
 * Gerencia as configurações operacionais por clínica.
 * A clínica é identificada unicamente pelo seu clinicId.
 */
export const SettingsService = {
    /**
     * Busca as configurações da clínica. 
     * Se não existir, utiliza os defaults do schema via upsert.
     */
    async getByClinicId(clinicId: string) {
        return prisma.setting.upsert({
            where: { clinicId },
            update: {},
            create: {
                clinicId,
                robotEnabled: true,
                robotModeDefault: "AUTO",
                debounceSeconds: 8
            }
        });
    },

    /**
     * Define o estado de ativação do robô.
     */
    async setRobotEnabled(clinicId: string, enabled: boolean) {
        return prisma.setting.upsert({
            where: { clinicId },
            update: { robotEnabled: enabled },
            create: {
                clinicId,
                robotEnabled: enabled,
                robotModeDefault: "AUTO"
            }
        });
    },

    /**
     * Busca apenas o campo robotEnabled para checagens rápidas de fluxo.
     */
    async isRobotEnabled(clinicId: string): Promise<boolean> {
        const settings = await this.getByClinicId(clinicId);
        return settings.robotEnabled;
    }
};
