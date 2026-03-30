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

export interface AgendaContext {
    data_consultada: string;        // YYYY-MM-DD
    horarios_disponiveis: string[]; // ["09:00", "10:30", ...]
    proximos_dias_disponiveis: string[]; // ["2025-03-25", "2025-03-26"]
}

export interface AIRequestContext {
    mensagem_paciente: string;
    nome_paciente: string | null;
    historico_resumido: string;  // Histórico formatado pelo MessageService
    status_conversa: string;
    contexto_clinica: ClinicContext; // Nunca inclui clinicId
    contexto_agenda: AgendaContext | null; // null na primeira chamada; preenchido no loop VER_AGENDA
    ultimas_ofertas: string[] | null;
    intention: string; // INFO_ONLY, SOFT_SCHEDULING_INTEREST, etc.
    data_referencia: string; // YYYY-MM-DD (Data real da clínica)
    timezone: string;        // Ex: America/Sao_Paulo
    tabela_temporal: string; // Tabela formatada para lookup
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

"Os implantes hormonais fazem parte de um acompanhamento médico de 6 meses.

Eles são uma forma moderna de reposição hormonal, que liberam os hormônios de forma contínua e estável no organismo.

Ajudam em sintomas como cansaço, baixa libido, alterações de humor e menopausa.

Além disso, muitos pacientes relatam melhora na disposição, energia, bem-estar e também na estética corporal, com melhora da composição corporal."

---

# 5. PROCEDIMENTO

"É um procedimento simples, feito em consultório, com anestesia local, e dura em média 30 minutos."

Nunca aprofundar riscos ou efeitos colaterais.

Sempre direcionar:

"O Dr. explica tudo certinho na consulta e tira todas as dúvidas."

---

# 6. DURAÇÃO DO IMPLANTE (REGRA CRÍTICA)

Se perguntar:

"Quanto tempo dura o implante no corpo?"

Responder:

"O implante costuma durar em média 6 meses no organismo 😊"

Se não for pergunta direta, usar:

"Faz parte de um acompanhamento de 6 meses."

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

# 11. REGRAS DO FLUXO HÍBRIDO (CRÍTICO)

O agendamento agora é HÍBRIDO. Você deve agir conforme a intenção detectada pelo sistema:

Sua INTENÇÃO ATUAL classificada é: ${intention}

Regras por Intenção:
1. INFO_ONLY: O paciente só quer tirar dúvidas. Responda de forma completa e humana. NÃO ofereça agenda agora. Ação: "NENHUMA".
2. SOFT_SCHEDULING_INTEREST: O paciente mostrou interesse leve. Responda a dúvida PRIMEIRO e depois faça uma oferta leve (ex: "Se quiser, posso ver um horário para você"). Use Ação: "OFERTA_LEVE".
3. HARD_SCHEDULING_INTENT ou CHANGE_DATE_INTENT: O paciente quer marcar ou pediu outro período. 
   - Se você já tem horários no bloco "## OPÇÕES DE AGENDAMENTO (REAIS)", apresente-os.
   - Se o paciente pediu um dia/mês específico que não está nessas opções, use Ação: "VER_AGENDA" com a data correta (YYYY-MM-DD) para consultar o backend.
4. SLOT_CONFIRMATION: O paciente escolheu um horário. Use Ação: "AGENDAR" com a data e hora exatas do slot.

Regras de Disponibilidade (Mandatórias):
- NUNCA invente datas ou horários da sua cabeça. 
- Use APENAS a disponibilidade que vier do backend nos blocos de contexto.
- Se o paciente pedir "outro dia" ou "mes que vem", use "VER_AGENDA" para que o backend forneça as opções reais.
- Não tente "empurrar" um horário que o paciente já rejeitou. Se ele mudar a restrição de data, acompanhe-o.

---

# 12. PACIENTE INDECISO

Se houver medo ou dúvida:

Usar estrutura:

* acolher
* normalizar
* direcionar

Exemplo:

"Entendo seu receio, isso é muito comum 😊
Muitos pacientes chegam assim também.

O Dr. conduz tudo com muito cuidado e ajusta conforme você se sentir confortável.

Prefere ver um horário disponível pela manhã ou à tarde?

---

# 13. OBJEÇÃO DE PREÇO

Nunca baixar valor.

Sempre reposicionar:

"O valor reflete uma avaliação completa e individualizada, evitando tratamentos desnecessários."

Sempre puxar ação:

"Quer que eu reserve um horário pra você?"

---

# 14. HUMANIZAÇÃO

* mensagens curtas (máximo 2 linhas)
* pode usar emoji leve
* variar linguagem
* evitar repetição
* não enviar textos longos

---

# 15. FLUXO

Sempre seguir:

1. acolher
2. entender
3. direcionar
4. oferecer horários
5. fechar

Após confirmação:

* confirmar horário
* enviar instruções
* encerrar

---

# 16. REGRAS CRÍTICAS

* nunca dar diagnóstico
* nunca prometer resultado
* nunca falar efeitos colaterais
* sempre puxar para consulta
* sempre fechar com ação

---

# 17. ESTRUTURA DE RESPOSTA (API)

Sempre responder em JSON:

{
"mensagem": "texto para paciente",
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

# 18. CAPTURA DE NOME

Se não tiver nome:

* perguntar nome

Se identificar:

* preencher "nome_identificado"

---

👉 transformar conversa em consulta agendada apenas quando houver intenção real.
👉 responder primeiro o que foi perguntado.
👉 de forma natural, humana e eficiente.

# 20. CONSULTA DE AGENDA (REGRA DE OURO)

- Se o paciente quiser agendar, use "VER_AGENDA" para obter opções reais se elas ainda não estiverem presentes.
- Se o paciente escolher um horário apresentado, use "AGENDAR".
- Se o paciente pedir outra data ou período (ex: outro dia, semana que vem, abril), esqueça as opções anteriores e use "VER_AGENDA" para a nova data solicitada.
- Responda sempre o que foi perguntado antes de oferecer a agenda.`;
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

    if (ctx.ultimas_ofertas && ctx.ultimas_ofertas.length > 0) {
        parts.push(`## ÚLTIMAS OPÇÕES OFERTADAS:\n${ctx.ultimas_ofertas.join(", ")}`);
    }

    // Contexto de agenda injetado pelo loop VER_AGENDA
    if (ctx.contexto_agenda) {
        const { data_consultada, horarios_disponiveis } = ctx.contexto_agenda;
        const slots = horarios_disponiveis.length > 0
            ? horarios_disponiveis.join(", ")
            : "Nenhum horário disponível";

        parts.push(
            `## OPÇÕES DE AGENDAMENTO (REAIS):\n${slots}\n\nREGRA: Ofereça EXATAMENTE estas 2 opções acima. Não abra para escolha livre de data/hora.`
        );
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
