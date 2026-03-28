
import { AIService } from '../src/services/ai.service';

// Mocking the context and response
async function simulateScenario() {
    console.log("--- SIMULAÇÃO DE CENÁRIO REAL ---");
    
    // 1. Simulação: Oferta de 2 opções
    const lastOfferedSlots = ["2026-03-28 14:00", "2026-03-28 15:00"];
    console.log("ESTADO: 2 slots oferecidos:", lastOfferedSlots);
    
    // 2. Simulação: Paciente responde "1"
    const patientMessage = "1";
    console.log("EVENTO: Paciente respondeu:", patientMessage);
    
    // 3. Simulação da Lógica do Orquestrador (Baseado no code de route.ts)
    console.log("\n--- PROCESSAMENTO NO BACKEND ---");
    
    const lastOffered = lastOfferedSlots;
    const patientText = patientMessage.trim();
    const isOneOrTwo = (patientText === "1" || patientText === "2") && lastOffered.length === 2;
    
    const confirmationTerms = [
        "pode marcar", "fechado", "quero esse", "esse horário", "pode ser",
        "sim", "confirmo", "pode agendar", "marcar", "agendar", "ok", "beleza", "perfeito"
    ];
    const patientTextLower = patientText.toLowerCase();
    const isExplicitConfirmation = isOneOrTwo || 
        confirmationTerms.some(term => patientTextLower.includes(term)) || 
        /\d{1,2}:\d{2}/.test(patientTextLower);
        
    console.log(`LOG: isOneOrTwo = ${isOneOrTwo}`);
    console.log(`LOG: isExplicitConfirmation = ${isExplicitConfirmation}`);
    
    // Mock da resposta da IA (Agora seguindo o novo prompt)
    const aiResponse = {
        acao: "AGENDAR",
        data: "2026-03-28",
        hora: "14:00",
        mensagem: "Perfeito! Agendado para amanhã às 14h."
    };
    
    console.log(`LOG: IA retornou acao=${aiResponse.acao}, data=${aiResponse.data}, hora=${aiResponse.hora}`);
    
    if (isExplicitConfirmation && aiResponse.acao === "AGENDAR") {
        const selectedSlot = `${aiResponse.data} ${aiResponse.hora}`;
        const isValid = lastOffered.includes(selectedSlot);
        
        console.log(`LOG: Validando slot ${selectedSlot} contra ofertas...`);
        if (isValid) {
            console.log("LOG: ✅ Slot confirmado com sucesso!");
            
            // Simulação de Limpeza de Contexto
            console.log("\n--- LIMPEZA DE CONTEXTO ---");
            const finalState = "IDLE";
            const finalSlots: string[] = [];
            console.log(`LOG: Estado resetado para -> ${finalState}`);
            console.log(`LOG: Slots limpos -> ${JSON.stringify(finalSlots)}`);
            console.log("RESULTADO: Sucesso total sem loop.");
        } else {
            console.log("LOG: ❌ Slot Inválido!");
        }
    } else {
        console.log("LOG: ❌ Confirmação negada pelo backend!");
    }
}

simulateScenario();
