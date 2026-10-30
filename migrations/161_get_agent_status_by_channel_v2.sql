-- Migration 161: Atualiza get_agent_status_by_channel para distinguir agência/cliente
--
-- Adiciona:
--   • Campo "side": 'client' ou 'agency' no retorno
--   • Busca configs em agent_configs quando for cliente (client_id IS NOT NULL)
--   • Retorna defaults para agência (não tem tabela de configs própria)
--   • Campo "organization_id" explícito no retorno (era "org_id")
--   • Mantém "org_id" para compatibilidade com fluxos existentes

CREATE OR REPLACE FUNCTION public.get_agent_status_by_channel(
  p_channel_type TEXT,
  p_channel_id   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID;
  v_org_id    UUID;
  v_conn_id   UUID;
  v_side      TEXT;
BEGIN
  -- Resolve client_id/org_id pela conexão Meta ativa
  CASE p_channel_type
    WHEN 'whatsapp' THEN
      SELECT c.id, mc.organization_id, mc.id
      INTO v_client_id, v_org_id, v_conn_id
      FROM public.meta_connections mc
      LEFT JOIN public.clients c ON c.id = mc.client_id
      WHERE mc.whatsapp_phone_number_id = p_channel_id
        AND mc.status = 'active'
      LIMIT 1;

    WHEN 'instagram' THEN
      SELECT c.id, mc.organization_id, mc.id
      INTO v_client_id, v_org_id, v_conn_id
      FROM public.meta_connections mc
      LEFT JOIN public.clients c ON c.id = mc.client_id
      WHERE mc.instagram_account_id = p_channel_id
        AND mc.status = 'active'
      LIMIT 1;

    WHEN 'facebook' THEN
      SELECT c.id, mc.organization_id, mc.id
      INTO v_client_id, v_org_id, v_conn_id
      FROM public.meta_connections mc
      LEFT JOIN public.clients c ON c.id = mc.client_id
      WHERE mc.facebook_page_id = p_channel_id
        AND mc.status = 'active'
      LIMIT 1;

    ELSE
      RETURN jsonb_build_object(
        'error', 'invalid_channel_type',
        'channel_type', p_channel_type
      );
  END CASE;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'error',        'connection_not_found',
      'channel_type', p_channel_type,
      'channel_id',   p_channel_id
    );
  END IF;

  -- Determina o lado
  v_side := CASE WHEN v_client_id IS NOT NULL THEN 'client' ELSE 'agency' END;

  -- Retorna dados com configs do agente
  IF v_side = 'client' THEN
    -- Lado cliente: busca configs em agent_configs
    RETURN (
      SELECT jsonb_build_object(
        'client_id',                  v_client_id,
        'org_id',                     v_org_id,
        'organization_id',            v_org_id,
        'connection_id',              v_conn_id,
        'channel_type',               p_channel_type,
        'side',                       'client',
        'bot_active',                 COALESCE(ac.is_active, true),
        'auto_assign',                COALESCE(ac.auto_assign, false),
        'fallback_assign_after_mins', COALESCE(ac.fallback_assign_after_mins, 2),
        'handles_whatsapp',           COALESCE(ac.handles_whatsapp, true),
        'handles_instagram',          COALESCE(ac.handles_instagram, true),
        'handles_facebook',           COALESCE(ac.handles_facebook, true),
        'handles_comments',           COALESCE(ac.handles_comments, false),
        'agent_name',                 COALESCE(ac.agent_name, 'Assistente'),
        'agent_role',                 COALESCE(ac.agent_role, 'Atendimento ao cliente'),
        'tone',                       COALESCE(ac.tone, 'amigavel'),
        'use_emojis',                 COALESCE(ac.use_emojis, false),
        'objective',                  COALESCE(ac.objective, 'atendimento'),
        'instructions',               ac.instructions,
        'behavior_handoff',           COALESCE(ac.behavior_handoff, true),
        'handoff_keywords',           COALESCE(ac.handoff_keywords, '{}')
      )
      FROM (SELECT v_client_id AS cid) base
      LEFT JOIN public.agent_configs ac ON ac.client_id = base.cid
      LIMIT 1
    );
  ELSE
    -- Lado agência: sem tabela de configs — retorna defaults
    RETURN jsonb_build_object(
      'client_id',                  NULL,
      'org_id',                     v_org_id,
      'organization_id',            v_org_id,
      'connection_id',              v_conn_id,
      'channel_type',               p_channel_type,
      'side',                       'agency',
      'bot_active',                 true,
      'auto_assign',                false,
      'fallback_assign_after_mins', 2,
      'handles_whatsapp',           true,
      'handles_instagram',          true,
      'handles_facebook',           true,
      'handles_comments',           false,
      'agent_name',                 'Assistente',
      'agent_role',                 'Atendimento ao cliente',
      'tone',                       'amigavel',
      'use_emojis',                 false,
      'objective',                  'atendimento',
      'instructions',               NULL,
      'behavior_handoff',           true,
      'handoff_keywords',           '[]'::jsonb
    );
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_agent_status_by_channel(TEXT, TEXT)
  TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('161_get_agent_status_by_channel_v2')
ON CONFLICT (version) DO NOTHING;
