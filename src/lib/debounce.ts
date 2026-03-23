/**
 * DebounceManager — WhatsApp SaaS
 *
 * Gerencia timers de debounce por conversa em memória.
 * Cada nova mensagem reinicia o timer — só após silêncio o callback dispara.
 *
 * V1 Local: in-memory (processo único Next.js).
 * Fase 2 (Vercel/serverless): substituir por BullMQ, Upstash ou similar,
 * mantendo a mesma interface pública.
 *
 * Chave do timer: conversationId (único por clínica via schema).
 */

import { Client as QStashClient } from "@upstash/qstash";

const qstashClient = process.env.QSTASH_TOKEN ? new QStashClient({ token: process.env.QSTASH_TOKEN }) : null;

type DebounceCallback = () => Promise<void>;

// Mapa global de timers — fallback estrito para ambiente local Node.js puro sem serverless
const localTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const DebounceManager = {
    /**
     * Agenda ou reinicia o processamento conversacional.
     * Transita de forma transparente entre In-Memory (Dev) e Serveless via Vercel Edge/Qstash.
     */
    async schedule(
        clinicId: string,
        conversationId: string,
        delayMs: number,
        callback: DebounceCallback
    ): Promise<void> {

        // 1. Fallback Local (Servidor Node Dedicado ou DevLocal)
        if (!qstashClient) {
            if (localTimers.has(conversationId)) {
                clearTimeout(localTimers.get(conversationId)!);
            }
            const timer = setTimeout(async () => {
                localTimers.delete(conversationId);
                try {
                    await callback();
                } catch (err) {
                    console.error(`[Debounce Local] Error:`, err);
                }
            }, delayMs);
            localTimers.set(conversationId, timer);
            return;
        }

        // 2. Caminho Multi-tenant Serverless via QStash
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
            const endpoint = `${baseUrl}/api/process-conversation`;

            // O QStash gerenciará o tempo garantindo que a req da Vercel morra viva e chame o webhook.
            // Para debouncing, o deduplication-id agrupa os mesmos pacotes no mesmo segundo-limite.
            await qstashClient.publishJSON({
                url: endpoint,
                body: { clinicId, conversationId },
                delay: Math.max(1, delayMs / 1000),
                headers: {
                    // Evita disparos duplicados se os envios entrarem dezenas de vezes na mesma janela
                    "Upstash-Deduplication-Id": conversationId
                }
            });
            console.log(`[QStash] Disparo em background engatilhado. Conversation: ${conversationId}`);
        } catch (error) {
            console.error(`[DebounceManager] Falha grotesca de QStash (Token Inválido?), operando abortivo...`, error);
        }
    },

    cancel(conversationId: string): void {
        if (localTimers.has(conversationId)) {
            clearTimeout(localTimers.get(conversationId)!);
            localTimers.delete(conversationId);
        }
    },

    has(conversationId: string): boolean {
        return localTimers.has(conversationId);
    },

    activeCount(): number {
        return localTimers.size;
    },

    clearAll(): void {
        for (const timer of localTimers.values()) {
            clearTimeout(timer);
        }
        localTimers.clear();
    },
};
