-- =============================================================================
-- Migration 00084: Campos sdr_id, closer_id, team_id em leads
-- Refs: Requirements 19.2, 1.3, 2.2, 2.3
-- =============================================================================

-- Adicionar colunas à tabela leads (idempotente com IF NOT EXISTS)
-- NÃO adicionar round_robin_index em teams — distribuição é 100% manual
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sdr_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id   UUID REFERENCES teams(id)    ON DELETE SET NULL;
