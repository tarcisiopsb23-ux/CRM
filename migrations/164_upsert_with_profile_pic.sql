-- Migration 164: Extend upsert RPCs with profile_pic_url, metadata_extra, and auto-merge hooks
-- Banco A only. No Banco B changes.
--
-- Changes:
--   • upsert_omni_contact_identity  — adds p_profile_pic_url, p_metadata_extra; calls auto_merge_instagram_contacts
--   • upsert_client_contact_identity — adds p_profile_pic_url, p_metadata_extra; calls auto_merge_instagram_client_contacts
--   • get_omni_contact_with_identities — refreshed to include profile_pic_url comment

-- ── 1. upsert_omni_contact_identity (7-param version) ────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_omni_contact_identity(
  p_organization_id  UUID,
  p_channel_type     TEXT,
  p_external_user_id TEXT,
  p_display_name     TEXT  DEFAULT NULL,
  p_username         TEXT  DEFAULT NULL,
  p_profile_pic_url  TEXT  DEFAULT NULL,
  p_metadata_extra   JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact_id   UUID;
  v_identity_id  UUID;
  v_display_name TEXT;
  v_username     TEXT;
BEGIN
  -- Normaliza channel_type (aceita subtipos legados por compatibilidade)
  p_channel_type := CASE
    WHEN p_channel_type IN ('instagram_dm', 'instagram_comment') THEN 'instagram'
    WHEN p_channel_type IN ('facebook_dm', 'facebook_comment')   THEN 'facebook'
    ELSE p_channel_type
  END;

  -- Verifica se já existe identidade
  SELECT contact_id INTO v_contact_id
  FROM public.omni_contact_identities
  WHERE organization_id  = p_organization_id
    AND channel_type     = p_channel_type
    AND external_user_id = p_external_user_id;

  IF v_contact_id IS NULL THEN
    -- Cria novo contato
    INSERT INTO public.omni_contacts (organization_id, display_name, phone)
    VALUES (
      p_organization_id,
      COALESCE(p_display_name, 'Contato'),
      CASE WHEN p_channel_type = 'whatsapp' THEN p_external_user_id ELSE NULL END
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_contact_id;

    -- Se houve conflito (phone já existia para whatsapp), busca o existente
    IF v_contact_id IS NULL AND p_channel_type = 'whatsapp' THEN
      SELECT id INTO v_contact_id
      FROM public.omni_contacts
      WHERE organization_id = p_organization_id
        AND phone = p_external_user_id;
    END IF;

    -- Último fallback: insere sem phone
    IF v_contact_id IS NULL THEN
      INSERT INTO public.omni_contacts (organization_id, display_name)
      VALUES (p_organization_id, COALESCE(p_display_name, 'Contato'))
      RETURNING id INTO v_contact_id;
    END IF;
  END IF;

  -- Upsert da identidade — retorna os valores realmente persistidos no banco
  INSERT INTO public.omni_contact_identities
    (organization_id, contact_id, channel_type, external_user_id, display_name, username)
  VALUES
    (p_organization_id, v_contact_id, p_channel_type, p_external_user_id,
     p_display_name, p_username)
  ON CONFLICT (organization_id, channel_type, external_user_id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, omni_contact_identities.display_name),
    username     = COALESCE(EXCLUDED.username, omni_contact_identities.username)
  RETURNING id, display_name, username INTO v_identity_id, v_display_name, v_username;

  -- Atualiza profile_pic_url (sempre substitui se fornecido)
  IF p_profile_pic_url IS NOT NULL THEN
    UPDATE public.omni_contacts
    SET profile_pic_url = p_profile_pic_url
    WHERE id = v_contact_id;
  END IF;

  -- Mescla metadata extra se fornecido
  IF p_metadata_extra IS NOT NULL THEN
    UPDATE public.omni_contacts
    SET metadata = metadata || p_metadata_extra
    WHERE id = v_contact_id;
  END IF;

  -- Auto-merge instagram se username disponível (migration 165 guard)
  IF p_channel_type = 'instagram' AND p_username IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = 'auto_merge_instagram_contacts'
        AND proargtypes::text LIKE '%uuid%'
    ) THEN
      PERFORM public.auto_merge_instagram_contacts(v_contact_id, p_organization_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'contact_id',   v_contact_id,
    'identity_id',  v_identity_id,
    'channel_type', p_channel_type,
    'display_name', v_display_name,
    'username',     v_username
  );
END; $$;

-- Grant new 7-param signature
GRANT EXECUTE ON FUNCTION public.upsert_omni_contact_identity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, anon, service_role;

-- Re-grant old 5-param signature so existing callers don't break
GRANT EXECUTE ON FUNCTION public.upsert_omni_contact_identity(UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, anon, service_role;

-- ── 2. upsert_client_contact_identity (8-param version) ──────────────────────

CREATE OR REPLACE FUNCTION public.upsert_client_contact_identity(
  p_client_id        UUID,
  p_organization_id  UUID,
  p_channel_type     TEXT,
  p_external_user_id TEXT,
  p_display_name     TEXT  DEFAULT NULL,
  p_username         TEXT  DEFAULT NULL,
  p_profile_pic_url  TEXT  DEFAULT NULL,
  p_metadata_extra   JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact_id  UUID;
  v_identity_id UUID;
  v_created     BOOLEAN := false;
  -- Normaliza qualquer variante para o valor canônico da plataforma
  v_channel     TEXT;
BEGIN
  v_channel := CASE
    WHEN p_channel_type IN ('instagram', 'instagram_dm', 'instagram_comment') THEN 'instagram'
    WHEN p_channel_type IN ('facebook',  'facebook_dm',  'facebook_comment')  THEN 'facebook'
    ELSE 'whatsapp'
  END;

  -- 1. Busca identidade existente para este cliente+canal+usuário externo
  SELECT contact_id INTO v_contact_id
  FROM public.client_contact_identities
  WHERE client_id        = p_client_id
    AND channel_type     = v_channel
    AND external_user_id = p_external_user_id;

  -- 2. Se não encontrou, cria novo contato
  IF v_contact_id IS NULL THEN
    INSERT INTO public.client_channel_contacts (
      client_id,
      organization_id,
      display_name,
      phone
    ) VALUES (
      p_client_id,
      p_organization_id,
      COALESCE(p_display_name, 'Contato'),
      CASE WHEN v_channel = 'whatsapp' THEN p_external_user_id ELSE NULL END
    )
    RETURNING id INTO v_contact_id;

    v_created := true;
  END IF;

  -- 3. Upsert da identidade de canal
  INSERT INTO public.client_contact_identities (
    client_id,
    organization_id,
    contact_id,
    channel_type,
    external_user_id,
    display_name,
    username
  ) VALUES (
    p_client_id,
    p_organization_id,
    v_contact_id,
    v_channel,
    p_external_user_id,
    p_display_name,
    p_username
  )
  ON CONFLICT (client_id, channel_type, external_user_id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, client_contact_identities.display_name),
    username     = COALESCE(EXCLUDED.username, client_contact_identities.username)
  RETURNING id INTO v_identity_id;

  -- Atualiza profile_pic_url (sempre substitui se fornecido)
  IF p_profile_pic_url IS NOT NULL THEN
    UPDATE public.client_channel_contacts
    SET profile_pic_url = p_profile_pic_url
    WHERE id = v_contact_id;
  END IF;

  -- Mescla metadata extra se fornecido
  IF p_metadata_extra IS NOT NULL THEN
    UPDATE public.client_channel_contacts
    SET metadata = metadata || p_metadata_extra
    WHERE id = v_contact_id;
  END IF;

  -- Auto-merge instagram se username disponível (migration 165 guard)
  IF v_channel = 'instagram' AND p_username IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = 'auto_merge_instagram_client_contacts'
    ) THEN
      PERFORM public.auto_merge_instagram_client_contacts(v_contact_id, p_client_id, p_organization_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'contact_id',   v_contact_id,
    'identity_id',  v_identity_id,
    'created',      v_created,
    'channel_type', v_channel,
    'username',     p_username,
    'display_name', COALESCE(p_display_name, 'Contato')
  );
END; $$;

-- Grant new 8-param signature
GRANT EXECUTE ON FUNCTION public.upsert_client_contact_identity(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, anon, service_role;

-- Re-grant old 6-param signature so existing callers don't break
GRANT EXECUTE ON FUNCTION public.upsert_client_contact_identity(UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, anon, service_role;

-- ── 3. get_omni_contact_with_identities (refreshed) ──────────────────────────

CREATE OR REPLACE FUNCTION public.get_omni_contact_with_identities(
  p_contact_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Returns full contact row including profile_pic_url (added in migration 162)
  SELECT jsonb_build_object(
    'contact',    row_to_json(c.*),
    'identities', COALESCE(
      (SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.created_at)
       FROM public.omni_contact_identities i
       WHERE i.contact_id = c.id),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM public.omni_contacts c
  WHERE c.id = p_contact_id
    AND c.organization_id = get_user_organization_id();

  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_omni_contact_with_identities(UUID)
  TO authenticated, anon, service_role;

-- ── Version marker ────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('164_upsert_with_profile_pic')
ON CONFLICT (version) DO NOTHING;
