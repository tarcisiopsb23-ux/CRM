-- =============================================================================
-- Migration 132: RPCs para configuração de canais do agente e auto-registro
-- =============================================================================

-- RPC para ler configuração de canais do agente
CREATE OR REPLACE FUNCTION public.get_agent_channel_config(p_client_id UUID)
RETURNS TABLE(
  handles_whatsapp BOOLEAN,
  handles_instagram BOOLEAN,
  handles_facebook BOOLEAN,
  handles_comments BOOLEAN,
  is_active BOOLEAN,
  auto_assign BOOLEAN,
  rule_type TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(ac.handles_whatsapp, true),
    COALESCE(ac.handles_instagram, true),
    COALESCE(ac.handles_facebook, true),
    COALESCE(ac.handles_comments, false),
    COALESCE(ac.is_active, true),
    COALESCE(qr.auto_assign, false),
    COALESCE(qr.rule_type::TEXT, 'round_robin')
  FROM (SELECT p_client_id AS cid) base
  LEFT JOIN public.agent_configs ac ON ac.client_id = base.cid
  LEFT JOIN public.client_queue_rules qr ON qr.client_id = base.cid
    AND qr.is_active = true;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_channel_config(UUID) TO authenticated, anon, service_role;

-- RPC para salvar configuração de canais
CREATE OR REPLACE FUNCTION public.upsert_agent_channel_config(
  p_client_id UUID,
  p_organization_id UUID,
  p_handles_whatsapp BOOLEAN,
  p_handles_instagram BOOLEAN,
  p_handles_facebook BOOLEAN,
  p_auto_assign BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qr_id UUID;
BEGIN
  -- Upsert agent_configs (tem UNIQUE client_id)
  INSERT INTO public.agent_configs(client_id, organization_id, handles_whatsapp, handles_instagram, handles_facebook, is_active)
  VALUES(p_client_id, p_organization_id, p_handles_whatsapp, p_handles_instagram, p_handles_facebook, true)
  ON CONFLICT (client_id) DO UPDATE SET
    handles_whatsapp = p_handles_whatsapp,
    handles_instagram = p_handles_instagram,
    handles_facebook = p_handles_facebook,
    updated_at = now();

  -- client_queue_rules não tem UNIQUE(client_id), usar UPDATE + INSERT condicional
  SELECT id INTO v_qr_id
  FROM public.client_queue_rules
  WHERE client_id = p_client_id AND is_active = true
  LIMIT 1;

  IF v_qr_id IS NOT NULL THEN
    UPDATE public.client_queue_rules
    SET auto_assign = p_auto_assign, updated_at = now()
    WHERE id = v_qr_id;
  ELSE
    INSERT INTO public.client_queue_rules(client_id, organization_id, auto_assign, rule_type)
    VALUES(p_client_id, p_organization_id, p_auto_assign, 'round_robin');
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_agent_channel_config(UUID,UUID,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN) TO authenticated, anon, service_role;

-- RPC para auto-registrar atendente (criar se não existir)
CREATE OR REPLACE FUNCTION public.ensure_client_agent(
  p_client_id UUID,
  p_organization_id UUID,
  p_crm_user_id UUID,
  p_display_name TEXT,
  p_avatar_url TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.client_agents(client_id, organization_id, crm_user_id, display_name, avatar_url, is_active)
  VALUES(p_client_id, p_organization_id, p_crm_user_id, p_display_name, p_avatar_url, true)
  ON CONFLICT (client_id, crm_user_id) DO UPDATE SET
    display_name = p_display_name,
    avatar_url = p_avatar_url,
    is_active = true
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_client_agent(UUID,UUID,UUID,TEXT,TEXT) TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('132_agent_channel_config_rpcs')
ON CONFLICT (version) DO NOTHING;
