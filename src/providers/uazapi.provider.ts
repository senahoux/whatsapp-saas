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
        let url = process.env.UAZAPI_API_URL || "https://uazapi.com.br/api";
        // Garante que a URL termina em /api para compatibilidade com o construtor de endpoints
        if (!url.endsWith("/api")) {
            url = url.replace(/\/$/, "") + "/api";
        }
        this.apiUrl = url;
        this.apiKey = process.env.UAZAPI_API_KEY || "";
        this.instanceKey = process.env.UAZAPI_INSTANCE_KEY || "";
    }

    async sendMessage(clinicId: string, phone: string, message: string): Promise<boolean> {
        if (!this.apiKey || !this.instanceKey) {
            console.warn(`[UazapiProvider] Env vars não configuráveis para envio na clínica ${clinicId}.`);
            return false;
        }

        try {
            // URL CORRETA (Uazapi v2+): POST /message/sendText/{instanceName}
            // Importante: apiUrl já é normalizada no constructor para não ter /api se não necessário,
            // mas aqui o usuário passou a base literal completa.
            const baseUrl = this.apiUrl.replace("/api", ""); // Remove o sufixo /api se existir para este endpoint específico
            const endpoint = `${baseUrl}/message/sendText/${this.instanceKey}`;

            const payload = {
                number: phone,
                text: message
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
                const errorText = await response.text();
                console.error(`[UazapiProvider] Falha HTTP ${response.status} ao enviar para ${phone}. Detalhes: ${errorText}`);
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
        try {
            // Uazapi costuma enviar tudo dentro de um objeto 'payload'
            const msgData = payload?.message || payload?.data?.message || payload?.data || payload;

            if (!msgData) return null;

            // Mapeando campos reais observados nos logs de produção
            const textRaw = msgData.text || msgData.content || msgData.body;

            // O telefone pode estar em sender_pn (ex: 5511999999@s.whatsapp.net) ou chat.phone
            const rawPhone = msgData.sender_pn || msgData.from || payload?.chat?.phone || payload?.chat?.wa_chatid;

            const msgId = msgData.id || msgData.messageid;
            const fromMe = msgData.fromMe ?? false;

            if (!rawPhone || !textRaw) {
                return null;
            }

            // Limpeza do telefone: pega apenas números antes do @
            const cleanPhone = String(rawPhone).split("@")[0].replace(/\D/g, "");

            return {
                clinicId: clinicId,
                phoneNumber: cleanPhone,
                message: String(textRaw),
                externalMessageId: msgId || `msg_${Date.now()}`,
                isFromMe: fromMe,
                messageType: msgData.type || msgData.messageType || "TEXT",
                sentAt: (() => {
                    const ts = msgData.messageTimestamp;
                    if (!ts) return new Date();
                    const d = new Date(ts > 10000000000 ? ts : ts * 1000);
                    if (isNaN(d.getTime()) || d.getFullYear() > 2100 || d.getFullYear() < 2020) return new Date();
                    return d;
                })(),
            };
        } catch (error) {
            console.error("[UazapiProvider] Erro ao extrair propriedades do JSON da Uazapi:", error);
            return null;
        }
    }
}

// Instância Singleton exportada para uso contínuo
export const ProviderInst: WhatsAppProvider = new UazapiProvider();
