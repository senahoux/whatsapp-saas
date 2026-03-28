import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

        // 1. Busca o contato vinculando ao clinicId da sessão (Garantia Multi-tenant)
        const contact = await prisma.contact.findFirst({
            where: {
                id,
                clinicId,
            },
        });

        if (!contact) {
            return NextResponse.json(
                { error: "Contato não encontrado ou não pertence a esta clínica" },
                { status: 404 }
            );
        }

        // 2. Deleta o contato. As relações (conversas, mensagens, agendamentos) 
        // serão removidas automaticamente pelo onDelete: Cascade do Prisma.
        await prisma.contact.delete({
            where: { id },
        });

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error: any) {
        console.error("[DELETE CONTACT ERROR]:", error);
        return NextResponse.json(
            { error: "Erro interno ao deletar contato" },
            { status: 500 }
        );
    }
}
