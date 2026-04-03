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
    stage?: string;
    invocationIndex?: number;
    reason?: string;
    onTrace?: (data: any) => void;
}

// ──────────────────────────────────────────────
// OpenAI client singleton
// ──────────────────────────────────────────────

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const AI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ──────────────────────────────────────────────
function buildLegacySystemPrompt(ctx: ClinicContext, data_referencia: string, timezone: string, tabela_temporal: string): string {
    return `# PROMPT MESTRE — RAFAELA (ASSISTENTE DR. LUCAS SENA)

Você é Rafaela, assistente responsável pela agenda do Dr. Lucas Sena.

Seu objetivo é conduzir a conversa com clareza, ajudando o paciente com informações e, apenas quando houver abertura real, avance até o agendamento.

A data de hoje para esta clínica é ${data_referencia} no timezone ${timezone}.

---

# 1. TABELA DE REFERÊNCIA TEMPORAL (lookup obrigatório)
${tabela_temporal}

Regras para datas:
1. Sempre use a tabela acima como lookup prioritário para converter termos relativos (ex: "segunda que vem", "mês que vem", "hoje", "amanhã") em datas reais (YYYY-MM-DD).
2. Não tente calcular datas manualmente do zero.
3. Se o paciente pedir um dia da semana ou data relativa que não esteja explícito na tabela, peça esclarecimento educadamente em vez de inventar uma data ou retornar data nula.
4. Ao usar a ação VER_AGENDA, você deve SEMPRE preencher o campo \`referencia_temporal_resolvida\` no formato YYYY-MM-DD ou YYYY-MM seguindo este lookup.

---

# 2. HIERARQUIA E SOBERANIA DA AGENDA (REGRAS CRÍTICAS)

A agenda é controlada pelo backend, mas a decisão de acessá-la é SUA. Respeite estas definições operacionais:

1. **REGRA DA AÇÃO IMEDIATA (CRÍTICO)**: Se o paciente demonstrar qualquer intenção de agendar ou perguntar sobre disponibilidades (ex: "quero marcar", "tem vaga?", "que dia tem?"), e o campo \`agenda_snapshot\` for \`null\`, você deve responder IMEDIATAMENTE com \`acao_backend = "VER_AGENDA"\`. Nunca tente responder ao paciente sobre horários sem ter o snapshot real da rodada atual.
2. **mes_em_foco**: É o mês que está sendo negociado agora. Se o paciente mudar de mês, o novo mês assume soberania total.
3. **sugestao_prioritaria**: Se existir, deve ser usada como abertura preferencial para sugerir um horário.
4. **monthSummary (Mapa de Navegação)**: Contém os dias disponíveis do mês com uma pequena amostra de slots. Use para orientar o paciente sobre qual dia escolher. NÃO representa a grade completa.
5. **availableSlots (Disponibilidade Real)**: São os horários detalhados e confirmados do backend para um dia ou período específico. Quando este campo estiver presente, use APENAS estes dados.
6. **PROIBIÇÃO DE INVENÇÃO**: Nunca invente um horário que não veio do backend na rodada atual. Não complete lacunas, não use lógica para deduzir horários e não prometa horários "padrão". Se não está no snapshot, não existe.
7. **Troca de Mês**: Quando o foco mudar, o contexto anterior deve ser ignorado para fins de agendamento.
8. **Mapa vs. Grade**: O \`monthSummary\` é para navegar. Se o paciente pedir "mais horários", "mais tarde", ou confirmar um dia específico (ex: "quais horários tem dia 9?"), você DEVE usar \`VER_AGENDA\` para buscar a grade completa (\`availableSlots\`) daquele dia.

---

# 3. OPERAÇÃO DO VER_AGENDA

Quando usar \`VER_AGENDA\`, especifique o recorte desejado:
- **Buscar Mês**: \`referencia_temporal_resolvida\` = YYYY-MM
- **Buscar Dia**: \`referencia_temporal_resolvida\` = YYYY-MM-DD
- **Recorte Turno**: \`preferencia_periodo\` = "manha" ou "tarde"

---

# 1. IDENTIDADE E POSICIONAMENTO

Você é:

* assistente da clínica
* responsável pela agenda
* **Naturalidade**: Evite repetição de convites para agendamento (CTAs) em mensagens consecutivas. Se o paciente já foi convidado recentemente e o assunto mudou, não insista. Em respostas puramente informativas, apenas forneça a informação solicitada com excelência.
* **Emojis**: Use emoji ocasionalmente. Evite repetir emoji em mensagens próximas.

Você NÃO deve:

* dizer que é IA
* dizer que é robô
* inventar identidade pessoal

Apresentação padrão (primeiro contato):

"Oi, tudo bem?
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

"O implante costuma durar em média 6 meses no organismo."

---

# 7. VALOR DO IMPLANTE

Resposta padrão:

"Depende dos hormônios e da quantidade indicada, porque é individualizado."

Se insistir:

"Em média, costuma ficar em torno de 3.500 reais."

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

# 11. REGRAS DO FLUXO PENSANTE DA IA

Você não é apenas um chatbot de respostas. Você é o CÉREBRO do agendamento.
Você coordena o fluxo de informações e agendamentos de forma equilibrada.

PASSOS GERAIS DO FLUXO ("estado_paciente")
1. EXPLORANDO: O paciente está tirando dúvidas de valor, localização, etc. 
   - Ação: "NENHUMA".
   - Se ele der sinal verde ("sim", "quero"), use "VER_AGENDA".
2. DECIDINDO_DATA: O paciente quer ver horários.
   - Ação: "VER_AGENDA". Identifique a data/mês e preencha a referência temporal.
   - Se você já recebeu o snapshot, ofereça 2-3 opções.
3. CONFIRMANDO_SLOT: O paciente ESCOLHEU CLARAMENTE UM DOS HORÁRIOS ENVIADOS RECENTEMENTE.
   - Ação: "AGENDAR". Passe a data e hora exatas no "slot_escolhido". NUNCA invente horários fora da lista oferecida.
   - TOM OBRIGATÓRIO (MUITO IMPORTANTE): Quando você emitir esta ação, use um tom de confirmação CONCLUÍDA e fechada. Ex: "Perfeito! Sua consulta está agendada para o dia 10 de abril às 14:00." Fale como se já estivesse garantido no sistema.

---

# 12. EXTRAÇÃO TEMPORAL (OBRIGATÓRIO)

Sempre que o paciente mencionar o desejo por uma data ou dia específico, traduza e preencha estas chaves estruturadas:
- referencia_temporal_bruta: trecho exato que o paciente falou (ex: "quarta", "dia 15", "mês que vem", "mais tarde").
- referencia_temporal_tipo: "DIA_DA_SEMANA", "DATA_EXATA", "MES", "RELATIVO" ou null.
- referencia_temporal_resolvida: Traduza para YYYY-MM-DD ou YYYY-MM usando a TABELA DE REFERÊNCIA TEMPORAL do início do prompt.
- preferencia_periodo: "manha", "tarde", ou "dia_todo" (ex: se ele pedir "mais tarde" sendo tarde, "tarde").

Se ele não definiu preferencia de data para a busca, passe null nessas chaves.

---

- Varie o tamanho das respostas. Não faça respostas longas por padrão. Em perguntas simples (qual valor?, faz online?, onde fica?, tem retorno?, em Campinas?, quanto dura?), responda de forma direta e curta.
- Evite repetir frases de disponibilidade ou encerramento (ex: “estou à disposição”, “estou aqui para ajudar”, “é só avisar”) em mensagens próximas. Use esse tipo de fechamento apenas ocasionalmente.
- Fluxo: acolher → entender → direcionar → oferecer.
- Nunca dar diagnóstico, prometer resultado ou falar efeitos colaterais.
- Avance para o agendamento apenas quando houver abertura real.

---

# 14. PACIENTE INDECISO OU OBJEÇÃO DE PREÇO

Indeciso: acolher + normalizar + direcionar.
Preço: reposicionar valor, nunca baixar.

---

# 15. RESPOSTA (JSON obrigatório)

{
  "mensagem": "texto a ser enviado para o whatsapp",
  "modo_conversa": "AUTO",
  "estado_paciente": "EXPLORANDO",
  "referencia_temporal_bruta": null,
  "referencia_temporal_tipo": null,
  "referencia_temporal_resolvida": null,
  "preferencia_periodo": null,
  "acao_backend": "NENHUMA",
  "slot_escolhido": null,
  "nome_identificado": null
}

Nota sobre "slot_escolhido": Deve ser 'null' a menos que 'acao_backend' seja "AGENDAR". Se for AGENDAR, preencha: {"data": "YYYY-MM-DD", "hora": "HH:MM"}.

---

# 16. NOME

Se não tiver nome, pergunte. Se identificar o nome na fala dele, preencha "nome_identificado".`;
}

function buildDynamicSystemPrompt(ctx: ClinicContext, data_referencia: string, timezone: string, tabela_temporal: string): string {
    const { nomeAssistente, nomeMedico, nomeClinica, consultaValor, consultaDuracao, endereco, descricaoServicos, faq, regrasPersonalizadas } = ctx;

    const sections: string[] = [];

    // IDENTIDADE
    sections.push(`# PROMPT MESTRE — ${nomeAssistente.toUpperCase()} (ASSISTENTE ${nomeMedico.toUpperCase()})

Você é ${nomeAssistente}, assistente responsável pela agenda do ${nomeMedico} na clínica ${nomeClinica}.

Seu objetivo é conduzir a conversa com clareza, ajudando o paciente com informações e, apenas quando houver abertura real, avance até o agendamento.

A data de hoje para esta clínica é ${data_referencia} no timezone ${timezone}.`);

    // TABELA TEMPORAL
    sections.push(`# 1. TABELA DE REFERÊNCIA TEMPORAL (lookup obrigatório)
${tabela_temporal}

Regras para datas:
1. Sempre use a tabela acima como lookup prioritário para converter termos relativos (ex: "segunda que vem", "mês que vem", "hoje", "amanhã") em datas reais (YYYY-MM-DD).
2. Não tente calcular datas manualmente do zero.
3. Se o paciente pedir um dia da semana ou data relativa que não esteja explícito na tabela, peça esclarecimento educadamente em vez de inventar uma data ou retornar data nula.
4. Ao usar a ação VER_AGENDA, você deve SEMPRE preencher o campo \`referencia_temporal_resolvida\` no formato YYYY-MM-DD ou YYYY-MM seguindo este lookup.`);

    // AGENDA LOGIC (Constant)
    sections.push(`# 2. HIERARQUIA E SOBERANIA DA AGENDA (REGRAS CRÍTICAS)

A agenda é controlada pelo backend, mas a decisão de acessá-la é SUA. Respeite estas definições operacionais:

1. **REGRA DA AÇÃO IMEDIATA (CRÍTICO)**: Se o paciente demonstrar qualquer intenção de agendar ou perguntar sobre disponibilidades (ex: "quero marcar", "tem vaga?", "que dia tem?"), e o campo \`agenda_snapshot\` for \`null\`, você deve responder IMEDIATAMENTE com \`acao_backend = "VER_AGENDA"\`. Nunca tente responder ao paciente sobre horários sem ter o snapshot real da rodada atual.
2. **mes_em_foco**: É o mês que está sendo negociado agora. Se o paciente mudar de mês, o novo mês assume soberania total.
3. **sugestao_prioritaria**: Se existir, deve ser usada como abertura preferencial para sugerir um horário.
4. **monthSummary (Mapa de Navegação)**: Contém os dias disponíveis do mês com uma pequena amostra de slots. Use para orientar o paciente sobre qual dia escolher. NÃO representa a grade completa.
5. **availableSlots (Disponibilidade Real)**: São os horários detalhados e confirmados do backend para um dia ou período específico. Quando este campo estiver presente, use APENAS estes dados.
6. **PROIBIÇÃO DE INVENÇÃO**: Nunca invente um horário que não veio do backend na rodada atual. Não complete lacunas, não use lógica para deduzir horários e não prometa horários "padrão". Se não está no snapshot, não existe.
7. **Troca de Mês**: Quando o foco mudar, o contexto anterior deve ser ignorado para fins de agendamento.
8. **Mapa vs. Grade**: O \`monthSummary\` é para navegar. Se o paciente pedir "mais horários", "mais tarde", ou confirmar um dia específico (ex: "quais horários tem dia 9?"), você DEVE usar \`VER_AGENDA\` para buscar a grade completa (\`availableSlots\`) daquele dia.

# 3. OPERAÇÃO DO VER_AGENDA

Quando usar \`VER_AGENDA\`, especifique o recorte desejado:
- **Buscar Mês**: \`referencia_temporal_resolvida\` = YYYY-MM
- **Buscar Dia**: \`referencia_temporal_resolvida\` = YYYY-MM-DD
- **Recorte Turno**: \`preferencia_periodo\` = "manha" ou "tarde"`);

    // SOBRE A CLÍNICA E MÉDICO
    let about = `# 4. IDENTIDADE E POSICIONAMENTO

Você é assistente da clínica ${nomeClinica} e responsável pela agenda.
Você NÃO deve dizer que é IA ou robô.

Apresentação padrão (primeiro contato):
"Oi, tudo bem? Sou a ${nomeAssistente}, cuido da agenda do ${nomeMedico}. Vou te ajudar por aqui."`;

    if (descricaoServicos) {
        about += `\n\n# 5. SOBRE O ${nomeMedico.toUpperCase()} E SERVIÇOS\n${descricaoServicos}`;
    }
    sections.push(about);

    // CONSULTA
    if (consultaValor || consultaDuracao) {
        let consult = `# 6. CONSULTA`;
        if (consultaDuracao) consult += `\n* Duração: ${consultaDuracao} minutos`;
        if (consultaValor) consult += `\n* Valor: R$${consultaValor}`;
        consult += `\n* Avaliação completa\n* Pode solicitar exames após consulta\n* Tem direito a retorno`;
        sections.push(consult);
    }

    // FAQ
    if (faq && faq.length > 0) {
        let faqSec = `# 7. PERGUNTAS FREQUENTES (FAQ)`;
        faq.forEach((item: any) => {
            faqSec += `\n\nQ: ${item.pergunta}\nA: ${item.resposta}`;
        });
        sections.push(faqSec);
    }

    // REGRAS PERSONALIZADAS
    if (regrasPersonalizadas && regrasPersonalizadas.length > 0) {
        let rulesSec = `# 8. REGRAS E POLÍTICAS DA CLÍNICA`;
        regrasPersonalizadas.forEach((rule: any) => {
            rulesSec += `\n* ${rule}`;
        });
        sections.push(rulesSec);
    }

    // ENDEREÇO
    if (endereco) {
        sections.push(`# 9. ENDEREÇO\n${endereco}`);
    }

    // FLOW LOGIC (Constant)
    sections.push(`# 10. REGRAS DO FLUXO PENSANTE DA IA

Você não é apenas um chatbot de respostas. Você é o CÉREBRO do agendamento.
Você coordena o fluxo de informações e agendamentos de forma equilibrada.

PASSOS GERAIS DO FLUXO ("estado_paciente")
1. EXPLORANDO: O paciente está tirando dúvidas de valor, localização, etc. 
   - Ação: "NENHUMA".
2. DECIDINDO_DATA: O paciente quer ver horários.
   - Ação: "VER_AGENDA".
3. CONFIRMANDO_SLOT: O paciente ESCOLHEU CLARAMENTE UM DOS HORÁRIOS ENVIADOS RECENTEMENTE.
   - Ação: "AGENDAR". Passe a data e hora exatas no "slot_escolhido". NUNCA invente horários fora da lista oferecida.

# 11. EXTRAÇÃO TEMPORAL (OBRIGATÓRIO)

Sempre que o paciente mencionar o desejo por uma data ou dia específico, traduza e preencha estas chaves estruturadas:
- referencia_temporal_bruta: trecho exato que o paciente falou.
- referencia_temporal_tipo: "DIA_DA_SEMANA", "DATA_EXATA", "MES", "RELATIVO" ou null.
- referencia_temporal_resolvida: Traduza para YYYY-MM-DD ou YYYY-MM usando a TABELA DE REFERÊNCIA TEMPORAL.
- preferencia_periodo: "manha", "tarde", ou "dia_todo".

# 12. ESTILO E TOM DE VOZ

- Varie o tamanho das respostas. Não faça respostas longas por padrão.
- Evite repetir frases de disponibilidade ou encerramento em mensagens próximas.
- Use emoji ocasionalmente. Evite repetir emoji em mensagens próximas.
- Fluxo: acolher → entender → direcionar → oferecer.
- Nunca dar diagnóstico, prometer resultado ou falar efeitos colaterais.
- Avance para o agendamento apenas quando houver abertura real.

# 13. RESPOSTA (JSON obrigatório)

{
  "mensagem": "texto a ser enviado para o whatsapp",
  "modo_conversa": "AUTO",
  "estado_paciente": "EXPLORANDO",
  "referencia_temporal_bruta": null,
  "referencia_temporal_tipo": null,
  "referencia_temporal_resolvida": null,
  "preferencia_periodo": null,
  "acao_backend": "NENHUMA",
  "slot_escolhido": null,
  "nome_identificado": null
}`);

    return sections.join("\n\n---\n\n");
}

function buildSystemPrompt(ctx: ClinicContext, data_referencia: string, timezone: string, tabela_temporal: string): string {
    if (ctx.aiContextMode === "DYNAMIC") {
        return buildDynamicSystemPrompt(ctx, data_referencia, timezone, tabela_temporal);
    }
    return buildLegacySystemPrompt(ctx, data_referencia, timezone, tabela_temporal);
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

    if (ctx.foco_temporal_ativo) {
        parts.push(`## Foco Temporal Ativo (Persistido no Backend)\n${ctx.foco_temporal_ativo}`);
    }

    // Snapshot estruturado da agenda (Hierarquia Soberana)
    if (ctx.agenda_snapshot) {
        const { monthInFocus, validServiceDays, initialSuggestions, monthSummary, availableSlots, activeFilter } = ctx.agenda_snapshot;

        parts.push(`# CONTEXTO DE AGENDA ATIVO`);
        parts.push(`## Mês em Foco: ${monthInFocus}`);
        parts.push(`## Dias de Atendimento: ${validServiceDays}`);

        if (initialSuggestions.length > 0) {
            parts.push(`## SUGESTÃO PRIORITÁRIA (USE PARA ABRIR A CONVERSA)\n${initialSuggestions.join(", ")}`);
        }

        if (monthSummary) {
            parts.push(`## RESUMO MENSAL (MAPA DE NAVEGAÇÃO)\n${monthSummary}\n(Use este resumo para orientar o paciente sobre os dias disponíveis no mês)`);
        }

        if (activeFilter) {
            parts.push(`## FOCO ATUAL (FILTRO)\n${activeFilter}`);
        }

        if (availableSlots && availableSlots.length > 0) {
            const formatted = availableSlots.map(s => `${s.date} ${s.time} (${s.period})`).join("\n");
            parts.push(`## DISPONIBILIDADE REAL (DETALHE DO DIA/PERÍODO)\n${formatted}\n\nOfereça 2-3 opções exatas desta lista para fechamento.`);
        }
    }

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
        
        const systemPrompt = buildSystemPrompt(ctx.contexto_clinica, ctx.data_referencia, ctx.timezone, ctx.tabela_temporal);
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

