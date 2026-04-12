/**
 * Seed — WhatsApp SaaS
 *
 * Cria dados mínimos para desenvolvimento local:
 *   - 1 clínica demo com FAQ e regras personalizadas em JSON
 *   - 1 usuário admin (placeholder — auth real na Fase 2)
 *   - 1 settings vinculado à clínica
 *
 * Executar:
 *   npm run db:seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Iniciando seed...");

    // ----------------------------------------------------------------
    // 1. Clínica Demo
    // ----------------------------------------------------------------
    const clinic = await prisma.clinic.upsert({
        where: { id: "clinic-demo-id" },
        update: {
            nomeClinica: "Clínica Demo",
            nomeMedico: "Médico Responsável",
            endereco: "Rua Exemplo, 123, Centro, Cidade - SP",
            telefone: "5511999999999",
            consultaValor: 500.00,
            consultaDuracao: 60, // minutos
            promocaoAtiva: true,
            promocaoTexto: "Este mês temos condições especiais para novos pacientes 😊",
            descricaoServicos: "Consulta médica especializada, acompanhamento preventivo e tratamentos avançados.",
            faq: JSON.stringify([
                {
                    pergunta: "Como funciona a consulta?",
                    resposta: "A consulta tem duração de 1 hora, no valor de R$400. É feita uma avaliação completa do seu quadro e podem ser solicitados exames posteriormente. O retorno já está incluso.",
                },
                {
                    pergunta: "Tem alguma promoção?",
                    resposta: "Esse mês estamos com uma avaliação hormonal inicial gratuita 😊 É uma avaliação inicial para entender seus sintomas hormonais e ver se há indicação de tratamento.",
                },
                {
                    pergunta: "O que são implantes hormonais e como funcionam?",
                    resposta: "Os implantes hormonais fazem parte de um acompanhamento médico de 6 meses. Eles são uma forma moderna de reposição hormonal, que liberam os hormônios de forma contínua e estável no organismo. Ajudam em sintomas como cansaço, baixa libido, alterações de humor e menopausa.",
                },
                {
                    pergunta: "Quanto tempo dura o implante no corpo?",
                    resposta: "O implante costuma durar em média 6 meses no organismo 😊",
                },
                {
                    pergunta: "Precisa trazer exames para a avaliação inicial?",
                    resposta: "Não solicita exames na avaliação inicial, o primeiro passo é a avaliação clínica. Mas se já tiver exames, pode trazer sim, o Dr. avalia tudo.",
                },
                {
                    pergunta: "Qual o valor da consulta?",
                    resposta: "A consulta custa R$400, com duração de 1 hora e direito a retorno.",
                },
                {
                    pergunta: "Qual o endereço da clínica?",
                    resposta: "ClinCare - Rua Manoel de Paula, 33, Capela, Mogi Guaçu - SP",
                },
                {
                    pergunta: "Vocês trabalham com planos de emagrecimento?",
                    resposta: "O Dr. trabalha com protocolos específicos para emagrecimento, sempre de forma individualizada.",
                }
            ]),
            regrasPersonalizadas: JSON.stringify([
                "Sempre oferecer no máximo 2 opções de horário por vez.",
                "Não confirmar agendamento sem perguntar o nome completo do paciente.",
                "Se o paciente mencionar dor intensa ou urgência, marcar como HUMANO_URGENTE imediatamente.",
                "Procedimentos estéticos: nunca prometer resultados específicos.",
                "Retornos pós-procedimento têm prioridade na agenda.",
            ]),
        },
        create: {
            id: "clinic-demo-id",
            nomeClinica: "Clínica Demo",
            nomeMedico: "Médico Responsável",
            endereco: "Rua Exemplo, 123, Centro, Cidade - SP",
            telefone: "5511999999999",
            consultaValor: 500.00,
            consultaDuracao: 60, // minutos
            promocaoAtiva: true,
            promocaoTexto: "Este mês temos condições especiais para novos pacientes 😊",
            descricaoServicos: "Consulta médica especializada, acompanhamento preventivo e tratamentos avançados.",
            faq: JSON.stringify([
                {
                    pergunta: "Como funciona a consulta?",
                    resposta: "A consulta tem duração de 1 hora. É feita uma avaliação completa do seu quadro e podem ser solicitados exames posteriormente. O retorno está incluso dentro do prazo estabelecido.",
                },
                {
                    pergunta: "Tem alguma promoção?",
                    resposta: "No momento, consulte nossa equipe para saber sobre condições especiais vigentes 😊",
                },
                {
                    pergunta: "Quais os principais tratamentos oferecidos?",
                    resposta: "Oferecemos uma gama completa de acompanhamento médico preventivo e tratamentos especializados focados no seu bem-estar e performance.",
                },
                {
                    pergunta: "Quanto tempo dura o tratamento?",
                    resposta: "A duração varia conforme o protocolo estabelecido pelo médico, geralmente com acompanhamento semestral 😊",
                },
                {
                    pergunta: "Precisa trazer exames para a avaliação inicial?",
                    resposta: "Não é obrigatório para a primeira conversa, mas se já possuir exames recentes de laboratório, recomendamos trazê-los para análise.",
                },
                {
                    pergunta: "Qual o valor da consulta?",
                    resposta: "O valor da consulta especializada é de R$500, com suporte pós-atendimento e direito a retorno.",
                },
                {
                    pergunta: "Qual o endereço da clínica?",
                    resposta: "Estamos localizados na Rua Exemplo, 123, Centro, Cidade - SP.",
                },
                {
                    pergunta: "Vocês trabalham com planos de emagrecimento?",
                    resposta: "Sim, possuímos protocolos específicos e individualizados para gerenciamento de peso e saúde metabólica.",
                }
            ]),
            regrasPersonalizadas: JSON.stringify([
                "Sempre oferecer no máximo 2 opções de horário por vez.",
                "Não confirmar agendamento sem perguntar o nome completo do paciente.",
                "Se o paciente mencionar dor intensa ou urgência, marcar como HUMANO_URGENTE imediatamente.",
                "Procedimentos estéticos: nunca prometer resultados específicos.",
                "Retornos pós-procedimento têm prioridade na agenda.",
            ]),
        },
    });

    console.log(`✅ Clínica criada: ${clinic.nomeClinica} (id: ${clinic.id})`);

    // ----------------------------------------------------------------
    // 2. Usuário Admin (placeholder — auth real na Fase 2)
    // ----------------------------------------------------------------
    const user = await prisma.user.upsert({
        where: {
            // unique: [clinicId, email]
            clinicId_email: {
                clinicId: clinic.id,
                email: "admin@exemplo.com",
            },
        },
        update: {},
        create: {
            clinicId: clinic.id,
            email: "admin@exemplo.com",
            passwordHash: "PLACEHOLDER_FASE2", // auth real na Fase 2
            role: "ADMIN",
        },
    });

    console.log(`✅ Usuário criado: ${user.email} (role: ${user.role})`);

    // ----------------------------------------------------------------
    // 3. Settings da clínica
    // ----------------------------------------------------------------
    const settings = await prisma.setting.upsert({
        where: { clinicId: clinic.id },
        update: {
            adminPhoneNumber: "5511999999999",
        },
        create: {
            clinicId: clinic.id,
            robotEnabled: true,
            robotModeDefault: "AUTO",
            debounceSeconds: 8,
            adminPhoneNumber: "5511999999999", // formato E.164 sem '+'
        },
    });

    console.log(
        `✅ Settings criados: debounce=${settings.debounceSeconds}s, modo=${settings.robotModeDefault}`
    );

    console.log("\n🎉 Seed concluído com sucesso!");
    console.log("──────────────────────────────────────");
    console.log(`   CLINIC_ID: ${clinic.id}`);
    console.log(`   Admin:     ${user.email}`);
    console.log(`   Admin Tel: ${settings.adminPhoneNumber}`);
    console.log("──────────────────────────────────────");
    console.log("👉 Copie o CLINIC_ID acima para o seu .env\n");
}

main()
    .catch((e) => {
        console.error("❌ Erro no seed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
