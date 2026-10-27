-- ── Migration 150: RPC get_or_create_omni_conversation ───────────────────────
-- Busca conversa ativa (não resolvida/fechada) para um contato+canal.
-- Se não existir, cria uma nova automaticamente.
-- Retorna JSONB com os dados da conversa + indicação se foi criada agora.

CREATE OR REPLACE FUNCTION public.get_or_create_omni_conversation(
  p_omni_contact_id  UUID,
  p_channel_type     TEXT,           -- 'instagram', 'facebook', 'whatsapp'
  p_client_id        UUID,
  p_organization_id  UUID,
  p_meta_connection_id UUID DEFAULT NULL,
  p_external_account_id TEXT DEFAULT NULL,
  p_bot_active       BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conv_id          UUID;
  v_status           TEXT;
  v_assigned_agent   UUID;
  v_created          BOOLEAN := false;
  -- Normaliza channel_type para o formato legado que a tabela ainda usa
  v_channel_stored   TEXT;
BEGIN
  -- Mapeia canal canônico para o valor que está no CHECK constraint da tabela
  -- (client_channel_conversations ainda usa 'instagram_dm' etc.)
  v_channel_stored := CASE p_channel_type
    WHEN 'instagram' THEN 'instagram_dm'
    WHEN 'facebook'  THEN 'facebook_dm'
    ELSE p_channel_type  -- 'whatsapp' já é igual
  END;

  -- 1. Busca conversa ativa existente para este contato+canal
  SELECT id, status, assigned_agent_id
    INTO v_conv_id, v_status, v_assigned_agent
  FROM public.client_channel_conversations
  WHERE omni_contact_id = p_omni_contact_id
    AND channel_type    = v_channel_stored
    AND client_id       = p_client_id
    AND status NOT IN ('resolved', 'closed')
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT 1;

  -- 2. Se não encontrou, cria nova conversa
  IF v_conv_id IS NULL THEN
    INSERT INTO public.client_channel_conversations (
      client_id,
      organization_id,
      channel_type,
      meta_connection_id,
      external_account_id,
      omni_contact_id,
      status,
      bot_active
    ) VALUES (
      p_client_id,
      p_organization_id,
      v_channel_stored,
      p_meta_connection_id,
      p_external_account_id,
      p_omni_contact_id,
      'open',
      p_bot_active
    )
    RETURNING id, status, assigned_agent_id
      INTO v_conv_id, v_status, v_assigned_agent;

    v_created := true;
  END IF;

  RETURN jsonb_build_object(
    'conversation_id',   v_conv_id,
    'status',            v_status,
    'assigned_agent_id', v_assigned_agent,
    'channel_type',      p_channel_type,   -- retorna o valor canônico (instagram, não instagram_dm)
    'created',           v_created
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_omni_conversation(UUID, TEXT, UUID, UUID, UUID, TEXT, BOOLEAN)
  TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('bank_b_full_schema_v150_get_or_create_conv')
ON CONFLICT (version) DO NOTHING;
