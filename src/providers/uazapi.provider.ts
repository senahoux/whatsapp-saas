import { WhatsAppProvider, NormalizedMessage } from "./whatsapp.provider";

/**
 * UazapiProvider
 * 
 * Implementação da interface abstrata para a Uazapi.
 * Responsável APENAS por converter nosso DTO em chamadas HTTP esperadas pela Uazapi
 * e converter o Webhook da Uazapi no nosso DTO interno. Sem lógicas médicas.
 */
export class UazapiProvider implements WhatsAppProvider {
    private readonly apiUrl: string;
    private readonly apiKey: string;
    private readonly instanceKey: string;

    constructor() {
        this.apiUrl = process.env.UAZAPI_API_URL || "https://uazapi.com.br/api";
        this.apiKey = process.env.UAZAPI_API_KEY || "";
        this.instanceKey = process.env.UAZAPI_INSTANCE_KEY || "";
    }

    async sendMessage(clinicId: string, phone: string, message: string): Promise<boolean> {
        if (!this.apiKey || !this.instanceKey) {
            console.warn(`[UazapiProvider] Env vars não configuráveis para envio na clínica ${clinicId}.`);
            return false;
        }

        try {
            // Exemplo endpoint genérico Uazapi: POST /instances/:instanceKey/messages/send
            const endpoint = `${this.apiUrl}/instances/${this.instanceKey}/messages/send`;
            const payload = {
                number: phone,
                body: message
            };

            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error(`[UazapiProvider] Falha HTTP ${response.status} ao enviar para ${phone}.`);
                return false;
            }

            return true;
        } catch (error) {
            console.error(`[UazapiProvider] Exceção crítica ao enviar mensagem para ${phone}:`, error);
            return false;
        }
    }

    validateWebhook(payload: any, signature?: string): boolean {
        // Validação de token ou hash para Uazapi. 
        // Retorna sempre true enquanto não configurado token secreto no Dashboard Uazapi
        return true;
    }

    normalizeIncomingMessage(payload: any, clinicId: string): NormalizedMessage | null {
        // Exemplo defensivo: O payload da Uazapi costuma ter body e from_me.
        // O usuário deverá refinar esses nomes de campos quando ligar a Uazapi localmente.
        try {
            // Supondo { event: 'message.upsert', data: { from: '5511999999@c.us', text: 'oi' } ... }
            const data = payload?.data || payload;
            if (!data) return null;

            const rawPhone = data.from || data.remoteJid || data.contactId;
            const textRaw = data.text || data.body || data.message;
            const msgId = data.id || data.messageId;

            if (!rawPhone || !textRaw) {
                return null;
            }

            const cleanPhone = rawPhone.split("@")[0].replace(/\D/g, "");

            return {
                clinicId: clinicId,
                phoneNumber: cleanPhone,
                message: textRaw,
                externalMessageId: msgId || `msg_${Date.now()}`,
                isFromMe: !!data.fromMe,
                messageType: data.type || "TEXT",
                sentAt: data.timestamp ? new Date(data.timestamp * 1000) : new Date()
            };
        } catch (error) {
            console.error("[UazapiProvider] Erro ao extrair propriedades do JSON da Uazapi:", error);
            return null;
        }
    }
}

// Instância Singleton exportada para uso contínuo
export const ProviderInst: WhatsAppProvider = new UazapiProvider();
