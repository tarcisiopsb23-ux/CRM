-- Migration 137: Overrides de personalidade por canal no agent_configs
-- Banco A (CRM) — cada cliente pode personalizar tom, formalidade, comprimento e instruções
-- para WhatsApp, Instagram e Facebook de forma independente.
-- Quando NULL, o campo geral (tone, formality, response_length, instructions) é usado como fallback.

-- WhatsApp overrides
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS whatsapp_tone TEXT
  CHECK (whatsapp_tone IS NULL OR whatsapp_tone IN ('amigavel','profissional','descontraido','tecnico'));
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS whatsapp_formality INTEGER
  CHECK (whatsapp_formality IS NULL OR whatsapp_formality BETWEEN 1 AND 5);
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS whatsapp_response_length TEXT
  CHECK (whatsapp_response_length IS NULL OR whatsapp_response_length IN ('curto','medio','longo'));
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS whatsapp_instructions TEXT;

-- Instagram overrides
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS instagram_tone TEXT
  CHECK (instagram_tone IS NULL OR instagram_tone IN ('amigavel','profissional','descontraido','tecnico'));
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS instagram_formality INTEGER
  CHECK (instagram_formality IS NULL OR instagram_formality BETWEEN 1 AND 5);
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS instagram_response_length TEXT
  CHECK (instagram_response_length IS NULL OR instagram_response_length IN ('curto','medio','longo'));
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS instagram_instructions TEXT;

-- Facebook overrides
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS facebook_tone TEXT
  CHECK (facebook_tone IS NULL OR facebook_tone IN ('amigavel','profissional','descontraido','tecnico'));
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS facebook_formality INTEGER
  CHECK (facebook_formality IS NULL OR facebook_formality BETWEEN 1 AND 5);
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS facebook_response_length TEXT
  CHECK (facebook_response_length IS NULL OR facebook_response_length IN ('curto','medio','longo'));
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS facebook_instructions TEXT;

-- RPC upsert_agent_config_v2: inclui os 12 campos de override por canal
CREATE OR REPLACE FUNCTION public.upsert_agent_config_v2(
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
  p_is_active BOOLEAN,
  -- Canal overrides
  p_whatsapp_tone TEXT DEFAULT NULL,
  p_whatsapp_formality INTEGER DEFAULT NULL,
  p_whatsapp_response_length TEXT DEFAULT NULL,
  p_whatsapp_instructions TEXT DEFAULT NULL,
  p_instagram_tone TEXT DEFAULT NULL,
  p_instagram_formality INTEGER DEFAULT NULL,
  p_instagram_response_length TEXT DEFAULT NULL,
  p_instagram_instructions TEXT DEFAULT NULL,
  p_facebook_tone TEXT DEFAULT NULL,
  p_facebook_formality INTEGER DEFAULT NULL,
  p_facebook_response_length TEXT DEFAULT NULL,
  p_facebook_instructions TEXT DEFAULT NULL
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
    is_active,
    whatsapp_tone, whatsapp_formality, whatsapp_response_length, whatsapp_instructions,
    instagram_tone, instagram_formality, instagram_response_length, instagram_instructions,
    facebook_tone, facebook_formality, facebook_response_length, facebook_instructions
  ) VALUES (
    p_client_id, p_organization_id, p_agent_name, p_agent_role, p_agent_description,
    p_tone, p_formality, p_use_emojis, p_response_length, p_objective, p_instructions,
    p_behavior_use_knowledge, p_behavior_collect_data, p_behavior_update_crm,
    p_behavior_create_deal, p_behavior_handoff,
    COALESCE(p_handoff_keywords, '{}'), p_handoff_after_mins,
    p_respond_outside_hours, p_outside_hours_message,
    p_handles_whatsapp, p_handles_instagram, p_handles_facebook, p_handles_comments,
    p_is_active,
    p_whatsapp_tone, p_whatsapp_formality, p_whatsapp_response_length, p_whatsapp_instructions,
    p_instagram_tone, p_instagram_formality, p_instagram_response_length, p_instagram_instructions,
    p_facebook_tone, p_facebook_formality, p_facebook_response_length, p_facebook_instructions
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
    whatsapp_tone = p_whatsapp_tone,
    whatsapp_formality = p_whatsapp_formality,
    whatsapp_response_length = p_whatsapp_response_length,
    whatsapp_instructions = p_whatsapp_instructions,
    instagram_tone = p_instagram_tone,
    instagram_formality = p_instagram_formality,
    instagram_response_length = p_instagram_response_length,
    instagram_instructions = p_instagram_instructions,
    facebook_tone = p_facebook_tone,
    facebook_formality = p_facebook_formality,
    facebook_response_length = p_facebook_response_length,
    facebook_instructions = p_facebook_instructions,
    updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_agent_config_v2(UUID,UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT[],INTEGER,BOOLEAN,TEXT,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT,INTEGER,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT) TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('137_agent_configs_channel_overrides')
ON CONFLICT (version) DO NOTHING;
