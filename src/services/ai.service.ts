/**
 * AIService — WhatsApp SaaS
 *
 * Responsável pela comunicação com a OpenAI API.
 *
 * REGRAS FUNDAMENTAIS:
 * - A IA nunca recebe clinicId — apenas o contexto_clinica montado pelo backend
 * - O backend é o único responsável por multi-tenancy
 * - Em caso de falha ou JSON inválido, retorna null → processo cai em modo ASSISTENTE
 */

import OpenAI from "openai";
import type { AIResponse, HistoryMessage } from "@/lib/types";
import type { ClinicContext } from "./clinic.service";

// ──────────────────────────────────────────────
// Types — contexto enviado para a IA
// ──────────────────────────────────────────────

// Re-export para compatibilidade
export type { AgendaSnapshot } from "./appointment.service";
import type { AgendaSnapshot } from "./appointment.service";

export interface AIRequestContext {
    mensagem_paciente: string;
    nome_paciente: string | null;
    historico_resumido: string;
    status_conversa: string;
    contexto_clinica: ClinicContext;
    agenda_snapshot: AgendaSnapshot | null;
    intention: string;
    data_referencia: string;
    timezone: string;
    tabela_temporal: string;
}

// ──────────────────────────────────────────────
// OpenAI client singleton
// ──────────────────────────────────────────────

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const AI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ──────────────────────────────────────────────
function buildSystemPrompt(ctx: ClinicContext, data_referencia: string, timezone: string, tabela_temporal: string, intention: string): string {
    return `# PROMPT MESTRE — RAFAELA (ASSISTENTE DR. LUCAS SENA)

Você é Rafaela, assistente responsável pela agenda do Dr. Lucas Sena.

Seu objetivo é conduzir conversas no WhatsApp de forma natural, humana e eficiente, levando o paciente até o agendamento da consulta.

A data de hoje para esta clínica é ${data_referencia} no timezone ${timezone}.

---

# 1. TABELA DE REFERÊNCIA TEMPORAL (lookup obrigatório)
${tabela_temporal}

Regras para datas:
1. Sempre use a tabela acima como lookup prioritário para converter termos relativos (ex: "segunda que vem", "mês que vem", "hoje", "amanhã") em datas reais (YYYY-MM-DD).
2. Não tente calcular datas manualmente do zero.
3. Se o paciente pedir um dia da semana ou data relativa que não esteja explícito na tabela, peça esclarecimento educadamente em vez de inventar uma data ou retornar data nula.
4. Ao usar a ação VER_AGENDA, você deve SEMPRE preencher o campo data no formato YYYY-MM-DD seguindo este lookup. 

---

---

# 1. IDENTIDADE E POSICIONAMENTO

Você é:

* assistente da clínica
* responsável pela agenda
* educada, clara e objetiva

Você NÃO deve:

* dizer que é IA
* dizer que é robô
* inventar identidade pessoal

Apresentação padrão (primeiro contato):

"Oi, tudo bem? 😊
Sou a Rafaela, cuido da agenda do Dr. Lucas Sena. Vou te ajudar por aqui."

---

# 2. SOBRE O DR. LUCAS SENA

O Dr. Lucas Sena é médico com foco em:

* saúde hormonal
* performance
* reposição hormonal
* emagrecimento
* implantes hormonais

Ele trabalha com abordagem individualizada, buscando:

* melhorar energia
* disposição
* humor
* qualidade de vida
* estética corporal (com melhora da composição corporal)

---

# 3. CONSULTA

* Duração: 1 hora
* Valor: R$400
* Avaliação completa
* Pode solicitar exames após consulta
* Tem direito a retorno

Promoção:

"Esse mês estamos com uma avaliação hormonal inicial gratuita 😊"

Explicação:

"É uma avaliação inicial para entender seus sintomas hormonais e ver se há indicação de tratamento."

---

# 4. IMPLANTES HORMONAIS

Explicação padrão:

Eles são uma forma moderna de reposição hormonal, que liberam os hormônios de forma contínua e estável no organismo.

Ajudam em sintomas como cansaço, baixa libido, alterações de humor e menopausa.

Além disso, muitos pacientes relatam melhora na disposição, energia, bem-estar e também na estética corporal, com melhora da composição corporal."

---

# 5. PROCEDIMENTO

"É um procedimento simples, feito em consultório, com anestesia local, e dura em média 30 minutos."

Nunca aprofundar riscos ou efeitos colaterais.

Direcionar:

"O Dr. explica tudo certinho na consulta e tira todas as dúvidas."

---

# 6. DURAÇÃO DO IMPLANTE (REGRA CRÍTICA)

Se perguntar:

"Quanto tempo dura o implante no corpo?"

Responder:

"O implante costuma durar em média 6 meses no organismo 😊"

---

# 7. VALOR DO IMPLANTE

Resposta padrão:

"Depende dos hormônios e da quantidade indicada, porque é individualizado."

Se insistir:

"Em média, costuma ficar em torno de 3.500 reais."

Sempre reforçar consulta.

---

# 8. EXAMES

Se perguntar:

* Não solicita exames na avaliação inicial
* Primeiro é avaliação clínica

Se já tiver exames:

"Pode trazer sim, o Dr. avalia tudo."

---

# 9. MOUNJARO / EMAGRECIMENTO

"O Dr. trabalha com protocolos específicos para emagrecimento, sempre de forma individualizada."

---

# 10. ENDEREÇO

"ClinCare
Rua Manoel de Paula, 33
Capela, Mogi Guaçu - SP"

---

---

# 11. REGRAS DE AGENDAMENTO

Intenção atual: ${intention}

Regras por Intenção:
- INFO_ONLY: Responda a dúvida. Não ofereça agenda. Ação: "NENHUMA".
- SOFT_SCHEDULING_INTEREST: Responda a dúvida e faça oferta leve. Ação: "OFERTA_LEVE".
- HARD_SCHEDULING_INTENT / CHANGE_DATE_INTENT: Apresente os horários do snapshot abaixo. Se não houver ou paciente pedir data diferente, use "VER_AGENDA" com data YYYY-MM-DD.
- SLOT_CONFIRMATION: Paciente escolheu. Use "AGENDAR" com data+hora exatas.
- BACK_TO_INFO: Responda a dúvida normalmente. Ação: "NENHUMA".

Regra de Ouro: NUNCA invente datas ou horários. Use APENAS o que vier do backend.

---

# 12. HUMANIZAÇÃO E FLUXO

- Mensagens curtas (máximo 2-3 linhas)
- Emoji leve (no inicio), linguagem variada
- Fluxo: acolher → entender → direcionar → oferecer → fechar
- Nunca dar diagnóstico, prometer resultado ou falar efeitos colaterais
- puxar para consulta e fechar com ação

---

# 13. PACIENTE INDECISO OU OBJEÇÃO DE PREÇO

Indeciso: acolher + normalizar + direcionar.
Preço: reposicionar valor, nunca baixar. Puxar ação.

---

# 14. RESPOSTA (JSON obrigatório)

{
"mensagem": "texto",
"modo": "AUTO",
"acao": "NENHUMA",
"tipo": "CONSULTA",
"data": null,
"hora": null,
"lead": null,
"confianca": "ALTA",
"precisa_nome": false,
"nome_identificado": null
}

---

# 15. NOME

Se não tiver nome, pergunte. Se identificar, preencha "nome_identificado".`;
}

function buildUserMessage(ctx: AIRequestContext): string {
    const parts: string[] = [];

    if (ctx.historico_resumido) {
        parts.push(`## Histórico da conversa\n${ctx.historico_resumido}`);
    }

    if (ctx.nome_paciente) {
        parts.push(`## Nome do paciente\n${ctx.nome_paciente}`);
    }

    parts.push(`## Status atual da conversa\n${ctx.status_conversa}`);
    parts.push(`## Mensagem atual do paciente\n${ctx.mensagem_paciente}`);

    // Snapshot estruturado da agenda
    if (ctx.agenda_snapshot) {
        const { initialSuggestions, availableSlots, activeFilter } = ctx.agenda_snapshot;

        if (activeFilter) {
            parts.push(`## FILTRO TEMPORAL DO PACIENTE\n${activeFilter}`);
        }

        if (initialSuggestions.length > 0) {
            parts.push(`## SUGESTÕES INICIAIS DA CLÍNICA\n${initialSuggestions.join(", ")}\n(Use como primeira oferta se o paciente não pediu período específico)`);
        }

        if (availableSlots.length > 0) {
            const formatted = availableSlots.map(s => `${s.date} ${s.time} (${s.period})`).join("\n");
            parts.push(`## DISPONIBILIDADE REAL\n${formatted}\n\nEscolha 2-3 opções boas para oferecer (mix manhã/tarde se possível). Nunca invente horários fora desta lista.`);
        } else {
            parts.push(`## DISPONIBILIDADE REAL\nNenhum horário disponível no período solicitado. Informe ao paciente e sugira outro período.`);
        }
    }

    return parts.join("\n\n");
}

// ──────────────────────────────────────────────
// Validação do contrato JSON de resposta
// ──────────────────────────────────────────────

const VALID_MODOS = ["AUTO", "ASSISTENTE", "HUMANO_URGENTE"] as const;
const VALID_ACOES = [
    "NENHUMA",
    "VER_AGENDA",
    "OFERTA_LEVE",
    "AGENDAR",
    "REMARCAR",
    "CANCELAR",
    "TRIAGEM",
] as const;
const VALID_CONFIANCA = ["ALTA", "MEDIA", "BAIXA"] as const;

function validateAIResponse(raw: string): AIResponse | null {
    let parsed: any;
    try {
        let cleaned = raw.trim();
        // Remove markdown code blocks se ainda estiverem lá
        cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/gi, "");

        // Isola o JSON entre chaves
        const startIdx = cleaned.indexOf('{');
        const endIdx = cleaned.lastIndexOf('}');

        if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
            cleaned = cleaned.substring(startIdx, endIdx + 1);
        }

        parsed = JSON.parse(cleaned);
    } catch (err) {
        console.error("\n[AIService | Falha Crítica] JSON.parse estourou. Raw sujo recebido:\n", raw);
        return null; // Aqui era a quebra de pureza sintática
    }

    try {
        // Validação estrutural detalhada apontando exatamente onde a IA descumpriu o contrato
        if (typeof parsed.mensagem !== "string" || !parsed.mensagem.trim()) throw new Error("Chave obrigatória 'mensagem' ausente ou mal formatada");
        if (!VALID_MODOS.includes(parsed.modo)) throw new Error(`Chave 'modo' não reconhecida (${parsed.modo})`);
        if (parsed.acao !== null && !VALID_ACOES.includes(parsed.acao)) throw new Error(`Chave 'acao' não reconhecida (${parsed.acao})`);
        if (!VALID_CONFIANCA.includes(parsed.confianca)) throw new Error(`Chave 'confianca' não reconhecida (${parsed.confianca})`);
        if (typeof parsed.precisa_nome !== "boolean") throw new Error(`Chave 'precisa_nome' ausente ou não-booleana`);

        // Normalização de chaves opcionais e defasadas (sem quebrar o fluxo se for undefined)
        parsed.tipo = parsed.tipo ?? null;
        parsed.subtipo = parsed.subtipo ?? null;
        parsed.data = parsed.data ?? null;
        parsed.hora = parsed.hora ?? null;
        parsed.lead = parsed.lead ?? null;
        parsed.nome_identificado = parsed.nome_identificado ?? null;

        // notificar_admin antigamente era obrigatorio, assumindo default fallback false pra salvar o parse da IA!
        parsed.notificar_admin = parsed.notificar_admin ?? false;

        return parsed as AIResponse;
    } catch (err: any) {
        console.error(`\n[AIService | Type-Check Failed] Erro nas propriedades do objeto JSON validado: ${err.message}.\nObjeto extraído:`, JSON.stringify(parsed));
        return null;
    }
}

// ──────────────────────────────────────────────
// Service público
// ──────────────────────────────────────────────

export const AIService = {
    /**
     * Chama a OpenAI com o contexto montado pelo backend.
     * Retorna AIResponse validada ou null em caso de falha/JSON inválido.
     * Em null, o orquestrador (process-conversation) cai em modo ASSISTENTE.
     */
    async respond(ctx: AIRequestContext): Promise<AIResponse | null> {
        console.log(">>> [AIService] Chamando OpenAI para:", ctx.nome_paciente);
        console.log(">>> [AIService] Data de Ref:", ctx.data_referencia, "Timezone:", ctx.timezone);

        const systemPrompt = buildSystemPrompt(ctx.contexto_clinica, ctx.data_referencia, ctx.timezone, ctx.tabela_temporal, ctx.intention);
        const userMessage = buildUserMessage(ctx);

        try {
            console.log(`\n[AIService] 🤖 Disparando Request p/ OpenAI (${AI_MODEL})...`);

            const completion = await openai.chat.completions.create({
                model: AI_MODEL,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    { role: "user", content: userMessage },
                ],
                temperature: 0.4,
                max_tokens: 800,
                response_format: { type: "json_object" }, // força JSON nativo
            });

            const rawContent = completion.choices[0]?.message?.content ?? "";
            console.log(`[AIService] 📩 Retorno OpenAI recebido (Tamanho do Raw Content: ${rawContent.length} caracteres)`);
            console.log(`[AIService] Conteúdo Raw:\n${rawContent.slice(0, 300)}...\n`);

            const validated = validateAIResponse(rawContent);

            if (!validated) {
                console.error("[AIService] ❌ O retorno JSON foi invalidado pelos filtros acima.");
            } else {
                console.log(`[AIService] ✅ Parse estrutural validado com ISO-Perfeição. Ação Resultante: [${validated.acao}] Modo: [${validated.modo}]`);
            }

            return validated;
        } catch (err) {
            console.error("[AIService] ❌ OpenAI API error (Exceção de rede/chamada):", err);
            return null;
        }
    },

    /**
     * Formata o histórico de mensagens para inclusão no contexto da IA.
     * Exclui mensagens SISTEMA — a IA só vê troca entre paciente e assistente.
     */
    buildHistorySummary(messages: HistoryMessage[]): string {
        if (messages.length === 0) return "";
        return messages
            .map((m) => {
                const label = m.author === "CLIENTE" ? "Paciente" : "Assistente";
                return `[${label}]: ${m.content}`;
            })
            .join("\n");
    },

    /**
     * Gera a tabela de referência temporal para o prompt da IA.
     * Baseia-se no timezone da clínica.
     */
    getDateReferences(timeZone: string = 'America/Sao_Paulo'): string {
        try {
            // Usa Intl para pegar "agora" no timezone correto
            const now = new Date();
            const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(d);

            // Âncora formatada no fuso da clínica
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            });
            const parts = formatter.formatToParts(now);
            const getP = (type: string) => parts.find(p => p.type === type)?.value || "0";

            // Cria objeto Date "local" ao fuso para cálculos de dias da semana
            const year = parseInt(getP('year'));
            const month = parseInt(getP('month')) - 1;
            const day = parseInt(getP('day'));
            const anchor = new Date(year, month, day);
            const todayIdx = anchor.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

            // Hoje
            const hoje = fmt(anchor);

            // Amanhã
            const amanhaDate = new Date(anchor);
            amanhaDate.setDate(anchor.getDate() + 1);
            const amanha = fmt(amanhaDate);

            // Próxima segunda (se hoje for segunda, pula para a próxima)
            const proxSeg = new Date(anchor);
            const diffSeg = (todayIdx === 1 ? 7 : (1 - todayIdx + 7) % 7);
            const finalDiffSeg = diffSeg === 0 ? 7 : diffSeg;
            proxSeg.setDate(anchor.getDate() + finalDiffSeg);

            // Próxima sexta
            const proxSex = new Date(anchor);
            const diffSex = (todayIdx === 5 ? 7 : (5 - todayIdx + 7) % 7);
            const finalDiffSex = diffSex === 0 ? 7 : diffSex;
            proxSex.setDate(anchor.getDate() + finalDiffSex);

            // Primeiro do próximo mês
            const proxMes = new Date(year, month + 1, 1);

            return `TABELA DE REFERÊNCIA TEMPORAL
Hoje: ${hoje}
Amanhã: ${amanha}
Segunda-feira que vem: ${fmt(proxSeg)}
Sexta-feira que vem: ${fmt(proxSex)}
Primeiro dia do próximo mês: ${fmt(proxMes)}`.trim();
        } catch (error) {
            console.error("[AIService | getDateReferences] Falha crítica ao gerar tabela temporal:", error);
            const fallback = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            return `Hoje: ${fallback}`;
        }
    }
};
