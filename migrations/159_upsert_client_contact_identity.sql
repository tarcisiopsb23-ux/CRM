-- Migration 159: RPC upsert_client_contact_identity
-- Equivalente ao upsert_omni_contact_identity (migration 141) mas para o lado cliente.
-- Grava em client_channel_contacts + client_contact_identities.
-- Usada pelo N8N ao processar comentários/mensagens de clientes C8 Control.
-- O channel_type do contato é sempre o canônico da plataforma: instagram, facebook ou whatsapp.
-- O tipo de interação (dm vs comment) pertence à conversa, não ao contato.

-- Expande o CHECK constraint de client_contact_identities para aceitar valores canônicos
ALTER TABLE public.client_contact_identities
  DROP CONSTRAINT IF EXISTS client_contact_identities_channel_type_check;

ALTER TABLE public.client_contact_identities
  ADD CONSTRAINT client_contact_identities_channel_type_check
  CHECK (channel_type IN (
    'whatsapp',
    'instagram', 'instagram_dm', 'instagram_comment',
    'facebook',  'facebook_dm',  'facebook_comment'
  ));

CREATE OR REPLACE FUNCTION public.upsert_client_contact_identity(
  p_client_id        UUID,
  p_organization_id  UUID,
  p_channel_type     TEXT,           -- 'instagram', 'facebook' ou 'whatsapp' (canônico da plataforma)
  p_external_user_id TEXT,           -- phone (WA), ig_user_id, psid (FB)
  p_display_name     TEXT DEFAULT NULL,
  p_username         TEXT DEFAULT NULL
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

  RETURN jsonb_build_object(
    'contact_id',   v_contact_id,
    'identity_id',  v_identity_id,
    'created',      v_created,
    'channel_type', v_channel,
    'username',     p_username,
    'display_name', COALESCE(p_display_name, 'Contato')
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_client_contact_identity(UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('159_upsert_client_contact_identity')
ON CONFLICT (version) DO NOTHING;