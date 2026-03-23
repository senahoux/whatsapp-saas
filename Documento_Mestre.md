# DOCUMENTO MESTRE - ARQUITETURA SAAS WHATSAPP

Este documento define a fundação operacional, arquitetural e o roadmap atualizado do sistema SaaS de Automação de WhatsApp (Fase 2 Concluída). Todo o desenvolvimento futuro deve respeitar as diretrizes aqui consolidadas.

---

## 1. NOVA STACK TECNOLÓGICA (SAAS ESCALÁVEL)

O sistema foi categoricamente **migrado de um modelo local (Robô Playwright) para um modelo Cloud-Native (SaaS Serverless)**.

- **Frontend & Backend (Orquestração):** Next.js 14+ (Hospedado na Vercel).
- **Banco de Dados (CRUD e Vetores):** PostgreSQL (Hospedado no Supabase).
- **ORM:** Prisma (Tipagem estrita e schema validation).
- **Transporte de Mensageria:** API de WhatsApp via provider (Uazapi como implementação atual).
- **Background Jobs & Debounce:** Upstash QStash / Redis (Compatibilidade Serverless).
- **Motor de Inteligência (RAG):** OpenAI (`gpt-4o-mini`).

**Remoções Definitivas:**
- ❌ **Playwright / Puppeteer:** Removido completamente. Nenhuma automação visual ou raspagem de DOM é permitida.
- ❌ **SQLite Local:** Substituído por Postgres para suportar concorrência Serverless.
- ❌ **Timeouts em RAM (`setTimeout`):** Substituídos por Filas HTTP `QStash`, pois a Vercel destrói a memória Node.js a cada request.

---

## 2. ARQUITETURA E FLUXO DE DADOS

O sistema adota o padrão **Events-Driven via Webhook**, garantindo que o Backend seja a Fonte Única da Verdade. Provider externos (como Uazapi) atuam apenas como "carteiros cegos". Nenhuma lógica clínica ou de inteligência reside neles.

### 2.1. O Pipeline de Entrada (Inbound)
1. O paciente envia uma mensagem no WhatsApp.
2. A Uazapi dispara um **Webhook HTTP POST** para `/api/webhook/whatsapp?clinicId=cl123`.
3. A `camada Provider` traduz o JSON caótico da Uazapi para uma interface `NormalizedMessage`.
4. O `Webhook Controller` cria/atualiza o Contato e a Conversa no banco de dados.
5. Filtros de Idempotência bloqueiam duplicidades (mesmo `externalMessageId`).
6. O sistema despacha um evento de **Debounce** no `QStash`, agendando uma execução da Inteligência Artificial para dali a X segundos (ex: 8s), permitindo que o paciente mande várias mensagens antes da IA reagir.

### 2.2. A Máquina de Estado (Process Conversation)
Quando o `QStash` aciona a rota `/api/process-conversation`:
1. Verifica se a conversa ainda está aguardando IA (se um humano interviu localmente, a IA entra em standby).
2. Puxa as últimas X mensagens (RAG).
3. Injeta o perfil da Clínica (regras, preços, FAQ) do banco no Promtp de contexto.
4. Aciona a OpenAI.
5. Se a OpenAI devolver uma Ação `AUTO`: O sistema salva o texto e invoca a API HTTP da Uazapi (`sendMessage`) instantaneamente.
6. **Fallback Crítico:** Se a OpenAI devolver um JSON corrompido, alucinar, apresentar ausência de campos obrigatórios ou inconsistência estrutural do JSON, o sistema faz um Catch e entra automaticamente em modo `ASSISTENTE`, notificando os administradores e travando o loop autônomo.

---

## 3. GARANTIAS SISTÊMICAS

### 3.1. Isolamento Multi-Tenancy Obrigatório
**Regra de Ouro:** Nenhuma tabela transacional existe sem `clinicId`.
O sistema atende infindáveis clínicas simultaneamente no mesmo banco. A invasão de dados é mitigada na Rota: o ID da clínica viaja via QueryString parametrizada no Webhook blindando o isolamento desde a borda. Todo e qualquer `prisma.model.find` exige a passagem explícita do `clinicId` na cláusula `where`.

### 3.2. Provedor Desacoplado 
A Uazapi foi escolhida como acelerador nativo na Fase 2, mas o sistema tem uma Interface abstrata (`WhatsAppProvider`).
- Caso a API Oficial ou outro player concorra melhor, o DEV apenas criará um arquivo `novo.provider.ts` que implementa `sendMessage` e `normalizeIncomingMessage` e altera o ponteiro global, sem reescrever uma única linha de lógicas de negócio ou regras de IA.

### 3.3. Idempotência Contra Duplicidade
Webhooks externos (Meta, Stripe, Uazapi) historicamente retransmitem pacotes se houver latência de rede.
O projeto utiliza uma Unique Constraint composta ou varredura de `externalMessageId` na injeção Prisma. Mensagens já gravadas acionam Retorno HTTP 200 com status `duplicate_message`, ignorando a cascata da IA e impedindo cobranças indevidas de OpenAI.

---

## 4. ROADMAP EVOLUTIVO

A arquitetura base SaaS está aprovada e compilada.

### V1 — Módulo SaaS Foundation (Status: 🟢 CONCLUÍDO)
- Pipeline sem Playwright (via Uazapi Mock/API).
- Webhook assíncrono blindado.
- Multi-tenancy por Clinic_id finalizado no PostgreSQL.
- RAG Conversacional base funcional.

### V2 — Módulo Operacional Clínico (Status: 🟡 PRÓXIMA FASE)
- Integrar Agenda Real Multi-tenant (Marcador de Horários da IA no Banco).
- Disparo de Lembretes Ativos (Cronjobs via QStash que fazem Fetch de consultas de amanhã e enviam mensagem push via Provider).
- Painel Administrativo Básico (React/Next.js UI) para Humanos monitorarem o modo "ASSISTENTE" e intervir nas mensagens.
- Fechamento da Interface Gráfica de `Settings` (Ajustar delay, regras e ligar/desligar robô por clínica).

### V3 — Módulo Scale & Analytics (Status: ⚪ FUTURO)
- Dashboard de métricas (Custo por Lead, Conversões de Consulta, Uso de Tokens OpenAI global).
- WebSockets reais na UI (O Administrador vê a IA "digitando" em tempo real na tela).
- Roteamento de Tickets entre multi-atendentes sob a mesma clínica.
- Refinamento de UX/UI com Temas Dinâmicos.

---

## 5. ESTRUTURA COMPLETA DAS ENTIDADES (SCHEMA PRISMA)

A arquitetura usa UUID/CUID como Chave Primária e protege o escopo usando a Chave Estrangeira `clinicId`. Todas as operações do Prisma Client exigem o `where: { clinicId }`.

### 5.1. Entidades Core
- **`Clinic`**: Raiz do Tenant. Identificador global da instância da clínica.
  - Campos vitais: `id` (PK), `nomeClinica`, `nomeMedico`, `endereco`, `telefone`, `consultaValor`, `consultaDuracao`, `faq`, `regrasPersonalizadas`.
- **`User`**: Operadores Humanos do painel da clínica.
  - Campos vitais: `id` (PK), `clinicId` (FK), `email`, `passwordHash`, `name`, `role` (`ADMIN`, `MEDICO`, `ASSISTENTE`).
- **`Setting`**: Configurações de tráfego do tenant.
  - Campos vitais: `id`, `clinicId`, `robotEnabled` (boolean limitador master do webhook), `robotModeDefault`, `debounceSeconds`, `adminPhoneNumber`.

### 5.2. Entidades de Comunicação
- **`Contact`**: Paciente (Lead).
  - Campos vitais: `id` (PK), `clinicId` (FK), `phoneNumber` (Clean format, unique+clinicId), `name`, `isHotLead`, `isAdmin`.
- **`Conversation`**: Cesta Agrupadora de Sessão. Mantém a máquina de estados para evitar cruzamento de regras da IA com atuações de usuários humanos.
  - Campos vitais: `id` (PK), `clinicId`, `contactId`, `status` (Enum string), `lastMessageAt` (Acelerador de TTL da sessão).
- **`Message`**: Trilha histórica audital e RAG (Retrieval-Augmented Generation).
  - Campos vitais: `id` (PK), `clinicId`, `conversationId`, `externalMessageId` (ID da Uazapi/WhatsApp - Previne retries duplos), `author` (Origem do emissor), `content`, `messageType`.

### 5.3. Entidades de Tempo & Ação
- **`Appointment` / `ScheduleBlock`**: Gerenciamento temporal focado na IA RAG. 
  - Campos vitais: `id`, `clinicId`, `contactId`, `date`, `status`, `type` (Consulta/Retorno), `source` (ROBO vs MANUAL).

---

## 6. ESTADOS PADRONIZADOS DO SISTEMA

A lógica de concorrência baseia-se em *Constrained Enums* TypeScript espelhados no PostgreSQL para proteger estados fantasmas.

**A. Status da Conversa (`ConversationStatus`)**
- `NORMAL`: Estado ocioso. A IA processou e respondeu, agora a fila espera o humano falar de novo.
- `AGUARDANDO_IA`: Status setado *antes* do Scheduler do QStash processar e que impede múltiplas rotinas processarem na mesma infra serverless. Se o webhook bater de novo enquanto está nesse estado, a mensagem é anexada porém não redobra os gatilhos agendados.
- `HUMANO`: Um médico/atendente respondeu ativamente ao paciente por celular próprio (isFromMe) ou Painel. O Robô se cala permanentemente para o paciente até que interajam novamente após timeout ou manual reset.
- `PAUSADA` / `ERRO`: Intervenções do sistema contra loop de falhas.

**B. Autoria de Mensagens (`MessageAuthor`)**
- `CLIENTE` (Input da Borda externa - Uazapi), `USUARIO` (Admin logado), `ROBO` (Output OpenAI com Sucesso), `SISTEMA` (Logs visíveis inline como "Lead Quente Capturado").

---

## 7. CONTRATO COMPLETO DO MOTOR DE I.A

O Core baseia-se em *Structured JSON Outputs* da OpenAI. Se o parser falhar nas tentativas da Regex ou tipagem, a lib emite `null` e a aplicação inteira realiza o Fallback de degradação graciosa.

**Contrato Obrigatório Exigido (JSON Schema Nativo):**
```json
{
  "mensagem": "O texto final a ser devolvido ao WhatsApp.",
  "acao": "NENHUMA | VER_AGENDA | AGENDAR | REMARCAR | CANCELAR | TRIAGEM", 
  "modo": "AUTO | ASSISTENTE | HUMANO_URGENTE",
  "confianca": "ALTA | MEDIA | BAIXA",
  "precisa_nome": false,
  "nome_identificado": "João Pedro",
  "tipo": "CONSULTA", 
  "subtipo": "RETORNO_CONSULTA", 
  "data": "2025-03-24",
  "hora": "15:30",
  "lead": "QUENTE", 
  "notificar_admin": false
}
```

---

## 8. MODOS OPERACIONAIS DA IA (MODES)

Como estipulado na Fase 1, toda resposta da IA é classificada por ela mesma num espectro de criticidade:

- 🟢 **`AUTO` (Total Autonomia):** O Prompt foi obedecido. A mensagem cai no Provider HTTP (`UazapiProvider.sendMessage`) em Tempo-Real. Sem interação do banco em retenções.
- 🟡 **`ASSISTENTE` (Standby Clínico):** IA não tem certeza (Confiança Baixa) ou detectou requisição complexa. A Resposta é calculada e salva (`enqueueRobotReply`), mas não disparada. Aciona o estado de alerta e fica no painel pedindo que o Humano clique em "Aprovar Disparo" ou reescreva.
- 🔴 **`HUMANO_URGENTE` (Break-Glass):** Detecção de urgência/Ofensa. IA Aborta sua própria resposta, mutando a Conversation (Status `HUMANO`). A Notificação Ping é despachada aos Devices dos Doutores.

---

## 9. REGRAS DE SEGURANÇA OPERACIONAL (SAAS RULES)

A premissa da arquitetura SaaS blinda a aplicação contra loops de consumo de OpenAI ou vazamentos lógicos:

1. **Blindagem Serverless (O Fim do Timeout Local):** Como `setTimeout` in-memory será morto pelas Functions efêmeras da Vercel, o **Debounce** aciona o `Upstash QStash`. O payload envia `{ clinicId, conversationId }` para o backend agendado (ex: `delay=8s`), com `Upstash-Deduplication-Id = conversationId`. Rajadas do paciente (flood de texto) viram 1 único processamento.
2. **Idempotência Radical do Webhook Inbound:** Múltiplas requisições do WhatsApp (Seja de falha de confirmação 200 da Meta) possuem UNIQUE Keys. Mensagens que contem o mesmo `externalMessageId` disparam Resposta `200 OK - duplicate_message`, impedindo de inflar o banco e faturar duplamente a OpenAI.
3. **Resiliência Falha na IA (Graceful Fallback):** O parser do `AIService` não apenas decodifica `.parse()`, ele testa explicitamente cada chave num TypeGuard defensivo. JSONs corrompidos retornam NULL, fazendo o sistema cair automaticamente para modo `ASSISTENTE`, sem alertar e frustar o usuário final.
4. **Isolamento de Transporte Externo (Domain Driven):** A lógica de Webhooks Rest da Vercel NUNCA conhece o payload original do Provedor na camada de Serviço. O Request intercepta o raw, passa no `ProviderInst.normalizeIncomingMessage()` e o transforma no DTO interno estrito. Somente DTOs transitam pelos Services.
5. **Retry Outbound Controlado:** Falhas de envio ao provider devem ser tratadas com retry controlado e nunca devem gerar duplicidade de mensagens no domínio interno.

---

## 10. ESTRUTURA DE NOTIFICAÇÕES E AUDITORIA (LOGS)

Os mecanismos obsoletos de `console.log` acoplados aos robôs Playwright foram migrados para duas tabelas cruciais segmentadas por Tenants:

- **`Notification`**: Alertas feitos para a UI do Next.js Painel. Permitem leitura assíncrona baseada por clinicId e Tipos Reais (`HOT_LEAD`, `SYSTEM_ALERT`, `HUMANO_URGENTE`).
- **`Log`**: Trilha forense que mapeia nível `LogLevel` (Info, Warn, Error, Debug). Crucial no Vercel Deployment para que chamadas soltas ou logs de Gateway Timeouts não se percam fora da visualização analítica do Adm Super-User.
