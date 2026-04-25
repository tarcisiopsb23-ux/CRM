-- =============================================================================
-- Migration 020: Campos de status da verificação automática fiscal
--
-- Adiciona campos de controle à tabela organization_integrations para
-- registrar quando o cron de verificação de NFS-e foi executado pela última vez,
-- quantas notas foram verificadas e se houve erros.
-- Seguindo o padrão de client_integrations (migration 00133).
-- =============================================================================

ALTER TABLE organization_integrations
  ADD COLUMN IF NOT EXISTS last_check_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_check_status  TEXT DEFAULT 'never'
    CHECK (last_check_status IN ('never', 'running', 'success', 'error')),
  ADD COLUMN IF NOT EXISTS last_check_results JSONB DEFAULT '{}';

-- Índice para queries por tipo + status
CREATE INDEX IF NOT EXISTS idx_org_integrations_type_check
  ON organization_integrations (integration_type, last_check_at DESC NULLS LAST);

-- RPC para atualizar o status da checagem (chamado pelo n8n ao final do cron)
CREATE OR REPLACE FUNCTION public.update_fiscal_check_status(
  p_organization_id UUID,
  p_status          TEXT,
  p_results         JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organization_integrations
  SET
    last_check_at      = NOW(),
    last_check_status  = p_status,
    last_check_results = p_results,
    updated_at         = NOW()
  WHERE organization_id = p_organization_id
    AND integration_type = 'notaas';
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_fiscal_check_status(UUID, TEXT, JSONB)
  TO authenticated, service_role;
