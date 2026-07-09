-- ============================================================
-- Migration: rastreio de última atualização de schema por cliente
-- Banco A — Agência (crm_client_plans)
--
-- Adiciona c8_schema_updated_at para registrar quando o
-- bank_b_full_schema.sql foi aplicado pela última vez no
-- banco do cliente (individual ou em massa via n8n).
--
-- Idempotente: pode ser aplicada múltiplas vezes sem erro.
-- ============================================================

ALTER TABLE public.crm_client_plans
  ADD COLUMN IF NOT EXISTS c8_schema_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.crm_client_plans.c8_schema_updated_at IS
  'Timestamp da última vez que bank_b_full_schema.sql foi aplicado no Banco B do cliente.';

-- ── RPC: registra atualização de schema para um cliente ──────────────────────
CREATE OR REPLACE FUNCTION public.update_c8_schema_timestamp(
  p_client_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crm_client_plans
  SET c8_schema_updated_at = now()
  WHERE client_id = p_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_c8_schema_timestamp(UUID) TO authenticated;
