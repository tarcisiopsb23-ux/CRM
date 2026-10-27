-- ── Migration 149: Simplifica channel_type em omni_contact_identities ─────────
-- O contato é identificado pelo canal (instagram/facebook/whatsapp), não pelo
-- tipo de interação (dm/comment). O external_user_id é o mesmo para todos os
-- subtipos do canal.

-- 1. Remove o CHECK constraint antigo e adiciona o novo simplificado
ALTER TABLE public.omni_contact_identities
  DROP CONSTRAINT IF EXISTS omni_contact_identities_channel_type_check;

ALTER TABLE public.omni_contact_identities
  ADD CONSTRAINT omni_contact_identities_channel_type_check
  CHECK (channel_type IN ('whatsapp', 'instagram', 'facebook'));

-- 2. Migra dados existentes (subtypes → canonical)
UPDATE public.omni_contact_identities
  SET channel_type = 'instagram'
  WHERE channel_type IN ('instagram_dm', 'instagram_comment');

UPDATE public.omni_contact_identities
  SET channel_type = 'facebook'
  WHERE channel_type IN ('facebook_dm', 'facebook_comment');

-- 3. Atualiza a função upsert para refletir os novos valores canônicos
--    Retorna JSONB para compatibilidade com o n8n (evita erro de parse de UUID scalar)
--    DROP necessário pois o tipo de retorno muda de UUID para JSONB
DROP FUNCTION IF EXISTS public.upsert_omni_contact_identity(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.upsert_omni_contact_identity(
  p_organization_id  UUID,
  p_channel_type     TEXT,
  p_external_user_id TEXT,
  p_display_name     TEXT DEFAULT NULL,
  p_username         TEXT DEFAULT NULL
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

  RETURN jsonb_build_object(
    'contact_id',   v_contact_id,
    'identity_id',  v_identity_id,
    'channel_type', p_channel_type,
    'display_name', v_display_name,
    'username',     v_username
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_omni_contact_identity(UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('bank_b_full_schema_v149_channel_simplify')
ON CONFLICT (version) DO NOTHING;
