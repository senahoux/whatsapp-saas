import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ContactService } from "@/services";

/**
 * DELETE /api/contacts/[id]
 * Deleta um contato e todos os seus dados em cascata (conversas, mensagens, agendamentos).
 * Requer sessão ativa para garantir segurança multi-tenant.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        const clinicId = session?.clinicId as string;

        if (!clinicId) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { id } = await params;
        
        // 1. Executa a exclusão reforçada via Service (valida clinicId internamente)
        try {
            await ContactService.delete(clinicId, id);
        } catch (err: any) {
            if (err.message.includes("not found")) {
                return NextResponse.json(
                    { error: "Contato não encontrado ou não pertence a esta clínica" },
                    { status: 404 }
                );
            }
            throw err;
        }

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error: any) {
        console.error("[DELETE CONTACT ERROR]:", error);
        return NextResponse.json(
            { error: "Erro interno ao deletar contato" },
            { status: 500 }
        );
    }
}
