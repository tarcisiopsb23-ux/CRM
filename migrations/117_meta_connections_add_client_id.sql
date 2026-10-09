-- =============================================================================
-- Migration 117: Adiciona client_id à tabela meta_connections
--
-- Isola conexões Meta por cliente. Conexões sem client_id (NULL) continuam
-- válidas como conexões da organização inteira (comportamento legado).
-- Execute no Supabase da AGÊNCIA (Banco A)
-- =============================================================================

ALTER TABLE public.meta_connections
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- Índice para queries por cliente
CREATE INDEX IF NOT EXISTS idx_meta_connections_client_id
  ON public.meta_connections (client_id)
  WHERE client_id IS NOT NULL;

-- Índice composto para queries por organização + cliente
CREATE INDEX IF NOT EXISTS idx_meta_connections_org_client
  ON public.meta_connections (organization_id, client_id);

COMMENT ON COLUMN public.meta_connections.client_id IS
  'Isolamento por cliente do C8 Control. NULL = conexão da organização inteira (legado). '
  'Quando preenchido, a conexão pertence exclusivamente a este cliente.';

-- Atualiza a view segura para expor client_id
-- DROP + CREATE necessário pois não é possível inserir coluna no meio de uma view existente
DROP VIEW IF EXISTS public.meta_connections_safe;

CREATE VIEW public.meta_connections_safe
WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  client_id,
  created_by,
  use_agency_token,
  provider,
  connection_method,
  connection_environment,
  status,
  display_name,
  meta_user_id,
  business_id,
  facebook_page_id,
  facebook_page_name,
  instagram_account_id,
  instagram_username,
  waba_id,
  whatsapp_phone_number_id,
  whatsapp_display_phone_number,
  ad_account_id,
  catalog_id,
  -- Token nunca exposto — só indica se existe (token próprio ou da agência)
  (access_token_encrypted IS NOT NULL OR use_agency_token = TRUE) AS token_is_set,
  CASE
    WHEN access_token_encrypted IS NOT NULL
    THEN left(access_token_encrypted, 4) || '••••••••••••••••••••' || right(access_token_encrypted, 3)
    ELSE NULL
  END AS token_preview,
  token_type,
  token_expires_at,
  token_last_validated_at,
  last_sync_at,
  last_error,
  health_status,
  health_details,
  last_health_check_at,
  previous_connection_method,
  migration_at,
  migration_by,
  oauth_token_id,
  created_at,
  updated_at
FROM public.meta_connections;

GRANT SELECT ON public.meta_connections_safe TO authenticated;

-- ── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('117_meta_connections_add_client_id')
ON CONFLICT (version) DO NOTHING;
