import { NextRequest, NextResponse } from "next/server";
import { ConversationService } from "@/services/conversation.service";
import { MessageService } from "@/services/message.service";
import { getSession } from "@/lib/auth";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { searchParams } = req.nextUrl;

    const session = await getSession();
    const clinicId = (session?.clinicId as string) || searchParams.get("clinicId");

    if (!clinicId) {
        return NextResponse.json(
            { error: "clinicId é obrigatório." },
            { status: 400 }
        );
    }

    const { id } = await params;

    // Valida que a conversa existe e pertence à clínica (multi-tenant guard)
    const conversation = await ConversationService.findById(clinicId, id);
    if (!conversation) {
        return NextResponse.json(
            { error: "Conversa não encontrada." },
            { status: 404 }
        );
    }

    // Busca contato e mensagens em paralelo (listByConversation já valida o tenant)
    const [contact, messages] = await Promise.all([
        ConversationService.findByContactId(clinicId, conversation.contactId).then(
            (c) => c?.contact ?? null
        ),
        MessageService.listByConversation(clinicId, id, { limit: 100 }),
    ]);

    return NextResponse.json({ conversation, contact, messages });
}
