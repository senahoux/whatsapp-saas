import { NextRequest, NextResponse } from "next/server";
import { ContactService, ConversationService, MessageService } from "@/services";
import { ClinicService } from "@/services/clinic.service";
import { LogService } from "@/services/log.service";
import { DebounceManager } from "@/lib/debounce";
import { ConversationStatus, LogEvent, MessageAuthor } from "@/lib/types";
import { ProviderInst } from "@/providers/uazapi.provider";

/**
 * POST /api/webhook/whatsapp
 *
 * Webhook Oficial (Entrada de Dados do Provider).
 * A URL OBRIGATORIAMENTE DEVE CONTER: ?clinicId=clxxxxxxx
 * 
 * Orquestra:
 *   1. Normalização do Payload externo (Uazapi) via Provider Interface.
 *   2. Validação de clinicId e settings
 *   3. Bloqueio de ADMIN e robot desabilitado
 *   4. Upsert de contato e conversa via services
 *   5. Intervenção humana (isFromMe)
 *   6. Criação de mensagem com dedup
 *   7. Debounce por conversa → dispara /api/process-conversation
 */
export async function POST(req: NextRequest) {
    let clinicId = req.nextUrl.searchParams.get("clinicId");

    try {
        const rawPayload = await req.json();

        // ── 1. Validação Multitenancy e Assinaturas ──────────────────────
        if (!clinicId) {
            return NextResponse.json(
                { error: "Missing clinicId in query parameters (?clinicId=...)" },
                { status: 400 }
            );
        }

        if (!ProviderInst.validateWebhook(rawPayload)) {
            return NextResponse.json({ error: "Security validation failed for Webhook" }, { status: 401 });
        }

        // ── 2. Parse e Normalização do Provedor Cego ─────────────────────
        const body = ProviderInst.normalizeIncomingMessage(rawPayload, clinicId);

        if (!body) {
            // Ignora eventos que não sejam de mensagens válidas que importam para o core
            return NextResponse.json({ ok: true, skipped: "unsupported_event_or_invalid_payload" });
        }

        // As the normalization guarantees types, we proceed exactly as before, 
        // with safety and decoupling.

        // ── 2. Validar clinicId no banco ─────────────────────────────────
        const isValidClinic = await ClinicService.validateClinicId(clinicId);
        if (!isValidClinic) {
            return NextResponse.json({ error: "clinicId not found" }, { status: 404 });
        }

        // ── 3. Buscar settings da clínica ────────────────────────────────
        const settings = await ClinicService.getSettings(clinicId);
        if (!settings) {
            return NextResponse.json(
                { error: "Clinic settings not configured" },
                { status: 500 }
            );
        }

        // ── 4. Robô desabilitado → aceitar e ignorar sem processar ───────
        if (!settings.robotEnabled) {
            return NextResponse.json({ ok: true, skipped: "robot_disabled" });
        }

        // ── 5. ADMIN pelo número em settings → skip total ────────────────
        if (settings.adminPhoneNumber && settings.adminPhoneNumber === body.phoneNumber) {
            await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, {
                phone: body.phoneNumber,
                skipped: "ADMIN_PHONE_SETTINGS",
            });
            return NextResponse.json({ ok: true, skipped: "admin_phone" });
        }

        // ── 6. Upsert contato ────────────────────────────────────────────
        const contact = await ContactService.upsert(clinicId, {
            phoneNumber: body.phoneNumber,
        });

        // ── 7. ADMIN marcado no banco → skip total ───────────────────────
        if (contact.isAdmin) {
            await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, {
                contactId: contact.id,
                skipped: "CONTACT_IS_ADMIN",
            });
            return NextResponse.json({ ok: true, skipped: "contact_is_admin" });
        }

        // ── 8. Obter ou criar conversa ───────────────────────────────────
        const conversation = await ConversationService.getOrCreate(clinicId, contact.id);

        // ── 9. INTERVENÇÃO HUMANA: usuário respondeu pelo celular ────────
        //       isFromMe = true → médico/assistente enviou mensagem manualmente
        if (body.isFromMe) {
            // Cancela debounce pendente — robô não deve responder
            DebounceManager.cancel(conversation.id);

            // Registra a mensagem do usuário no histórico
            await MessageService.create(clinicId, {
                conversationId: conversation.id,
                externalMessageId: body.externalMessageId,
                author: MessageAuthor.USUARIO,
                messageType: body.messageType,
                content: body.message,
                sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
            });

            // Marca conversa como HUMANO — robô pausa até próxima msg do cliente
            await ConversationService.markHumanIntervention(clinicId, conversation.id);

            await LogService.info(clinicId, LogEvent.HUMAN_INTERVENTION, {
                conversationId: conversation.id,
                contactId: contact.id,
            });

            return NextResponse.json({ ok: true, action: "human_intervention" });
        }

        // ── 10. Conversa em ERRO → não processar automaticamente ─────────
        if (conversation.status === ConversationStatus.ERRO) {
            await LogService.warn(clinicId, LogEvent.MESSAGE_RECEIVED, {
                conversationId: conversation.id,
                skipped: "CONVERSATION_IN_ERROR_STATE",
            });
            return NextResponse.json({ ok: true, skipped: "conversation_error_state" });
        }

        // ── 11. Criar mensagem com dedup por externalMessageId ───────────
        const { message, isDuplicate } = await MessageService.create(clinicId, {
            conversationId: conversation.id,
            externalMessageId: body.externalMessageId,
            author: MessageAuthor.CLIENTE,
            messageType: body.messageType,
            content: body.message,
            sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
        });

        // Webhook entregue mais de uma vez (idempotência) → ignorar silenciosamente
        if (isDuplicate) {
            return NextResponse.json({ ok: true, skipped: "duplicate_message" });
        }

        // ── 12. Atualizar metadados da conversa ──────────────────────────
        //        Reseta HUMANO → NORMAL automaticamente se cliente falar primeiro
        await ConversationService.updateAfterMessage(
            clinicId,
            conversation.id,
            MessageAuthor.CLIENTE,
            true // resetHumanIfClient: sim
        );

        await LogService.info(clinicId, LogEvent.MESSAGE_RECEIVED, {
            messageId: message.id,
            conversationId: conversation.id,
            contactId: contact.id,
            phone: body.phoneNumber,
        });

        // ── 13. Agendar/reiniciar debounce via QStash/Serverless ─────────────
        const debounceMs = (settings.debounceSeconds ?? 8) * 1000;

        // Marca como aguardando IA precocemente para o webhook nativo do QStash não sofrer bypass no endpoint
        await ConversationService.setStatus(
            clinicId,
            conversation.id,
            ConversationStatus.AGUARDANDO_IA
        );

        await LogService.info(clinicId, LogEvent.DEBOUNCE_TRIGGERED, {
            conversationId: conversation.id,
            contactId: contact.id,
            debounceSeconds: settings.debounceSeconds,
        });

        await DebounceManager.schedule(clinicId, conversation.id, debounceMs, async () => {
            // Callback Exclusivo para fallback LocalHost sem QStash Token
            const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

            try {
                const res = await fetch(`${baseUrl}/api/process-conversation`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        clinicId,
                        conversationId: conversation.id,
                    }),
                });

                if (!res.ok && res.status !== 404) {
                    await LogService.warn(clinicId, LogEvent.ERROR, {
                        note: "process-conversation returned non-OK in local fallback",
                        status: res.status,
                    });
                }
            } catch (err) {
                await LogService.warn(clinicId, LogEvent.ERROR, {
                    note: "process-conversation fallback error",
                    error: String(err),
                });
            }
        });

        return NextResponse.json({
            ok: true,
            messageId: message.id,
            conversationId: conversation.id,
            debounceMs,
        });
    } catch (error) {
        // Nunca lançar erro sem logar — o robô precisa de uma resposta limpa
        if (clinicId) {
            await LogService.error(clinicId, LogEvent.ERROR, {
                endpoint: "POST /api/webhook/whatsapp",
                error: String(error),
            }).catch(() => { });
        }
        console.error("[webhook/whatsapp] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
