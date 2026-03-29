import { IntentionService } from "@/services/intention.service";
import { ConversationService } from "@/services/conversation.service";
import { Intention, ConversationState, ConversationStatus } from "@/lib/types";
import { prisma } from "@/lib/prisma";

async function verifyHybridFlow() {
    console.log("🚀 Iniciando Verificação do Fluxo Híbrido...\n");

    const clinicId = "cl90m1r5r00003b6yxr8x3e6m"; // ID de teste
    const contactId = "cl90m1r5r00013b6yxr8x3e6m"; // ID de teste

    // Setup: Garantir que consulta de teste existe
    const conv = await ConversationService.getOrCreate(clinicId, contactId);
    
    // Teste 1: INFO_ONLY
    const i1 = IntentionService.classify("Onde fica a clínica?", conv);
    console.log(`Teste 1 (INFO_ONLY): ${i1 === Intention.INFO_ONLY ? "✅ OK" : "❌ FALHA"} (${i1})`);

    // Teste 2: SOFT_SCHEDULING_INTEREST
    const i2 = IntentionService.classify("Gostaria de passar em consulta.", conv);
    console.log(`Teste 2 (SOFT_SCHEDULING_INTEREST): ${i2 === Intention.SOFT_SCHEDULING_INTEREST ? "✅ OK" : "❌ FALHA"} (${i2})`);

    // Teste 3: HARD_SCHEDULING_INTENT
    const i3 = IntentionService.classify("Quero agendar um horário para amanhã", conv);
    console.log(`Teste 3 (HARD_SCHEDULING_INTENT): ${i3 === Intention.HARD_SCHEDULING_INTENT ? "✅ OK" : "❌ FALHA"} (${i3})`);

    // Teste 4: Slot Confirmation em SCHEDULING
    const convScheduling = { ...conv, state: ConversationState.SCHEDULING } as any;
    const i4 = IntentionService.classify("1", convScheduling, ["2026-03-30 10:00", "2026-03-30 11:00"]);
    console.log(`Teste 4 (SLOT_CONFIRMATION): ${i4 === Intention.SLOT_CONFIRMATION ? "✅ OK" : "❌ FALHA"} (${i4})`);

    // Teste 5: BACK_TO_INFO em SCHEDULING
    const i5 = IntentionService.classify("Quanto custa a consulta?", convScheduling);
    console.log(`Teste 5 (BACK_TO_INFO): ${i5 === Intention.BACK_TO_INFO ? "✅ OK" : "❌ FALHA"} (${i5})`);

    // Teste 6: Atomic Cooldown Decrement
    console.log("\n🧪 Testando Atomicidade do Cooldown...");
    const msgId = "msg_test_123";
    
    // Reset cooldown to 3
    await ConversationService.setAgendaOfferCooldown(clinicId, conv.id, 3);
    
    // First consume (New Message)
    await ConversationService.decrementCooldownIfNewTurn(clinicId, conv.id, msgId);
    const c1 = await ConversationService.findById(clinicId, conv.id);
    console.log(`Decremento 1 (Turno Novo): ${(c1 as any).agendaOfferCooldown === 2 ? "✅ OK" : "❌ FALHA"} (Valor: ${(c1 as any).agendaOfferCooldown})`);

    // Second consume (Same Message / Retry)
    await ConversationService.decrementCooldownIfNewTurn(clinicId, conv.id, msgId);
    const c2 = await ConversationService.findById(clinicId, conv.id);
    console.log(`Decremento 2 (Mesmo Turno/Retry): ${(c2 as any).agendaOfferCooldown === 2 ? "✅ OK" : "❌ FALHA"} (Valor: ${(c2 as any).agendaOfferCooldown})`);

    // Third consume (Fresh Message)
    await ConversationService.decrementCooldownIfNewTurn(clinicId, conv.id, "msg_test_456");
    const c3 = await ConversationService.findById(clinicId, conv.id);
    console.log(`Decremento 3 (Outro Turno): ${(c3 as any).agendaOfferCooldown === 1 ? "✅ OK" : "❌ FALHA"} (Valor: ${(c3 as any).agendaOfferCooldown})`);

    console.log("\n✨ Verificação concluída.");
}

verifyHybridFlow().catch(console.error);
