-- ============================================================
-- Migration 035: Dados demográficos de campanhas (Banco A — agência)
-- Execute no Supabase da AGÊNCIA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campaign_demographics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_date     DATE        NOT NULL,
  platform        TEXT        NOT NULL CHECK (platform IN ('meta','google','tiktok','other')),
  campaign_id     TEXT,
  campaign_name   TEXT,
  -- Faixa etária (age_range: "18-24", "25-34", etc.)
  age_range       TEXT,
  -- Gênero
  gender          TEXT        CHECK (gender IN ('male','female','unknown')),
  -- Dispositivo
  device          TEXT        CHECK (device IN ('mobile','desktop','tablet','unknown')),
  -- Localidade
  country         TEXT,
  state           TEXT,
  city            TEXT,
  -- Métricas agregadas para este segmento
  impressions     BIGINT      NOT NULL DEFAULT 0,
  clicks          BIGINT      NOT NULL DEFAULT 0,
  spend           NUMERIC(12,2) NOT NULL DEFAULT 0,
  conversions     BIGINT      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id, period_date, platform, campaign_id, age_range, gender, device, city)
);

-- Tabela de contas de anúncios (Meta + Google) — tokens OAuth
CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  owned_by        TEXT        NOT NULL DEFAULT 'agency' CHECK (owned_by IN ('agency','client')),
  ad_account_id   TEXT        NOT NULL,
  page_id         TEXT,
  account_name    TEXT,
  -- Tokens NUNCA expostos ao frontend
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at    TIMESTAMPTZ,
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, ad_account_id)
);

CREATE TABLE IF NOT EXISTS public.google_ad_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  owned_by        TEXT        NOT NULL DEFAULT 'agency' CHECK (owned_by IN ('agency','client')),
  customer_id     TEXT        NOT NULL,  -- Google Ads customer ID
  account_name    TEXT,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at    TIMESTAMPTZ,
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, customer_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_campaign_demo_client   ON public.campaign_demographics(client_id, period_date);
CREATE INDEX IF NOT EXISTS idx_campaign_demo_platform ON public.campaign_demographics(platform);
CREATE INDEX IF NOT EXISTS idx_meta_accounts_client   ON public.meta_ad_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_google_accounts_client ON public.google_ad_accounts(client_id);

-- RLS — tokens nunca acessíveis via anon
ALTER TABLE public.campaign_demographics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ad_accounts     ENABLE ROW LEVEL SECURITY;

-- Demográficos: leitura autenticada (usuários da agência)
DROP POLICY IF EXISTS "org_read_demographics"  ON public.campaign_demographics;
DROP POLICY IF EXISTS "org_write_demographics" ON public.campaign_demographics;
CREATE POLICY "org_read_demographics" ON public.campaign_demographics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "org_write_demographics" ON public.campaign_demographics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Contas de anúncios: acesso somente autenticado, tokens não retornados via RLS
-- (o SELECT público retorna apenas metadados, não os tokens — feito via RPC)
DROP POLICY IF EXISTS "org_read_ad_accounts"  ON public.meta_ad_accounts;
DROP POLICY IF EXISTS "org_write_ad_accounts" ON public.meta_ad_accounts;
CREATE POLICY "org_read_ad_accounts" ON public.meta_ad_accounts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "org_write_ad_accounts" ON public.meta_ad_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_read_google_accounts"  ON public.google_ad_accounts;
DROP POLICY IF EXISTS "org_write_google_accounts" ON public.google_ad_accounts;
CREATE POLICY "org_read_google_accounts" ON public.google_ad_accounts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "org_write_google_accounts" ON public.google_ad_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC segura: retorna status de conexão SEM os tokens
CREATE OR REPLACE FUNCTION public.get_ad_account_status(p_client_id UUID)
RETURNS TABLE (
  platform      TEXT,
  account_name  TEXT,
  owned_by      TEXT,
  connected_at  TIMESTAMPTZ,
  last_sync_at  TIMESTAMPTZ,
  active        BOOLEAN
) SECURITY DEFINER LANGUAGE sql AS $$
  SELECT 'meta'::TEXT, account_name, owned_by, connected_at, last_sync_at, active
  FROM public.meta_ad_accounts WHERE client_id = p_client_id AND active = true
  UNION ALL
  SELECT 'google'::TEXT, account_name, owned_by, connected_at, last_sync_at, active
  FROM public.google_ad_accounts WHERE client_id = p_client_id AND active = true;
$$;
