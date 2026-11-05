-- ── Migration 168: RPC get_or_create_unified_contact ─────────────────────────
-- Cria ou recupera um contato de forma unificada, roteando automaticamente para
-- upsert_client_contact_identity (lado cliente) ou upsert_omni_contact_identity
-- (lado agência) com base em meta_connections.client_id.
--
-- Parâmetros:
--   p_connection_id    UUID  — ID da meta_connections
--   p_channel_type     TEXT  — 'whatsapp' | 'instagram' | 'facebook' etc.
--   p_external_user_id TEXT  — ID externo do usuário (número whatsapp, IG id, etc.)
--   p_display_name     TEXT  — nome para exibição (opcional)
--   p_username         TEXT  — @username (opcional, útil para instagram)
--   p_profile_pic_url  TEXT  — URL da foto de perfil (opcional)
--
-- Retorno:
--   JSONB com contact_id, identity_id, channel_type, display_name, username,
--   criado (se novo) + campo 'side' = 'client' ou 'agency'
--
-- Banco A only. Sem impacto no Banco B.

CREATE OR REPLACE FUNCTION public.get_or_create_unified_contact(
  p_connection_id    UUID,
  p_channel_type     TEXT,
  p_external_user_id TEXT,
  p_display_name     TEXT DEFAULT NULL,
  p_username         TEXT DEFAULT NULL,
  p_profile_pic_url  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_org_id    UUID;
  v_result    JSONB;
BEGIN
  -- ── 1. Resolve meta_connection → client_id + organization_id ─────────────
  SELECT client_id, organization_id
    INTO v_client_id, v_org_id
  FROM public.meta_connections
  WHERE id = p_connection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection_not_found: %', p_connection_id;
  END IF;

  -- ── 2. Lado cliente (client_id IS NOT NULL) ───────────────────────────────
  IF v_client_id IS NOT NULL THEN
    SELECT public.upsert_client_contact_identity(
      v_client_id,
      v_org_id,
      p_channel_type,
      p_external_user_id,
      p_display_name,
      p_username,
      p_profile_pic_url,
      NULL   -- p_metadata_extra
    ) INTO v_result;

    RETURN v_result || '{"side":"client"}'::jsonb;
  END IF;

  -- ── 3. Lado agência (client_id IS NULL) ───────────────────────────────────
  SELECT public.upsert_omni_contact_identity(
    v_org_id,
    p_channel_type,
    p_external_user_id,
    p_display_name,
    p_username,
    p_profile_pic_url,
    NULL   -- p_metadata_extra
  ) INTO v_result;

  RETURN v_result || '{"side":"agency"}'::jsonb;

END; $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_unified_contact(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, anon, service_role;

-- ── Version marker ────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('168_get_or_create_unified_contact')
ON CONFLICT (version) DO NOTHING;
