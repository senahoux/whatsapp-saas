import { WhatsAppProvider, NormalizedMessage } from "./whatsapp.provider";
import { ClinicService } from "@/services/clinic.service";

/**
 * UazapiProvider
 * 
 * Implementação da interface abstrata para a Uazapi v2.
 * Responsável por converter nosso DTO em chamadas HTTP esperadas pela Uazapi
 * e converter o Webhook da Uazapi no nosso DTO interno.
 */
export class UazapiProvider implements WhatsAppProvider {
    private readonly apiKey: string;

    constructor() {
        this.apiKey = process.env.UAZAPI_API_KEY || "";
    }

    async sendMessage(clinicId: string, phone: string, message: string): Promise<boolean> {
        if (!this.apiKey) {
            console.warn(`[UazapiProvider] UAZAPI_API_KEY não configurada.`);
            return false;
        }

        try {
            // Busca a instância configurada para esta clínica no banco de dados
            const settings = await ClinicService.getSettings(clinicId);
            const instance = settings?.whatsappInstance;

            if (!instance) {
                console.error(`[UazapiProvider] Clínica ${clinicId} não possui whatsappInstance configurada no banco.`);
                return false;
            }

            // URL CORRETA (Confirmada): https://whatsapp-saas.uazapi.com/message/sendText/{instance}
            const endpoint = `https://whatsapp-saas.uazapi.com/message/sendText/${instance}`;

            const payload = {
                number: phone,
                textMessage: {
                    text: message
                },
                options: {
                    delay: 1500,
                    presence: "composing",
                    async: true
                }
            };

            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "token": this.apiKey // Continua usando o header 'token'
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
