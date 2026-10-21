-- Migration 130: RPC para o workflow n8n do agente IA
--
-- O n8n recebe o webhook da Meta com phone_number_id e precisa:
--   1. Identificar qual cliente é dono desse número
--   2. Verificar se bot_active = true ou false
--   3. Se ativo, buscar todo o contexto de conhecimento
--
-- Tudo em uma única chamada autenticada com service_role.

-- ─── Função principal: resolve cliente + contexto pelo phone_number_id ─────────

CREATE OR REPLACE FUNCTION public.get_agent_context_by_phone(
  p_phone_number_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id      UUID;
  v_org_id         UUID;
  v_bot_active     BOOLEAN;
  v_waba_id        TEXT;
  v_contact        JSONB;
  v_faqs           JSONB;
  v_policies       JSONB;
  v_services       JSONB;
  v_schedules      JSONB;
  v_notices        JSONB;
BEGIN
  -- 1. Encontra o cliente pelo phone_number_id na meta_connections
  SELECT
    c.id,
    c.organization_id,
    mc.waba_id
  INTO v_client_id, v_org_id, v_waba_id
  FROM public.meta_connections mc
  JOIN public.clients c ON c.id = mc.client_id
  WHERE mc.whatsapp_phone_number_id = p_phone_number_id
    AND mc.status = 'active'
  LIMIT 1;

  -- Fallback: tenta por client_id=NULL (conexão global da organização)
  IF v_client_id IS NULL THEN
    SELECT
      mc.client_id,
      mc.organization_id,
      mc.waba_id
    INTO v_client_id, v_org_id, v_waba_id
    FROM public.meta_connections mc
    WHERE mc.whatsapp_phone_number_id = p_phone_number_id
      AND mc.status = 'active'
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'client_not_found', 'phone_number_id', p_phone_number_id);
  END IF;

  -- 2. Verifica bot_active em ai_settings (Banco B via client_ai_settings no Banco A)
  SELECT COALESCE(bot_active, true)
  INTO v_bot_active
  FROM public.client_ai_settings
  WHERE client_id = v_client_id
  LIMIT 1;

  -- Se bot inativo, retorna apenas o essencial (n8n roteia para atendimento humano)
  IF NOT COALESCE(v_bot_active, true) THEN
    RETURN jsonb_build_object(
      'client_id',   v_client_id,
      'org_id',      v_org_id,
      'bot_active',  false,
      'waba_id',     v_waba_id
    );
  END IF;

  -- 3. Bot ativo: busca todo o contexto de conhecimento

  -- Informações de contato (ai_settings)
  SELECT jsonb_build_object(
    'phone',               phone,
    'whatsapp',            whatsapp,
    'instagram',           instagram,
    'address',             address,
    'opening_hours',       opening_hours,
    'google_business_url', google_business_url
  ) INTO v_contact
  FROM public.client_ai_settings
  WHERE client_id = v_client_id
  LIMIT 1;

  -- FAQs ativas
  SELECT jsonb_agg(
    jsonb_build_object('q', question, 'a', answer, 'cat', category, 'priority', priority)
    ORDER BY priority DESC
  ) INTO v_faqs
  FROM public.client_knowledge_faqs
  WHERE client_id = v_client_id AND active = true;

  -- Políticas ativas
  SELECT jsonb_agg(
    jsonb_build_object('title', title, 'content', content, 'type', policy_type)
  ) INTO v_policies
  FROM public.client_knowledge_policies
  WHERE client_id = v_client_id AND active = true;

  -- Serviços ativos
  SELECT jsonb_agg(
    jsonb_build_object('name', name, 'desc', description, 'price', price_info, 'duration', duration_info, 'cat', category)
    ORDER BY name
  ) INTO v_services
  FROM public.client_knowledge_services
  WHERE client_id = v_client_id AND active = true;

  -- Avisos ativos (client_ai_notices)
  SELECT jsonb_agg(
    jsonb_build_object('message', message, 'priority', priority)
    ORDER BY priority DESC
  ) INTO v_notices
  FROM public.client_ai_notices
  WHERE client_id = v_client_id AND status = 'active';

  RETURN jsonb_build_object(
    'client_id',  v_client_id,
    'org_id',     v_org_id,
    'bot_active', true,
    'waba_id',    v_waba_id,
    'contact',    COALESCE(v_contact,  '{}'::jsonb),
    'faqs',       COALESCE(v_faqs,     '[]'::jsonb),
    'policies',   COALESCE(v_policies, '[]'::jsonb),
    'services',   COALESCE(v_services, '[]'::jsonb),
    'notices',    COALESCE(v_notices,  '[]'::jsonb)
  );
END;
$$;

-- Acessível pelo service_role (n8n usa a service_role key)
GRANT EXECUTE ON FUNCTION public.get_agent_context_by_phone(TEXT) TO service_role;

-- ─── Versão ───────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('130_agent_webhook_context')
ON CONFLICT (version) DO NOTHING;
