export interface NormalizedMessage {
    clinicId: string;
    phoneNumber: string;
    message: string;
    externalMessageId: string;
    isFromMe: boolean;
    sentAt: Date;
    messageType: string;
}

export interface WhatsAppProvider {
    /**
     * Envia uma mensagem para um número e retorna se a API do provedor aceitou (200 OK)
     */
    sendMessage(clinicId: string, phone: string, message: string): Promise<boolean>;

    /**
     * Valida se a requisição de webhook recebida bate com a assinatura de segurança do provedor
     */
    validateWebhook(payload: any, signature?: string): boolean;

    /**
     * Recebe o JSON exato do provedor e converte para o formato interno que nosso
     * Backend entende (NormalizedMessage). Se for inválido ou de sistema, retorna null.
     */
    normalizeIncomingMessage(payload: any, clinicId: string): NormalizedMessage | null;
}
