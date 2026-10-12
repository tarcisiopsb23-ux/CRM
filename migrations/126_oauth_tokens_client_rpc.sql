-- Migration 126: RPC para leitura de oauth_tokens pelo cliente C8 Control
-- O JWT do cliente não tem 'tenant_id' no payload, então a RLS bloqueia.
-- Esta RPC usa SECURITY DEFINER para contornar a RLS com service_role.

CREATE OR REPLACE FUNCTION public.get_oauth_tokens_for_client(
  p_client_id UUID
)
RETURNS TABLE (
  id                 UUID,
  tenant_id          UUID,
  provider           TEXT,
  expires_at         TIMESTAMPTZ,
  scope              TEXT,
  ga4_property_id    TEXT,
  gads_customer_id   TEXT,
  meta_ad_account_id TEXT,
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retorna tokens OAuth sem expor access_token/refresh_token
  RETURN QUERY
  SELECT
    ot.id,
    ot.tenant_id,
    ot.provider::TEXT,
    ot.expires_at,
    ot.scope,
    ot.ga4_property_id,
    ot.gads_customer_id,
    ot.meta_ad_account_id,
    ot.created_at,
    ot.updated_at
  FROM public.oauth_tokens ot
  WHERE ot.tenant_id = p_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_oauth_tokens_for_client(UUID) TO authenticated, anon, service_role;

-- Versão
INSERT INTO public.schema_migrations (version)
VALUES ('126_oauth_tokens_client_rpc')
ON CONFLICT (version) DO NOTHING;
