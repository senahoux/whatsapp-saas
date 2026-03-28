import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { SettingsService } from "@/services/settings.service";
import { LogService } from "@/services/log.service";
import { LogEvent } from "@/lib/types";

/**
 * PATCH /api/admin/settings/robot
 * 
 * Liga ou desliga o robô para a clínica logada.
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();
        const clinicId = session?.clinicId as string;

        if (!clinicId) {
            return NextResponse.json({ error: "Sessão inválida ou expirada" }, { status: 401 });
        }

        const { enabled } = await req.json();

        if (typeof enabled !== "boolean") {
            return NextResponse.json({ error: "Campo 'enabled' é obrigatório e deve ser boolean" }, { status: 400 });
        }

        const settings = await SettingsService.setRobotEnabled(clinicId, enabled);

        // Registro operacional
        await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
            action: "UPDATE_SETTING_ROBOT",
            enabled,
            note: enabled ? "Robô ATIVADO pelo administrador" : "Robô DESATIVADO pelo administrador"
        });

        return NextResponse.json({ ok: true, robotEnabled: settings.robotEnabled });
    } catch (error: any) {
        console.error("[PATCH_ROBOT_SETTINGS_ERROR]:", error);
        return NextResponse.json(
            { error: "Erro interno ao atualizar configurações" },
            { status: 500 }
        );
    }
}
