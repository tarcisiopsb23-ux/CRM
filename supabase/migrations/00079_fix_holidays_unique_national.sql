-- =============================================================================
-- Migration 00079: Corrige constraint UNIQUE para feriados nacionais
-- =============================================================================
-- Problema: UNIQUE(organization_id, holiday_date) com organization_id = NULL
-- não impede duplicatas no PostgreSQL (NULL != NULL em constraints).
-- Solução: índice único parcial para nacionais + índice para customizados.
-- =============================================================================

-- Remove a constraint original
ALTER TABLE rep_p_holidays DROP CONSTRAINT IF EXISTS rep_p_holidays_organization_id_holiday_date_key;

-- Índice único para feriados customizados (organization_id NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS rep_p_holidays_org_date_unique
  ON rep_p_holidays (organization_id, holiday_date)
  WHERE organization_id IS NOT NULL;

-- Índice único para feriados nacionais (organization_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS rep_p_holidays_national_date_unique
  ON rep_p_holidays (holiday_date)
  WHERE organization_id IS NULL;
