-- =============================================================================
-- Migration 00133: Melhorias nas integrações de ads
-- Adiciona campos de status de sincronização e índices de performance
-- =============================================================================

-- 1. Campos de sync status em client_integrations
ALTER TABLE public.client_integrations
  ADD COLUMN IF NOT EXISTS last_sync_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status       TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'syncing', 'success', 'error')),
  ADD COLUMN IF NOT EXISTS sync_error        TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_records INTEGER DEFAULT 0;

-- 2. Índices de performance para queries frequentes
CREATE INDEX IF NOT EXISTS idx_client_integrations_org_platform
  ON public.client_integrations (organization_id, platform);

CREATE INDEX IF NOT EXISTS idx_client_integrations_last_sync
  ON public.client_integrations (last_sync_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_campaign_data_org_client_date
  ON public.campaign_data (organization_id, client_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_data_platform_date
  ON public.campaign_data (platform, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_org_client_date
  ON public.daily_metrics (organization_id, client_id, date DESC);

-- 3. Unique constraint em campaign_data para evitar duplicatas no upsert
ALTER TABLE public.campaign_data
  DROP CONSTRAINT IF EXISTS campaign_data_unique_day_campaign;

ALTER TABLE public.campaign_data
  ADD CONSTRAINT campaign_data_unique_day_campaign
  UNIQUE (client_id, platform, date, campaign_name);

-- 4. Unique constraint em daily_metrics
ALTER TABLE public.daily_metrics
  DROP CONSTRAINT IF EXISTS daily_metrics_unique_client_date;

ALTER TABLE public.daily_metrics
  ADD CONSTRAINT daily_metrics_unique_client_date
  UNIQUE (client_id, date);

-- 5. Adicionar campos extras em daily_metrics que estavam faltando
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS total_revenue    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_impressions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_clicks     INTEGER DEFAULT 0;

-- 6. RPC para buscar todas as integrações ativas de uma organização (usado pelo n8n)
CREATE OR REPLACE FUNCTION public.get_active_integrations(p_org_id UUID)
RETURNS TABLE (
  id              UUID,
  client_id       UUID,
  client_name     TEXT,
  platform        TEXT,
  account_id      TEXT,
  access_token    TEXT,
  refresh_token   TEXT,
  settings        JSONB,
  last_sync_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id,
    ci.client_id,
    COALESCE(c.company, c.name) AS client_name,
    ci.platform,
    ci.account_id,
    ci.access_token,
    ci.refresh_token,
    ci.settings,
    ci.last_sync_at
  FROM client_integrations ci
  JOIN clients c ON c.id = ci.client_id
  WHERE ci.organization_id = p_org_id
    AND ci.account_id IS NOT NULL
    AND ci.access_token IS NOT NULL
  ORDER BY ci.last_sync_at ASC NULLS FIRST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_integrations(UUID) TO authenticated, service_role;

-- 7. RPC para atualizar status de sync (chamado pelo n8n após cada cliente)
CREATE OR REPLACE FUNCTION public.update_sync_status(
  p_integration_id UUID,
  p_status         TEXT,
  p_records        INTEGER DEFAULT 0,
  p_error          TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE client_integrations
  SET
    sync_status       = p_status,
    last_sync_at      = CASE WHEN p_status = 'success' THEN NOW() ELSE last_sync_at END,
    last_sync_records = CASE WHEN p_status = 'success' THEN p_records ELSE last_sync_records END,
    sync_error        = p_error,
    updated_at        = NOW()
  WHERE id = p_integration_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_sync_status(UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;
