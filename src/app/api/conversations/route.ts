import { NextRequest, NextResponse } from "next/server";
import { ConversationService } from "@/services/conversation.service";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;

    // Prioridade 1: Sessão logada. Prioridade 2: Fallback temporário via URL.
    const session = await getSession();
    const clinicId = (session?.clinicId as string) || searchParams.get("clinicId");

    if (!clinicId) {
        return NextResponse.json(
            { error: "clinicId é obrigatório." },
            { status: 400 }
        );
    }

    const status = searchParams.get("status") ?? undefined;
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "50");

    const { data, total } = await ConversationService.list(clinicId, {
        status,
        page,
        pageSize,
    });

    return NextResponse.json({ data, total, page, pageSize });
}
