import { NextRequest, NextResponse } from "next/server";
import { LogService } from "@/services/log.service";
import { ClinicService } from "@/services/clinic.service";
import { getSession } from "@/lib/auth";
import { formatLogTime } from "@/lib/date";

/**
 * GET /api/logs/export
 * Exporta os últimos 50 ou 100 logs da clínica em formato Markdown.
 */
export async function GET(req: NextRequest) {
    const session = await getSession();
    const clinicId = session?.clinicId as string;

    // Segurança obrigatória: clinicId vindo estritamente da sessão
    if (!clinicId) {
        return new NextResponse("Não autorizado", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let limit = Number(searchParams.get("limit") ?? 50);
    
    // Regra 8: Normalização de limite
    if (limit !== 50 && limit !== 100) {
        limit = 50;
    }

    try {
        const clinic = await ClinicService.findById(clinicId);
        const { data: logs } = await LogService.list(clinicId, { pageSize: limit });

        const now = new Date();
        const formattedNow = formatLogTime(now);
        const clinicName = clinic?.nomeClinica || clinicId;

        // Montagem do Relatório Markdown
        let content = `# RELATÓRIO DE LOGS\n`;
        content += `Clínica: ${clinicName}\n`;
        content += `Exportado em: ${formattedNow}\n`;
        content += `Quantidade: ${logs.length}\n\n`;
        content += `---\n\n`;

        logs.forEach((log, index) => {
            content += `## ${index + 1}. ${log.event}\n`;
            content += `Data: ${formatLogTime(log.createdAt)}\n`;
            content += `Nível: ${log.level}\n\n`;
            content += `### Detalhes\n`;

            if (!log.details) {
                content += `(Sem detalhes)\n`;
            } else {
                try {
                    // Tratamento de details: JSON formatado ou texto normal (Regra 4)
                    const parsed = JSON.parse(log.details);
                    content += "```json\n" + JSON.stringify(parsed, null, 2) + "\n```\n";
                } catch {
                    content += `${log.details}\n`;
                }
            }

            content += `\n---\n\n`;
        });

        // Nome do arquivo conforme Regra 6 e 4.6 (original request template)
        // logs-report-clinic-[clinicId]-YYYY-MM-DD-HH-mm.md
        const timestamp = now.toLocaleString('pt-BR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        }).replace(/[^\d]/g, '-');
        
        const filename = `logs-report-clinic-${clinicId}-${timestamp}.md`;

        // Devuelve headers corretos para download (Regra 3)
        return new NextResponse(content, {
            headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        console.error("[export logs] Unhandled error:", error);
        return new NextResponse("Erro interno do servidor", { status: 500 });
    }
}
