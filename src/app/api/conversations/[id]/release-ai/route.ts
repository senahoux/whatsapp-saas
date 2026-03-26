/**
 * API Route: POST /api/conversations/[id]/release-ai
 * Libera a última mensagem da IA que estava aguardando revisão (modo ASSISTENTE).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ConversationService } from "@/services/conversation.service";
import { getSession } from "@/lib/auth";
import { MessageService } from "@/services/message.service";
import { ProviderInst } from "@/providers/uazapi.provider";
import { LogService } from "@/services/log.service";
import { ConversationStatus, LogEvent, MessageAuthor } from "@/lib/types";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: conversationId } = await params;
        const { searchParams } = new URL(req.url);

        const session = await getSession();
        const clinicId = (session?.clinicId as string) || searchParams.get("clinicId");

        if (!clinicId) {
            return NextResponse.json({ error: "clinicId is required" }, { status: 400 });
        }

        // 1. Busca conversa e valida status e clinicId
        const conversation = await ConversationService.findById(clinicId, conversationId);
        if (!conversation) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        if (conversation.status !== ConversationStatus.ASSISTENTE && conversation.status !== ConversationStatus.HUMANO) {
            // Aceitamos liberar se estiver em modo ASSISTENTE ou se o humano quiser forçar o robô
        }

        // 2. Busca a mensagem do ROBO mais recente que ainda não foi enviada (processed: false)
        const lastRoboMessage = await prisma.message.findFirst({
            where: {
                conversationId,
                clinicId,
                author: MessageAuthor.ROBO,
                processed: false,
            },
            orderBy: { createdAt: "desc" },
            include: {
                conversation: {
                    include: { contact: { select: { phoneNumber: true } } }
                }
            }
        });

        if (!lastRoboMessage || !lastRoboMessage.conversation?.contact?.phoneNumber) {
            return NextResponse.json({ error: "No pending robot message found for this conversation" }, { status: 404 });
        }

        // 3. Tenta "RESERVAR" a mensagem de forma atômica (Uso de updateMany garante que apenas um ganha o processed=false)
        const updateResult = await prisma.message.updateMany({
            where: {
                id: lastRoboMessage.id,
                clinicId,
                processed: false, // Só reserva se ainda não foi processada
                author: MessageAuthor.ROBO,
            },
            data: {
                processed: true,
                sentAt: new Date() // Marca início do envio
            }
        });

        // Se count for 0, significa que a mensagem já foi processada por outra requisição simultânea
        if (updateResult.count === 0) {
            return NextResponse.json({ error: "Message already processed or being sent" }, { status: 409 });
        }

        // 3. Dispara via Provider (Uazapi) - AGORA É SEGURO
        const phone = lastRoboMessage.conversation.contact.phoneNumber;
        const success = await ProviderInst.sendMessage(clinicId, phone, lastRoboMessage.content);

        // 4. Se falhar no envio real, registramos o erro mas mantemos o lock para evitar re-tentativas descontroladas
        // O humano verá o erro nos logs e poderá tentar novamente se necessário (ou o sistema marcar como falha)
        if (!success) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                action: "RELEASE_AI_MESSAGE_FAILED",
                conversationId,
                messageId: lastRoboMessage.id,
                error: "Provider failed to send"
            });
            return NextResponse.json({ error: "Failed to send message via WhatsApp provider" }, { status: 502 });
        }

        // 5. Finaliza o estado da conversa atômica
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { status: ConversationStatus.NORMAL } // Volta para o fluxo automático
        });

        // 6. Log de sucesso
        await LogService.info(clinicId, LogEvent.ACTION_EXECUTED, {
            action: "RELEASE_AI_MESSAGE_SUCCESS",
            conversationId,
            messageId: lastRoboMessage.id
        });

        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error("POST /api/conversations/release-ai error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
