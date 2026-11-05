-- ── Migration 169: RPC get_or_create_unified_conversation ────────────────────
-- Busca ou cria uma conversa de forma unificada, roteando automaticamente para
-- client_channel_conversations (lado cliente) ou omni_conversations (lado
-- agência) com base em meta_connections.client_id.
--
-- Parâmetros:
--   p_connection_id  UUID     — ID da meta_connections
--   p_channel_type   TEXT     — 'whatsapp' | 'instagram' | 'facebook'
--   p_contact_id     UUID     — ID do contato (retornado por get_or_create_unified_contact)
--   p_bot_active     BOOLEAN  — define bot_active na criação (padrão true)
--
-- Retorno:
--   JSONB com conversation_id, status, assigned_agent_id, handoff_active,
--   created + campo 'side' = 'client' ou 'agency'
--
-- Banco A only. Sem impacto no Banco B.

CREATE OR REPLACE FUNCTION public.get_or_create_unified_conversation(
  p_connection_id UUID,
  p_channel_type  TEXT,
  p_contact_id    UUID,
  p_bot_active    BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id      UUID;
  v_org_id         UUID;
  -- Cliente
  v_channel_stored TEXT;
  v_conv_id        UUID;
  v_status         TEXT;
  v_assigned       UUID;
  v_created        BOOLEAN := false;
  -- Agência
  v_conv_result    JSONB;
BEGIN
  -- ── 1. Resolve meta_connection → client_id + organization_id ─────────────
  SELECT client_id, organization_id
    INTO v_client_id, v_org_id
  FROM public.meta_connections
  WHERE id = p_connection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection_not_found: %', p_connection_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- LADO CLIENTE (client_id IS NOT NULL)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_client_id IS NOT NULL THEN

    -- Normaliza canal para o formato armazenado em client_channel_conversations
    v_channel_stored := CASE p_channel_type
      WHEN 'instagram' THEN 'instagram_dm'
      WHEN 'facebook'  THEN 'facebook_dm'
      ELSE p_channel_type  -- 'whatsapp' já é igual
    END;

    -- Busca conversa ativa existente
    SELECT id, status, assigned_agent_id
      INTO v_conv_id, v_status, v_assigned
    FROM public.client_channel_conversations
    WHERE omni_contact_id = p_contact_id
      AND channel_type    = v_channel_stored
      AND client_id       = v_client_id
      AND status NOT IN ('resolved', 'closed')
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 1;

    -- Se não encontrou, cria nova conversa
    IF v_conv_id IS NULL THEN
      INSERT INTO public.client_channel_conversations (
        client_id,
        organization_id,
        channel_type,
        meta_connection_id,
        omni_contact_id,
        status,
        bot_active
      ) VALUES (
        v_client_id,
        v_org_id,
        v_channel_stored,
        p_connection_id,
        p_contact_id,
        'open',
        p_bot_active
      )
      RETURNING id, status, assigned_agent_id
        INTO v_conv_id, v_status, v_assigned;

      v_created := true;
    END IF;

    RETURN jsonb_build_object(
      'conversation_id',   v_conv_id,
      'status',            v_status,
      'assigned_agent_id', v_assigned,
      'handoff_active',    (v_status IN ('waiting_human', 'human_active') OR v_assigned IS NOT NULL),
      'created',           v_created,
      'side',              'client'
    );

  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- LADO AGÊNCIA (client_id IS NULL)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT public.get_or_create_agency_conversation(
    p_contact_id,
    p_channel_type,
    v_org_id,
    p_connection_id
  ) INTO v_conv_result;

  RETURN v_conv_result || '{"side":"agency"}'::jsonb;

END; $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_unified_conversation(UUID, TEXT, UUID, BOOLEAN)
  TO authenticated, anon, service_role;

-- ── Version marker ────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('169_get_or_create_unified_conversation')
ON CONFLICT (version) DO NOTHING;
