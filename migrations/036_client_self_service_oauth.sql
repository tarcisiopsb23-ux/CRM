-- ============================================================
-- Migration 036: OAuth self-service para clientes autônomos
-- Execute no Supabase da AGÊNCIA (Banco A)
-- Clientes sem vínculo de assessoria podem cadastrar suas
-- próprias credenciais OAuth de Meta Ads e Google Ads.
-- Os tokens são armazenados EXCLUSIVAMENTE no servidor,
-- nunca retornados ao frontend.
-- ============================================================

-- Adiciona campos de credenciais de app próprio do cliente
-- (para clientes que usam seu próprio Meta App / Google Project)
ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS app_id     TEXT,  -- Meta App ID do cliente
  ADD COLUMN IF NOT EXISTS app_secret TEXT;  -- Meta App Secret (criptografado na aplicação)

ALTER TABLE public.google_ad_accounts
  ADD COLUMN IF NOT EXISTS client_id_oauth  TEXT,  -- Google OAuth Client ID
  ADD COLUMN IF NOT EXISTS client_secret    TEXT;  -- Google OAuth Client Secret

-- RPC segura para salvar credenciais de Meta Ads (cliente autônomo)
-- Recebe apenas os campos públicos — tokens OAuth chegam após o fluxo OAuth via n8n
CREATE OR REPLACE FUNCTION public.upsert_meta_ad_account(
  p_client_id       UUID,
  p_organization_id UUID,
  p_ad_account_id   TEXT,
  p_account_name    TEXT DEFAULT NULL,
  p_app_id          TEXT DEFAULT NULL,
  p_owned_by        TEXT DEFAULT 'client'
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.meta_ad_accounts (
    client_id, organization_id, ad_account_id, account_name, app_id, owned_by, active
  )
  VALUES (
    p_client_id, p_organization_id, p_ad_account_id, p_account_name, p_app_id, p_owned_by, true
  )
  ON CONFLICT (client_id, ad_account_id) DO UPDATE SET
    account_name    = EXCLUDED.account_name,
    app_id          = EXCLUDED.app_id,
    owned_by        = EXCLUDED.owned_by,
    active          = true,
    updated_at      = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'success', true);
END;
$$;

-- RPC segura para salvar credenciais de Google Ads (cliente autônomo)
CREATE OR REPLACE FUNCTION public.upsert_google_ad_account(
  p_client_id       UUID,
  p_organization_id UUID,
  p_customer_id     TEXT,
  p_account_name    TEXT DEFAULT NULL,
  p_client_id_oauth TEXT DEFAULT NULL,
  p_owned_by        TEXT DEFAULT 'client'
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.google_ad_accounts (
    client_id, organization_id, customer_id, account_name, client_id_oauth, owned_by, active
  )
  VALUES (
    p_client_id, p_organization_id, p_customer_id, p_account_name, p_client_id_oauth, p_owned_by, true
  )
  ON CONFLICT (client_id, customer_id) DO UPDATE SET
    account_name    = EXCLUDED.account_name,
    client_id_oauth = EXCLUDED.client_id_oauth,
    owned_by        = EXCLUDED.owned_by,
    active          = true,
    updated_at      = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'success', true);
END;
$$;

-- RPC para desconectar conta (limpa tokens, mantém registro)
CREATE OR REPLACE FUNCTION public.disconnect_ad_account(
  p_client_id UUID,
  p_platform  TEXT  -- 'meta' ou 'google'
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
  IF p_platform = 'meta' THEN
    UPDATE public.meta_ad_accounts
    SET active = false, access_token = null, refresh_token = null, updated_at = now()
    WHERE client_id = p_client_id;
  ELSIF p_platform = 'google' THEN
    UPDATE public.google_ad_accounts
    SET active = false, access_token = null, refresh_token = null, updated_at = now()
    WHERE client_id = p_client_id;
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
