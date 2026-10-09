-- =============================================================================
-- Migration 00223: Adiciona 'conta_nao_encontrada' ao enum lead_ads_level
-- O enum lead_ads_level existe no banco mas não havia migration local para ele.
-- ALTER TYPE ADD VALUE é irreversível e idempotente via bloco DO.
-- =============================================================================

DO $$
BEGIN
  -- Adiciona o valor somente se ainda não existir
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'lead_ads_level'
      AND e.enumlabel = 'conta_nao_encontrada'
  ) THEN
    ALTER TYPE lead_ads_level ADD VALUE 'conta_nao_encontrada';
  END IF;
END $$;
