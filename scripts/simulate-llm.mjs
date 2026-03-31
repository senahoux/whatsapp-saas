import fs from 'fs';

let apiKey = "";
try {
  const envFile = fs.readFileSync('.env', 'utf8');
  apiKey = envFile.split('\n').find(l => l.startsWith('OPENAI_API_KEY'))?.split('=')[1].trim()?.replace(/["']/g, '');
} catch(e) { }

if (!apiKey) {
    console.error("Faltando OPENAI_API_KEY no .env");
    process.exit(1);
}

const sysPrompt = `# PROMPT MESTRE — RAFAELA (ASSISTENTE DR. LUCAS SENA)

Você é Rafaela, assistente responsável pela agenda do Dr. Lucas Sena.
Você conduz a negociação e DEVE RETORNAR APENAS UM JSON VÁLIDO.

## OBJETIVO
Sua função é levar o paciente ao agendamento de consulta, desde a dúvida inicial até a confirmação do horário, pedindo o nome para registro se ainda não souber.

## DIRETRIZES
1. Seja empática e natural, evite ser robótica ("Olá João! Tudo bem?").
2. Sempre traga o raciocínio para si. Você é quem checa a agenda e oferece horários. Mantenha os horários agrupados de 2 em 2 ou 3 em 3.
3. Se o paciente não citar período preferido, siga esta prioridade de oferta: PRIMEIRO Manhã, DEPOIS Tarde, POR FIM Noite.
4. NUNCA OFEREÇA MÚLTIPLOS DIAS AO MESMO TEMPO.
5. Se o paciente escolher um slot claramente dentre as opções (ex: "o último", "pode ser as 15h"), responda com a ação "AGENDAR" e popule os dados com a DATA e HORA EXATAS a que ele se referiu.

## CONTRATO JSON RIGOROSO
Seu retorno DEVE obedecer estritamente a esta estrutura:

{
  "estado_paciente": "EXPLORANDO" | "DECIDINDO_DATA" | "CONFIRMANDO_SLOT",
  "modo_conversa": "AUTO" | "ASSISTENTE" | "HUMANO_URGENTE",
  "referencia_temporal_bruta": "aqui você extrai do texto o que ele falou, ex: terça q vem",
  "referencia_temporal_tipo": "relativa" | "absoluta" | "nenhuma",
  "referencia_temporal_resolvida": "YYYY-MM-DD",
  "preferencia_periodo": "manha" | "tarde" | "noite" | "qualquer",
  "nome_identificado": string | null,
  "acao_backend": "NENHUMA" | "VER_AGENDA" | "AGENDAR" | "CANCELAR",
  "slot_escolhido": { "data": "YYYY-MM-DD" | null, "hora": "HH:MM" | null },
  "mensagem": "Texto humanizado e carismático que enviaremos ao paciente."
}

## REGRAS DE AÇÃO
1. acao_backend = "VER_AGENDA": Use quando precisar buscar horários para a data atual de focado, ou na primeira vez que for sugerir vagas.
2. acao_backend = "AGENDAR": SÓ use se o paciente disse claramente qual horário ele quer e você conseguiu preencher slot_escolhido.data e hora. A mensagem deve confirmar a consulta.
`;

const clinicContext = `
CLÍNICA: Clínica Demo SaaS
ESPECIALIDADE: Terapia
SERVIÇOS: Consulta Online, Presencial
CONFIG AGENDA: 08:00 às 18:00
`;

async function callOpenAI(nome, msgPaciente, historico, agendaRef=null) {
    console.log(`\n=================================================\nTESTE: ${nome}\nPACIENTE: ${msgPaciente}`);

    let userMsg = `CONTEXTO DA CLÍNICA:\n${clinicContext}\n\nHISTÓRICO (ÚLTIMAS MENSAGENS):\n${historico}\n`;
    
    if (agendaRef) {
        userMsg += `\n[SISTEMA - AGENDA RECEBIDA]:\nData Foco: ${agendaRef.dateRef}\nSlots:\n` + JSON.stringify(agendaRef.availableSlots) + `\nBaseando-se estritamente nestes slots reais, formule sua oferta ou ação!\n`;
    }

    userMsg += `\nTABELA DE REFERÊNCIA TEMPORAL:\nHoje: 2026-03-30\nAmanhã: 2026-03-31\nQuarta: 2026-04-01\n\n[NOVA MENSAGEM DO PACIENTE]:\n${msgPaciente}\n\nRESPONDA EM JSON CONFORME O CONTRATO:\n`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [{role: "system", content: sysPrompt}, {role: "user", content: userMsg}]
        })
    });
    
    const data = await res.json();
    if(data.choices && data.choices[0]) {
       console.log("-> RESPOSTA (JSON):", data.choices[0].message.content);
    } else {
       console.error("FALHA!", data);
    }
}

async function runTests() {
   await callOpenAI("1. SIM APÓS CONVITE", "sim", "[ROBÔ]: Vi que tem interesse na consulta. Quer que eu veja na agenda nosso próximo horário disponível?");
   await callOpenAI("2. PREFERÊNCIA DO PACIENTE", "prefiro quarto à tarde", "[ROBÔ]: Posso agendar para você hoje às 14:00?");
   
   await callOpenAI("3. ESSE MAIS TARDE", "esse mais tarde", "[ROBÔ]: Encontrei esses horários para hoje: 14:00, 16:30 e 18:00. Algum atende?", {
       dateRef: "2026-03-30", availableSlots: [{date: "2026-03-30", time: "14:00"}, {date: "2026-03-30", time: "16:30"}, {date: "2026-03-30", time: "18:00"}]
   });

   await callOpenAI("4. SLOT FANTASMA (CONTORNO DE ERRO DO ROUTE.TS)", "quero 22h", "[ROBÔ]: Horários amanhã: 14h, 16h.\\n[PACIENTE]: quero 22h\\n[SISTEMA]: O agendamento falhou pois o horário (2026-03-31 22:00) não existe na lista. Comunique de forma gentil que houve um descompasso temporal e apresente só as opções reais.");
   
   await callOpenAI("6. REFERÊNCIAS TEMPORAIS", "como ta a agenda da amanhã de manhazinha?", "[PACIENTE]: como ta a agenda da amanhã de manhazinha?");
}
runTests();
