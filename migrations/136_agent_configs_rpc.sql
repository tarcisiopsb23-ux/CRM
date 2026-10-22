-- Migration 136: RPCs para leitura e gravação completa de agent_configs
-- Banco A (CRM) — usadas pela página ChatbotAgentePage no C8 Control

-- ── 1. get_agent_config_for_client ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_agent_config_for_client(p_client_id UUID)
RETURNS SETOF public.agent_configs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.agent_configs WHERE client_id = p_client_id LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_config_for_client(UUID) TO authenticated, anon, service_role;

-- ── 2. upsert_agent_config ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_agent_config(
  p_client_id UUID, p_organization_id UUID,
  p_agent_name TEXT, p_agent_role TEXT, p_agent_description TEXT,
  p_tone TEXT, p_formality INTEGER, p_use_emojis BOOLEAN,
  p_response_length TEXT, p_objective TEXT, p_instructions TEXT,
  p_behavior_use_knowledge BOOLEAN, p_behavior_collect_data BOOLEAN,
  p_behavior_update_crm BOOLEAN, p_behavior_create_deal BOOLEAN,
  p_behavior_handoff BOOLEAN,
  p_handoff_keywords TEXT[], p_handoff_after_mins INTEGER,
  p_respond_outside_hours BOOLEAN, p_outside_hours_message TEXT,
  p_handles_whatsapp BOOLEAN, p_handles_instagram BOOLEAN,
  p_handles_facebook BOOLEAN, p_handles_comments BOOLEAN,
  p_is_active BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.agent_configs(
    client_id, organization_id, agent_name, agent_role, agent_description,
    tone, formality, use_emojis, response_length, objective, instructions,
    behavior_use_knowledge, behavior_collect_data, behavior_update_crm,
    behavior_create_deal, behavior_handoff, handoff_keywords, handoff_after_mins,
    respond_outside_hours, outside_hours_message,
    handles_whatsapp, handles_instagram, handles_facebook, handles_comments,
    is_active
  ) VALUES (
    p_client_id, p_organization_id, p_agent_name, p_agent_role, p_agent_description,
    p_tone, p_formality, p_use_emojis, p_response_length, p_objective, p_instructions,
    p_behavior_use_knowledge, p_behavior_collect_data, p_behavior_update_crm,
    p_behavior_create_deal, p_behavior_handoff,
    COALESCE(p_handoff_keywords, '{}'), p_handoff_after_mins,
    p_respond_outside_hours, p_outside_hours_message,
    p_handles_whatsapp, p_handles_instagram, p_handles_facebook, p_handles_comments,
    p_is_active
  )
  ON CONFLICT (client_id) DO UPDATE SET
    agent_name = p_agent_name,
    agent_role = p_agent_role,
    agent_description = p_agent_description,
    tone = p_tone,
    formality = p_formality,
    use_emojis = p_use_emojis,
    response_length = p_response_length,
    objective = p_objective,
    instructions = p_instructions,
    behavior_use_knowledge = p_behavior_use_knowledge,
    behavior_collect_data = p_behavior_collect_data,
    behavior_update_crm = p_behavior_update_crm,
    behavior_create_deal = p_behavior_create_deal,
    behavior_handoff = p_behavior_handoff,
    handoff_keywords = COALESCE(p_handoff_keywords, '{}'),
    handoff_after_mins = p_handoff_after_mins,
    respond_outside_hours = p_respond_outside_hours,
    outside_hours_message = p_outside_hours_message,
    handles_whatsapp = p_handles_whatsapp,
    handles_instagram = p_handles_instagram,
    handles_facebook = p_handles_facebook,
    handles_comments = p_handles_comments,
    is_active = p_is_active,
    updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_agent_config(UUID,UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT[],INTEGER,BOOLEAN,TEXT,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN) TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('136_agent_configs_rpc')
ON CONFLICT (version) DO NOTHING;
