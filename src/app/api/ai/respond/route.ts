import { NextRequest, NextResponse } from "next/server";
import { AIService } from "@/services/ai.service";
import type { AIRequestContext } from "@/services/ai.service";

/**
 * POST /api/ai/respond
 *
 * Wrapper HTTP fino sobre AIService.respond.
 * Usado para testes e integrações externas controladas.
 *
 * ATENÇÃO: Este endpoint NÃO deve ser exposto publicamente sem autenticação.
 * Em produção (Vercel), proteger com middleware de auth (Passo 6).
 *
 * A IA nunca recebe clinicId — o contexto_clinica já foi montado pelo backend.
 * Este endpoint pressupõe que o contexto chegou pre-montado (uso interno/teste).
 */
export async function POST(req: NextRequest) {
    try {
        const body: AIRequestContext = await req.json();

        // Validação mínima do payload
        if (!body.mensagem_paciente || !body.contexto_clinica) {
            return NextResponse.json(
                { error: "mensagem_paciente and contexto_clinica are required" },
                { status: 400 },
            );
        }

        // clinicId nunca deve aparecer no contexto enviado à IA
        // Verificação defensiva: se vier no payload, remover
        const contextoSemTenant = { ...body.contexto_clinica };
        if ("clinicId" in contextoSemTenant) {
            delete (contextoSemTenant as Record<string, unknown>).clinicId;
        }

        const ctxSafe: AIRequestContext = {
            ...body,
            contexto_clinica: contextoSemTenant,
        };

        // Monta histórico resumido se não veio formatado
        if (!ctxSafe.historico_resumido && Array.isArray(body.historico_resumido)) {
            ctxSafe.historico_resumido = "";
        }

        const aiResponse = await AIService.respond(ctxSafe);

        if (!aiResponse) {
            return NextResponse.json(
                { error: "AI returned invalid response or API error" },
                { status: 502 },
            );
        }

        return NextResponse.json({ ok: true, response: aiResponse });
    } catch (error) {
        console.error("[ai/respond] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * GET /api/ai/respond — retorna modelo em uso (healthcheck simples)
 */
export async function GET() {
    return NextResponse.json({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        status: "ready",
    });
}
