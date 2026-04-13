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
    foco_temporal_ativo: string | null; // Contexto passivo persistido (ex: YYYY-MM ou YYYY-MM-DD)
    data_referencia: string;
    timezone: string;
    tabela_temporal: string;
}

export interface AIRespondOptions {
    stage?: 'PRIMARY' | 'AGENDA_LOOP' | 'GHOST_SLOT_RESOLUTION' | 'OCCUPIED_SLOT_RESOLUTION';
    invocationIndex?: number;
    reason?: string;
    onTrace?: (invocation: any) => void;
    systemPromptOverride?: string; // Fase 4.2 Simulation Lab
}

// ──────────────────────────────────────────────
// OpenAI client singleton
// ──────────────────────────────────────────────

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const AI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ──────────────────────────────────────────────
function buildSystemPrompt(ctx: ClinicContext, data_referencia: string, timezone: string, tabela_temporal: string): string {
    const { nomeAssistente, nomeMedico, nomeClinica, consultaValor, consultaDuracao, endereco, descricaoServicos, faq, regrasPersonalizadas, promocaoAtiva, promocaoTexto } = ctx;

    let faqSec = "";
    if (faq && Array.isArray(faq)) {
        faq.forEach((item: any) => {
            faqSec += `\nQ: ${item.pergunta}\nA: ${item.resposta}`;
        });
    }

    let rulesSec = "";
    if (regrasPersonalizadas && Array.isArray(regrasPersonalizadas)) {
        regrasPersonalizadas.forEach((rule: any) => {
            rulesSec += `\n- ${rule}`;
        });
    }

    return `Você é Rafaela, assistente da clínica ${nomeClinica}. Responda APENAS em JSON.
Data de hoje: ${data_referencia} | Timezone: ${timezone}

## REGRA ANTI-CTA — CRÍTICO
NUNCA termine mensagens com frases como:
- "estou à disposição para ajudar"
- "se precisar de algo, estou aqui"
- "fique à vontade para voltar"
- "posso ajudar com mais alguma coisa?"
- "se quiser agendar uma consulta..."
Responda a pergunta e pare. Só mencione agendamento quando o paciente pedir ou sinalizar intenção clara de marcar.

## IDENTIDADE
Assistente da clínica ${nomeClinica}, responsável pela agenda.
Não revele que é IA ou robô.
Primeiro contato: "Olá. Sou a Rafaela, assistente da clínica ${nomeClinica}. Como posso ajudar?"
Tom: profissional, direto, sem emojis.

## CLÍNICA
Endereço: ${endereco || "Não informado"}
Serviços: ${descricaoServicos || "Não informado"}
Consulta: ${consultaDuracao || 60} min | R$${consultaValor || 0} | inclui retorno | pode solicitar exames
${promocaoAtiva ? `Promoção: ${promocaoTexto}` : ""}

## FAQ
${faqSec}

## REGRAS
- Máximo 2 frases por mensagem
- Máximo 2 opções de horário por vez
- Exigir nome completo antes de confirmar agendamento
- Dor intensa ou urgência → estado_paciente: HUMANO_URGENTE imediatamente
- Nunca inventar horários — use apenas dados vindos do backend nesta rodada
${rulesSec}

## DATAS — LOOKUP OBRIGATÓRIO
${tabela_temporal}
Use sempre esta tabela para resolver referências relativas ("segunda que vem", "amanhã", etc.). Se não houver correspondência, peça esclarecimento.

## AGENDA
- Se paciente quiser horário e agenda_snapshot=null → acao_backend="VER_AGENDA" imediatamente, sem tentar responder sobre horários
- VER_AGENDA: referencia_temporal_resolvida = YYYY-MM (mês) ou YYYY-MM-DD (dia)
- preferencia_periodo: "manha" | "tarde" | "dia_todo"
- monthSummary = mapa de navegação. availableSlots = grade real (use APENAS estes para confirmar)
- AGENDAR: só quando paciente escolheu horário explícito da lista. Preencher slot_escolhido exato.
- Troca de mês: ignorar contexto anterior de agendamento.

## FLUXO
EXPLORANDO → responder info, acao_backend=NENHUMA
DECIDINDO_DATA → acao_backend=VER_AGENDA
CONFIRMANDO_SLOT → acao_backend=AGENDAR + slot_escolhido

## SAÍDA
{"mensagem":"","modo_conversa":"AUTO","estado_paciente":"EXPLORANDO","referencia_temporal_bruta":null,"referencia_temporal_tipo":null,"referencia_temporal_resolvida":null,"preferencia_periodo":null,"acao_backend":"NENHUMA","slot_escolhido":null,"nome_identificado":null}`;
}

function buildUserMessage(ctx: AIRequestContext): string {
    const parts: string[] = [];

    if (ctx.historico_resumido) {
        const lines = ctx.historico_resumido.split("\n");
        // Remove a última mensagem (que é a atual do paciente e já vem no campo mensagemAtual)
        const filtered = lines.length > 1 ? lines.slice(0, -1).join("\n") : "";
        
        if (filtered) {
            parts.push(`## Histórico\n${filtered}`);
        }
    }

    parts.push(`## Status: ${ctx.status_conversa}`);

    if (ctx.agenda_snapshot) {
        const { monthInFocus, validServiceDays, initialSuggestions, monthSummary, availableSlots, activeFilter } = ctx.agenda_snapshot;
        let agendaParts: string[] = [];
        
        agendaParts.push(`Mês: ${monthInFocus} | Dias: ${validServiceDays}`);
        if (activeFilter) agendaParts.push(`Filtro: ${activeFilter}`);
        if (monthSummary) agendaParts.push(`Resumo: ${monthSummary}`);
        if (initialSuggestions.length > 0) agendaParts.push(`Sugestão: ${initialSuggestions.join(", ")}`);
        
        if (availableSlots && availableSlots.length > 0) {
            const slotsStr = availableSlots.map(s => `${s.date} ${s.time}`).join(", ");
            agendaParts.push(`Slots Reais: ${slotsStr}`);
        }

        parts.push(`## Agenda\n${agendaParts.join("\n")}`);
    }

    parts.push(`## Mensagem do paciente\n${ctx.mensagem_paciente}`);

    return parts.join("\n\n");
}

// ──────────────────────────────────────────────
// Validação do contrato JSON de resposta
// ──────────────────────────────────────────────

const VALID_MODOS = ["AUTO", "ASSISTENTE", "HUMANO_URGENTE"] as const;
const VALID_ESTADOS = ["EXPLORANDO", "DECIDINDO_DATA", "CONFIRMANDO_SLOT"] as const;
const VALID_ACOES = ["NENHUMA", "VER_AGENDA", "AGENDAR", "CANCELAR"] as const;
const VALID_TIPOS_TEMPORAIS = ["DIA_DA_SEMANA", "DATA_EXATA", "MES", "RELATIVO", null] as const;
const VALID_PERIODOS = ["manha", "tarde", "dia_todo", null] as const;

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
        if (!VALID_MODOS.includes(parsed.modo_conversa)) throw new Error(`Chave 'modo_conversa' não reconhecida (${parsed.modo_conversa})`);
        if (!VALID_ESTADOS.includes(parsed.estado_paciente)) throw new Error(`Chave 'estado_paciente' não reconhecida (${parsed.estado_paciente})`);
        if (!VALID_ACOES.includes(parsed.acao_backend)) throw new Error(`Chave 'acao_backend' não reconhecida (${parsed.acao_backend})`);
        if (!VALID_TIPOS_TEMPORAIS.includes(parsed.referencia_temporal_tipo)) throw new Error(`Chave 'referencia_temporal_tipo' não reconhecida`);
        if (!VALID_PERIODOS.includes(parsed.preferencia_periodo)) throw new Error(`Chave 'preferencia_periodo' não reconhecida`);

        // Normalização de chaves opcionais e defasadas (sem quebrar o fluxo se for undefined)
        parsed.referencia_temporal_bruta = parsed.referencia_temporal_bruta ?? null;
        parsed.referencia_temporal_resolvida = parsed.referencia_temporal_resolvida ?? null;
        parsed.slot_escolhido = parsed.slot_escolhido ?? null;
        parsed.nome_identificado = parsed.nome_identificado ?? null;

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
    async respond(ctx: AIRequestContext, options?: AIRespondOptions): Promise<AIResponse | null> {
        const startTime = Date.now();
        console.log(">>> [AIService] Chamando OpenAI para:", ctx.nome_paciente);
        
        const systemPrompt = options?.systemPromptOverride || buildSystemPrompt(ctx.contexto_clinica, ctx.data_referencia, ctx.timezone, ctx.tabela_temporal);
        const userMessage = buildUserMessage(ctx);

        const messages: any[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
        ];

        let completion: any = null;
        let error: any = null;
        let validated: AIResponse | null = null;

        try {
            console.log(`\n[AIService] 🤖 Disparando Request p/ OpenAI (${AI_MODEL})...`);

            completion = await openai.chat.completions.create({
                model: AI_MODEL,
                messages,
                temperature: 0.4,
                max_tokens: 800,
                response_format: { type: "json_object" },
            });

            const rawContent = completion.choices[0]?.message?.content ?? "";
            validated = validateAIResponse(rawContent);

            if (!validated) {
                console.error("[AIService] ❌ O retorno JSON foi invalidado pelos filtros acima.");
            }

            return validated;
        } catch (err: any) {
            console.error("[AIService] ❌ OpenAI API error:", err);
            error = {
                message: err.message,
                code: err.code || err.status,
                type: err.type,
                status: err.status
            };
            return null;
        } finally {
            const latencyMs = Date.now() - startTime;
            
            if (options?.onTrace) {
                // Subset seguro e serializável conforme exigência 2
                const rawObject = completion ? {
                    id: completion.id,
                    model: completion.model,
                    usage: completion.usage,
                    choices: [{
                        finish_reason: completion.choices?.[0]?.finish_reason,
                        message: {
                            role: completion.choices?.[0]?.message?.role,
                            content: completion.choices?.[0]?.message?.content
                        }
                    }]
                } : null;

                options.onTrace({
                    invocationIndex: options.invocationIndex ?? 0,
                    stage: options.stage ?? "PRIMARY",
                    reason: options.reason ?? "Standard call",
                    request: {
                        model: AI_MODEL,
                        messages, // Payload real enviado
                        temperature: 0.4
                    },
                    response: {
                        rawText: completion?.choices?.[0]?.message?.content ?? null,
                        rawObject,
                        validated,
                        finishReason: completion?.choices?.[0]?.finish_reason ?? null
                    },
                    error,
                    metrics: {
                        latencyMs,
                        tokens: completion?.usage ? {
                            prompt: completion.usage.prompt_tokens,
                            completion: completion.usage.completion_tokens,
                            total: completion.usage.total_tokens
                        } : { prompt: 0, completion: 0, total: 0 }
                    }
                });
            }
        }
    },

    /**
     * Formata o histórico de mensagens para inclusão no contexto da IA.
     * Exclui mensagens SISTEMA — a IA só vê troca entre paciente e assistente.
     */
    buildHistorySummary(messages: HistoryMessage[], nomeAssistente: string = "Assistente"): string {
        if (messages.length === 0) return "";
        return messages
            .map((m) => {
                const label = m.author === "CLIENTE" ? "Paciente" : nomeAssistente;
                return `[${label}]: ${m.content}`;
            })
            .join("\n");
    },

    /**
     * Gera a tabela de referência temporal para o prompt da IA.
     * Baseia-se no timezone da clínica. Proporciona amplo limite visual temporal.
     */
    getDateReferences(timeZone: string = 'America/Sao_Paulo'): string {
        try {
            const now = new Date();
            
            // Helpers de formatação vinculados ao timezone da clínica (Regra 4)
            const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', {
                timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(d);
            
            const fmtWeekday = (d: Date) => {
                const name = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long' }).format(d);
                return name.charAt(0).toUpperCase() + name.slice(1); // Capitaliza
            };

            const monthName = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone, month: 'long' }).format(d);

            // Extraímos a realidade local da clínica para ancorar a 12h (meio-dia)
            // Meio-dia é a âncora mais segura para addDays sem saltar de fuso
            const localParts = new Intl.DateTimeFormat('en-US', {
                timeZone, year: 'numeric', month: 'numeric', day: 'numeric'
            }).formatToParts(now);
            
            const getLoc = (t: string) => localParts.find(p => p.type === t)?.value;
            const year = parseInt(getLoc('year') || "0");
            const month = parseInt(getLoc('month') || "0") - 1;
            const day = parseInt(getLoc('day') || "0");

            const anchor = new Date(year, month, day, 12, 0, 0);

            const addDays = (d: Date, days: number) => {
                const res = new Date(d.getTime());
                res.setDate(res.getDate() + days);
                return res;
            };

            let output = `TABELA DE REFERÊNCIA TEMPORAL (ÚNICA VERDADE ABSOLUTA)\n\n`;
            
            output += `--- 1. ÂNCORAS IMEDIATAS ---\n`;
            output += `Hoje: ${fmt(anchor)}\n`;
            output += `Amanhã: ${fmt(addDays(anchor, 1))}\n`;
            output += `Depois de amanhã: ${fmt(addDays(anchor, 2))}\n\n`;

            output += `--- 2. ÂNCORAS LONGAS ---\n`;
            output += `Mês Atual (${monthName(anchor)}): ${fmt(new Date(year, month, 1, 12))} até ${fmt(new Date(year, month + 1, 0, 12))}\n`;
            const proxMonthDate = new Date(year, month + 1, 1, 12);
            output += `Mês que Vem (${monthName(proxMonthDate)}): ${fmt(proxMonthDate)} até ${fmt(new Date(year, month + 2, 0, 12))}\n\n`;

            output += `--- 3. PRÓXIMOS 14 DIAS ---\n`;
            for (let i = 0; i <= 14; i++) {
                const stepDate = addDays(anchor, i);
                const stepDayName = fmtWeekday(stepDate);
                let prefix = "";
                if (i === 0) prefix = "(Hoje)";
                else if (i === 1) prefix = "(Amanhã)";
                
                output += `- ${stepDayName} ${prefix}: ${fmt(stepDate)}\n`;
            }

            return output;
        } catch (error) {
            console.error("[AIService | getDateReferences] Falha crítica ao gerar tabela temporal:", error);
            return `Hoje: ${new Intl.DateTimeFormat('en-CA').format(new Date())}`;
        }
    }
};

