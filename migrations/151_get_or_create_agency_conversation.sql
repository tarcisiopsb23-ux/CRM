-- ── Migration 151: RPC get_or_create_agency_conversation ─────────────────────
-- Busca conversa ativa (não resolvida/fechada) para um contato+canal na agência.
-- Se não existir, cria uma nova automaticamente.
-- Tabela alvo: omni_conversations (agência — sem client_id obrigatório).
-- Retorna JSONB com dados da conversa + flag 'created'.

-- Remove sobrecargas anteriores (versão com p_bot_active que não existe na tabela)
DROP FUNCTION IF EXISTS public.get_or_create_agency_conversation(UUID, TEXT, UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.get_or_create_agency_conversation(UUID, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_or_create_agency_conversation(
  p_omni_contact_id    UUID,
  p_channel_type       TEXT,           -- 'instagram', 'facebook', 'whatsapp'
  p_organization_id    UUID,
  p_meta_connection_id UUID  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conv_id        UUID;
  v_status         omni_conv_status;
  v_assigned       UUID;
  v_display_name   TEXT;
  v_username       TEXT;
  v_created        BOOLEAN := false;
  -- omni_conversations ainda usa os valores granulares no channel_type
  v_channel_stored TEXT;
BEGIN
  -- Mapeia canal canônico → valor armazenado na tabela
  v_channel_stored := CASE p_channel_type
    WHEN 'instagram' THEN 'instagram_dm'
    WHEN 'facebook'  THEN 'facebook_dm'
    ELSE p_channel_type  -- 'whatsapp' já é igual
  END;

  -- 1. Busca conversa ativa existente
  SELECT id, omni_status, assigned_agent_id
    INTO v_conv_id, v_status, v_assigned
  FROM public.omni_conversations
  WHERE omni_contact_id  = p_omni_contact_id
    AND channel_type     = v_channel_stored::omni_channel_type
    AND organization_id  = p_organization_id
    AND omni_status NOT IN ('resolved'::omni_conv_status, 'closed'::omni_conv_status)
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT 1;

  -- 2. Se não encontrou, cria nova conversa
  IF v_conv_id IS NULL THEN
    INSERT INTO public.omni_conversations (
      organization_id,
      omni_contact_id,
      channel_type,
      meta_connection_id,
      omni_status
    ) VALUES (
      p_organization_id,
      p_omni_contact_id,
      v_channel_stored::omni_channel_type,
      p_meta_connection_id,
      'open'::omni_conv_status
    )
    RETURNING id, omni_status, assigned_agent_id
      INTO v_conv_id, v_status, v_assigned;

    v_created := true;
  END IF;

  -- 3. Busca display_name e username da identidade do contato
  SELECT display_name, username
    INTO v_display_name, v_username
  FROM public.omni_contact_identities
  WHERE contact_id     = p_omni_contact_id
    AND channel_type   = p_channel_type
    AND organization_id = p_organization_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'conversation_id',   v_conv_id,
    'status',            v_status,
    'assigned_agent_id', v_assigned,
    'channel_type',      p_channel_type,
    'display_name',      v_display_name,
    'username',          v_username,
    'bot_active',        v_status IN ('open'::omni_conv_status, 'bot_active'::omni_conv_status),
    'created',           v_created
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_agency_conversation(UUID, TEXT, UUID, UUID)
  TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('bank_b_full_schema_v151_agency_conv')
ON CONFLICT (version) DO NOTHING;
