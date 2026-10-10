-- =============================================================================
-- Migration 116: RPC get_client_integrations_overview
--
-- Retorna um resumo de status de integração por cliente, agregando:
--   1. client_integrations           — Meta Ads (platform=meta/meta_ads), Google Ads (platform=google)
--   2. meta_connections              — Facebook, Instagram, WhatsApp, Meta Ads (ad_account_id)
--                                      Quando client_id IS NOT NULL → isolado por cliente.
--                                      Quando client_id IS NULL (legado) → propagado a todos.
--   3. client_google_calendar_tokens — Google Agenda (connected=true), sempre por client_id
--
-- Execute no Supabase da AGÊNCIA (Banco A)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_client_integrations_overview(
  p_organization_id UUID
)
RETURNS TABLE (
  client_id         UUID,
  platform          TEXT,
  is_connected      BOOLEAN,
  sync_status       TEXT,
  last_sync_at      TIMESTAMPTZ,
  account_id        TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- ── 1. client_integrations (Meta Ads legado, Google Ads) ───────────────────
  SELECT
    ci.client_id::UUID,
    ci.platform::TEXT,
    TRUE::BOOLEAN                             AS is_connected,
    ci.sync_status::TEXT,
    ci.last_sync_at::TIMESTAMPTZ,
    ci.account_id::TEXT
  FROM public.client_integrations ci
  WHERE ci.organization_id = p_organization_id

  UNION ALL

  -- ── 2. meta_connections → Facebook ─────────────────────────────────────────
  -- client_id IS NOT NULL → só aquele cliente
  -- client_id IS NULL     → propaga a todos os clientes da org (legado)
  SELECT
    COALESCE(mc.client_id, c.id)::UUID        AS client_id,
    'facebook'::TEXT                          AS platform,
    TRUE::BOOLEAN                             AS is_connected,
    'success'::TEXT                           AS sync_status,
    mc.token_last_validated_at::TIMESTAMPTZ   AS last_sync_at,
    mc.facebook_page_id::TEXT                 AS account_id
  FROM public.meta_connections mc
  -- Para conexões sem client_id, faz cross join com todos os clientes da org
  LEFT JOIN public.clients c
    ON mc.client_id IS NULL AND c.organization_id = p_organization_id
  WHERE mc.organization_id = p_organization_id
    AND mc.facebook_page_id IS NOT NULL
    AND mc.status = 'active'
    -- Para conexões com client_id, o cliente pertence à org (verificado via FK cascateada)
    AND (mc.client_id IS NOT NULL OR c.id IS NOT NULL)

  UNION ALL

  -- ── 3. meta_connections → Instagram ────────────────────────────────────────
  SELECT
    COALESCE(mc.client_id, c.id)::UUID        AS client_id,
    'instagram'::TEXT                         AS platform,
    TRUE::BOOLEAN                             AS is_connected,
    'success'::TEXT                           AS sync_status,
    mc.token_last_validated_at::TIMESTAMPTZ   AS last_sync_at,
    mc.instagram_account_id::TEXT             AS account_id
  FROM public.meta_connections mc
  LEFT JOIN public.clients c
    ON mc.client_id IS NULL AND c.organization_id = p_organization_id
  WHERE mc.organization_id = p_organization_id
    AND mc.instagram_account_id IS NOT NULL
    AND mc.status = 'active'
    AND (mc.client_id IS NOT NULL OR c.id IS NOT NULL)

  UNION ALL

  -- ── 4. meta_connections → WhatsApp ─────────────────────────────────────────
  SELECT
    COALESCE(mc.client_id, c.id)::UUID        AS client_id,
    'whatsapp'::TEXT                          AS platform,
    TRUE::BOOLEAN                             AS is_connected,
    'success'::TEXT                           AS sync_status,
    mc.token_last_validated_at::TIMESTAMPTZ   AS last_sync_at,
    mc.whatsapp_phone_number_id::TEXT         AS account_id
  FROM public.meta_connections mc
  LEFT JOIN public.clients c
    ON mc.client_id IS NULL AND c.organization_id = p_organization_id
  WHERE mc.organization_id = p_organization_id
    AND mc.whatsapp_phone_number_id IS NOT NULL
    AND mc.status = 'active'
    AND (mc.client_id IS NOT NULL OR c.id IS NOT NULL)

  UNION ALL

  -- ── 5. meta_connections → Meta Ads (ad_account_id) ─────────────────────────
  SELECT
    COALESCE(mc.client_id, c.id)::UUID        AS client_id,
    'meta_ads'::TEXT                          AS platform,
    TRUE::BOOLEAN                             AS is_connected,
    'success'::TEXT                           AS sync_status,
    mc.token_last_validated_at::TIMESTAMPTZ   AS last_sync_at,
    mc.ad_account_id::TEXT                    AS account_id
  FROM public.meta_connections mc
  LEFT JOIN public.clients c
    ON mc.client_id IS NULL AND c.organization_id = p_organization_id
  WHERE mc.organization_id = p_organization_id
    AND mc.ad_account_id IS NOT NULL
    AND mc.status = 'active'
    AND (mc.client_id IS NOT NULL OR c.id IS NOT NULL)

  UNION ALL

  -- ── 6. client_google_calendar_tokens → Google Agenda ───────────────────────
  SELECT
    gct.client_id::UUID,
    'google_calendar'::TEXT                   AS platform,
    TRUE::BOOLEAN                             AS is_connected,
    'success'::TEXT                           AS sync_status,
    gct.connected_at::TIMESTAMPTZ             AS last_sync_at,
    gct.calendar_id::TEXT                     AS account_id
  FROM public.client_google_calendar_tokens gct
  INNER JOIN public.clients c ON c.id = gct.client_id
  WHERE c.organization_id = p_organization_id
    AND gct.connected = TRUE
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.get_client_integrations_overview(UUID)
  TO authenticated, service_role;

-- ── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('116_integrations_overview_rpc')
ON CONFLICT (version) DO NOTHING;
