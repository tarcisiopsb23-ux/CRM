-- Migration 146: RPCs separadas para controle e comportamento do agente
--
-- get_agent_status  → verificação rápida (bot ativo? auto_assign?)
-- get_agent_behavior → system prompt completo (comportamento + contato + avisos)
-- get_agent_knowledge_faqs/services/policies → tools do AI Agent (sob demanda)

-- ── get_agent_status ──────────────────────────────────────────────────────────
-- Chamada logo após receber a mensagem — decide o branch (bot/humano/fallback)

CREATE OR REPLACE FUNCTION public.get_agent_status(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v RECORD;
BEGIN
  SELECT
    COALESCE(ac.is_active, true)                    AS bot_active,
    COALESCE(ac.auto_assign, false)                 AS auto_assign,
    COALESCE(ac.fallback_assign_after_mins, 2)      AS fallback_assign_after_mins,
    COALESCE(ac.handles_whatsapp, true)             AS handles_whatsapp,
    COALESCE(ac.handles_instagram, true)            AS handles_instagram,
    COALESCE(ac.handles_facebook, true)             AS handles_facebook
  INTO v
  FROM public.agent_configs ac
  WHERE ac.client_id = p_client_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'bot_active', true, 'auto_assign', false,
      'fallback_assign_after_mins', 2,
      'handles_whatsapp', true, 'handles_instagram', true, 'handles_facebook', true
    );
  END IF;

  RETURN jsonb_build_object(
    'bot_active',                v.bot_active,
    'auto_assign',               v.auto_assign,
    'fallback_assign_after_mins', v.fallback_assign_after_mins,
    'handles_whatsapp',          v.handles_whatsapp,
    'handles_instagram',         v.handles_instagram,
    'handles_facebook',          v.handles_facebook
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_status(UUID) TO authenticated, anon, service_role;

-- ── get_agent_behavior ────────────────────────────────────────────────────────
-- Retorna tudo que vai no System Prompt: identidade + comportamento + contato + avisos
-- NÃO inclui FAQs, serviços ou políticas — esses são tools do AI Agent

CREATE OR REPLACE FUNCTION public.get_agent_behavior(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent   RECORD;
  v_contact RECORD;
  v_notices JSONB;
BEGIN
  -- Comportamento do agente (agent_configs)
  SELECT
    COALESCE(ac.agent_name, 'Assistente')           AS agent_name,
    COALESCE(ac.agent_role, 'Atendimento')          AS agent_role,
    ac.agent_description,
    COALESCE(ac.tone, 'amigavel')                   AS tone,
    COALESCE(ac.formality, 3)                       AS formality,
    COALESCE(ac.use_emojis, false)                  AS use_emojis,
    COALESCE(ac.response_length, 'medio')           AS response_length,
    ac.objective,
    ac.instructions,
    COALESCE(ac.behavior_handoff, true)             AS behavior_handoff,
    COALESCE(ac.handoff_keywords, '{}')             AS handoff_keywords,
    COALESCE(ac.handoff_after_mins, 30)             AS handoff_after_mins,
    COALESCE(ac.respond_outside_hours, false)       AS respond_outside_hours,
    ac.outside_hours_message,
    ac.human_hours_start,
    ac.human_hours_end,
    COALESCE(ac.human_days, ARRAY['seg','ter','qua','qui','sex']) AS human_days,
    -- overrides por canal
    ac.whatsapp_tone, ac.whatsapp_formality, ac.whatsapp_response_length, ac.whatsapp_instructions,
    ac.instagram_tone, ac.instagram_formality, ac.instagram_response_length, ac.instagram_instructions,
    ac.facebook_tone, ac.facebook_formality, ac.facebook_response_length, ac.facebook_instructions
  INTO v_agent
  FROM public.agent_configs ac
  WHERE ac.client_id = p_client_id
  LIMIT 1;

  -- Contato e dados do estabelecimento (client_ai_settings)
  SELECT
    phone, whatsapp, instagram, address,
    opening_hours, google_business_url, establishment_name
  INTO v_contact
  FROM public.client_ai_settings
  WHERE client_id = p_client_id
  LIMIT 1;

  -- Avisos ativos (client_ai_notices) — poucos, sempre relevantes
  SELECT jsonb_agg(
    jsonb_build_object('message', message, 'priority', priority)
    ORDER BY
      CASE priority WHEN 'alta' THEN 1 WHEN 'média' THEN 2 ELSE 3 END
  )
  INTO v_notices
  FROM public.client_ai_notices
  WHERE client_id = p_client_id AND status = 'active';

  RETURN jsonb_build_object(
    -- Identidade
    'agent_name',         COALESCE(v_agent.agent_name, 'Assistente'),
    'agent_role',         COALESCE(v_agent.agent_role, 'Atendimento'),
    'agent_description',  v_agent.agent_description,
    -- Personalidade
    'tone',               COALESCE(v_agent.tone, 'amigavel'),
    'formality',          COALESCE(v_agent.formality, 3),
    'use_emojis',         COALESCE(v_agent.use_emojis, false),
    'response_length',    COALESCE(v_agent.response_length, 'medio'),
    -- Objetivo e instruções
    'objective',          v_agent.objective,
    'instructions',       v_agent.instructions,
    -- Handoff
    'behavior_handoff',   COALESCE(v_agent.behavior_handoff, true),
    'handoff_keywords',   COALESCE(v_agent.handoff_keywords, '{}'),
    'handoff_after_mins', COALESCE(v_agent.handoff_after_mins, 30),
    -- Horário de atendimento
    'respond_outside_hours', COALESCE(v_agent.respond_outside_hours, false),
    'outside_hours_message', v_agent.outside_hours_message,
    'human_hours_start',  v_agent.human_hours_start,
    'human_hours_end',    v_agent.human_hours_end,
    'human_days',         COALESCE(v_agent.human_days, ARRAY['seg','ter','qua','qui','sex']),
    -- Overrides por canal
    'channel_overrides', jsonb_build_object(
      'whatsapp',  jsonb_build_object('tone', v_agent.whatsapp_tone, 'formality', v_agent.whatsapp_formality, 'response_length', v_agent.whatsapp_response_length, 'instructions', v_agent.whatsapp_instructions),
      'instagram', jsonb_build_object('tone', v_agent.instagram_tone, 'formality', v_agent.instagram_formality, 'response_length', v_agent.instagram_response_length, 'instructions', v_agent.instagram_instructions),
      'facebook',  jsonb_build_object('tone', v_agent.facebook_tone, 'formality', v_agent.facebook_formality, 'response_length', v_agent.facebook_response_length, 'instructions', v_agent.facebook_instructions)
    ),
    -- Contato e estabelecimento
    'contact', jsonb_build_object(
      'establishment_name', v_contact.establishment_name,
      'phone',              v_contact.phone,
      'whatsapp',           v_contact.whatsapp,
      'instagram',          v_contact.instagram,
      'address',            v_contact.address,
      'opening_hours',      v_contact.opening_hours,
      'google_business_url', v_contact.google_business_url
    ),
    -- Avisos ativos
    'notices', COALESCE(v_notices, '[]'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_behavior(UUID) TO authenticated, anon, service_role;

-- ── Tools do AI Agent (queries simples, chamadas sob demanda pelo LLM) ────────

-- Tool: buscar FAQs ativos do cliente
CREATE OR REPLACE FUNCTION public.get_agent_knowledge_faqs(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_faqs JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object('question', question, 'answer', answer, 'category', category)
    ORDER BY priority DESC, created_at
  )
  INTO v_faqs
  FROM public.client_knowledge_faqs
  WHERE client_id = p_client_id AND active = true;
  RETURN COALESCE(v_faqs, '[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_knowledge_faqs(UUID) TO authenticated, anon, service_role;

-- Tool: buscar serviços ativos do cliente
CREATE OR REPLACE FUNCTION public.get_agent_knowledge_services(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_services JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object('name', name, 'description', description, 'price_info', price_info, 'duration_info', duration_info, 'category', category)
    ORDER BY name
  )
  INTO v_services
  FROM public.client_knowledge_services
  WHERE client_id = p_client_id AND active = true;
  RETURN COALESCE(v_services, '[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_knowledge_services(UUID) TO authenticated, anon, service_role;

-- Tool: buscar políticas ativas do cliente
CREATE OR REPLACE FUNCTION public.get_agent_knowledge_policies(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_policies JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object('title', title, 'content', content, 'type', policy_type)
    ORDER BY created_at
  )
  INTO v_policies
  FROM public.client_knowledge_policies
  WHERE client_id = p_client_id AND active = true;
  RETURN COALESCE(v_policies, '[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_knowledge_policies(UUID) TO authenticated, anon, service_role;

-- ── Versão ────────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('146_agent_behavior_rpcs')
ON CONFLICT (version) DO NOTHING;
