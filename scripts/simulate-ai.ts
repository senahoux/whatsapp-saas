import { AIService } from "../src/services/ai.service";
import type { AIRequestContext } from "../src/services/ai.service";
import type { ClinicContext } from "../src/services/clinic.service";

require('dotenv').config();

const clinicContext: ClinicContext = {
    nomeClinica: "Clínica Nova Vida",
    nomeMedico: "Dr. Lucas Sena",
    endereco: "Mogi Guaçu - SP", 
    telefone: "5511999999999",
    consultaValor: 400,
    consultaDuracao: 60,
    promocaoAtiva: false,
    promocaoTexto: null,
    descricaoServicos: "Saúde hormonal e performance",
    faq: [],
    regrasPersonalizadas: [],
};

const baseCtx: AIRequestContext = {
    mensagem_paciente: "",
    nome_paciente: "João Silva",
    historico_resumido: "",
    status_conversa: "SCHEDULING",
    contexto_clinica: clinicContext,
    agenda_snapshot: null,
    data_referencia: "2026-03-30",
    timezone: "America/Sao_Paulo",
    tabela_temporal: AIService.getDateReferences("America/Sao_Paulo")
};

async function runTest(nome: string, ctx: AIRequestContext) {
    console.log(`\n======================================================`);
    console.log(`TESTE: ${nome}`);
    console.log(`MENSAGEM: "${ctx.mensagem_paciente}"`);
    console.log(`======================================================`);
    try {
        const res = await AIService.respond(ctx);
        console.log(JSON.stringify(res, null, 2));
    } catch (e) {
        console.error("ERRO:", e);
    }
}

async function main() {
    // 1. "SIM"
    await runTest("1. SIM APÓS CONVITE DE ENTRADA", {
        ...baseCtx,
        mensagem_paciente: "sim",
        historico_resumido: "[ROBÔ]: Vi que você tem interesse na consulta. Quer que eu veja na agenda nosso próximo horário disponível?\n[PACIENTE]: sim"
    });

    // 2. PREFERÊNCIA DO PACIENTE
    await runTest("2. PREFERÊNCIA DO PACIENTE SOBREPÕE", {
        ...baseCtx,
        mensagem_paciente: "prefiro quarta à tarde",
        historico_resumido: "[ROBÔ]: Posso agendar para você hoje às 14:00?\n[PACIENTE]: prefiro quarta à tarde"
    });

    // 3. "ESSE MAIS TARDE"
    await runTest("3. ESSE MAIS TARDE", {
        ...baseCtx,
        mensagem_paciente: "esse mais tarde",
        historico_resumido: "[ROBÔ]: Encontrei esses horários para amanhã: 14:00, 16:30 e 18:00. Algum atende?\n[PACIENTE]: esse mais tarde",
        agenda_snapshot: { 
            monthInFocus: "Março/2026",
            validServiceDays: "Segunda, Terça e Quarta",
            initialSuggestions: [],
            monthSummary: "- Terça-feira (31/03): 14:00 (manhã) ou 16:30 (tarde)",
            availableSlots: [
                { date: "2026-03-31", time: "14:00", period: "tarde" },
                { date: "2026-03-31", time: "16:30", period: "tarde" },
                { date: "2026-03-31", time: "18:00", period: "tarde" }
            ], 
            activeFilter: "2026-03-31" 
        }
    });

    // 4. SLOT FANTASMA (ERRO INJETADO PELO BACKEND)
    await runTest("4. SLOT FANTASMA (CONTORNO DE ERRO)", {
        ...baseCtx,
        mensagem_paciente: "quero 22h",
        historico_resumido: "[ROBÔ]: Horários amanhã: 14h, 16h.\n[PACIENTE]: quero 22h\n[SISTEMA]: O agendamento falhou pois o horário (2026-03-31 22:00) não existe na lista. Comunique de forma gentil que houve um descompasso temporal e siga a agenda."
    });

    // 5. DUPLICIDADE (ERRO INJETADO PELO BACKEND)
    await runTest("5. DUPLICIDADE DE AGENDAMENTO", {
        ...baseCtx,
        mensagem_paciente: "pode ser as 14h entao",
        historico_resumido: "[ROBÔ]: Temos 14:00. Pode ser?\n[PACIENTE]: pode ser as 14h\n[SISTEMA]: O agendamento falhou. O paciente já tem horário marcado nesta exata data (2026-03-31 14:00). Avise-o que já consta no sistema."
    });

    // 6. REFERÊNCIAS TEMPORAIS
    await runTest("6. REFERÊNCIAS TEMPORAIS VARIADAS (Mês que vem)", {
        ...baseCtx,
        mensagem_paciente: "tem algo pro mês que vem?"
    });

    // 7. FUNIL DE DISPONIBILIDADE (RESUMO VS DETALHE)
    await runTest("7. FUNIL: MAIS OPÇÕES DO DIA", {
        ...baseCtx,
        mensagem_paciente: "só tem esses horários de manhã? não teria um pouco mais tarde?",
        historico_resumido: "[ROBÔ]: Vi no meu mapa que temos quarta (01/04) às 09:00 (manhã) ou 15:00 (tarde).\n[PACIENTE]: só tem esses horários de manhã? não teria um pouco mais tarde?",
        agenda_snapshot: { 
            monthInFocus: "Abril/2026",
            validServiceDays: "Segunda a Sexta",
            initialSuggestions: [],
            monthSummary: "- Quarta-feira (01/04): 09:00 (manhã) ou 15:00 (tarde)",
            availableSlots: [], // Na abertura, os slots técnicos estão vazios
            activeFilter: null
        }
    });
}

main();
