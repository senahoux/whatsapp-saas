-- =============================================================
-- Migration: Fase 6 — Replay Laboratory + Reativar Avaliação
-- Data: 2026-04-09
-- Tipo: ADITIVA (sem risco de perda de dados)
-- =============================================================

-- 1. Reativar campos de avaliação na tabela logs
-- (campos que foram removidos no rollback da Fase 5)
ALTER TABLE "logs" ADD COLUMN IF NOT EXISTS "evaluation" TEXT;
ALTER TABLE "logs" ADD COLUMN IF NOT EXISTS "evaluationNote" TEXT;
ALTER TABLE "logs" ADD COLUMN IF NOT EXISTS "evaluatedAt" TIMESTAMP(3);
ALTER TABLE "logs" ADD COLUMN IF NOT EXISTS "evaluatedBy" TEXT;

-- 2. Criar tabela replay_experiments
CREATE TABLE IF NOT EXISTS "replay_experiments" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "sourceLogId" TEXT NOT NULL,
    "frozenSnapshot" TEXT NOT NULL,
    "candidatePrompt" TEXT NOT NULL,
    "candidateResponse" TEXT,
    "candidateTrace" TEXT,
    "originalResponse" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verdict" TEXT,
    "verdictNote" TEXT,
    "evaluationProvider" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replay_experiments_pkey" PRIMARY KEY ("id")
);

-- 3. Índices para replay_experiments
CREATE INDEX IF NOT EXISTS "replay_experiments_clinicId_createdAt_idx"
    ON "replay_experiments"("clinicId", "createdAt");

CREATE INDEX IF NOT EXISTS "replay_experiments_sourceLogId_idx"
    ON "replay_experiments"("sourceLogId");

-- 4. Verificação: confirmar que as colunas existem
SELECT column_name FROM information_schema.columns
WHERE table_name = 'logs' AND column_name IN ('evaluation', 'evaluationNote', 'evaluatedAt', 'evaluatedBy')
ORDER BY column_name;

SELECT table_name FROM information_schema.tables
WHERE table_name = 'replay_experiments';
