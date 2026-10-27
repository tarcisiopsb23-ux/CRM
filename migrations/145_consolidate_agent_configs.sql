-- Migration 145: Consolida configurações do agente IA em agent_configs
-- Tudo é Banco A — não existe mais Banco B separado.
-- Move auto_assign, fallback_assign_after_mins, queue_message, horários de
-- client_queue_rules para agent_configs. is_active é a fonte de verdade para bot_active.

-- ── Fase 1: Adicionar colunas em agent_configs ────────────────────────────────

ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS auto_assign                BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_assign_after_mins INTEGER   DEFAULT 2,
  ADD COLUMN IF NOT EXISTS queue_message              TEXT,
  ADD COLUMN IF NOT EXISTS outside_hours_message_v2   TEXT,
  ADD COLUMN IF NOT EXISTS human_hours_start          TIME,
  ADD COLUMN IF NOT EXISTS human_hours_end            TIME,
  ADD COLUMN IF NOT EXISTS human_days                 TEXT[]    DEFAULT ARRAY['seg','ter','qua','qui','sex'];
-- handoff_keywords já existe (migration 106)
-- is_active já existe (migration 106) = bot_active consolidado

-- ── Fase 2: Migrar dados de client_queue_rules → agent_configs ────────────────

UPDATE public.agent_configs ac
SET
  auto_assign                = COALESCE(qr.auto_assign, false),
  fallback_assign_after_mins = COALESCE(qr.fallback_assign_after_mins, 2),
  queue_message              = qr.queue_message,
  outside_hours_message_v2   = qr.outside_hours_message,
  human_hours_start          = qr.human_hours_start,
  human_hours_end            = qr.human_hours_end,
  -- qr.human_days é INTEGER[] (migration 107: 0=Dom,1=Seg..6=Sab); converter p/ TEXT[] PT-BR
  human_days                 = COALESCE(
    (SELECT array_agg(
       CASE d
         WHEN 0 THEN 'dom'::text
         WHEN 1 THEN 'seg'
         WHEN 2 THEN 'ter'
         WHEN 3 THEN 'qua'
         WHEN 4 THEN 'qui'
         WHEN 5 THEN 'sex'
         WHEN 6 THEN 'sab'
         ELSE 'seg'
       END
     ) FROM unnest(qr.human_days) AS t(d)),
    ARRAY['seg','ter','qua','qui','sex']::text[]
  )
FROM public.client_queue_rules qr
WHERE qr.client_id = ac.client_id;

-- handoff_keywords: copiar de client_queue_rules somente se a coluna existir lá.
-- (145 remove essa coluna no final; re-runs/idempotência não a encontram mais.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'client_queue_rules'
      AND column_name  = 'handoff_keywords'
  ) THEN
    EXECUTE $q$
      UPDATE public.agent_configs ac
      SET handoff_keywords = COALESCE(qr.handoff_keywords, ac.handoff_keywords, '{}')
      FROM public.client_queue_rules qr
      WHERE qr.client_id = ac.client_id
    $q$;
  END IF;
END $$;

-- Sincroniza is_active com client_ai_settings.bot_active (tudo no Banco A)
UPDATE public.agent_configs ac
SET is_active = COALESCE(cas.bot_active, true)
FROM public.client_ai_settings cas
WHERE cas.client_id = ac.client_id
  AND ac.is_active IS DISTINCT FROM cas.bot_active;

-- ── Fase 3: Atualizar RPCs ────────────────────────────────────────────────────

-- get_agent_context_by_phone — lê is_active de agent_configs
CREATE OR REPLACE FUNCTION public.get_agent_context_by_phone(p_phone_number_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID; v_org_id UUID; v_waba_id TEXT;
  v_bot_active BOOLEAN; v_auto_assign BOOLEAN; v_fallback_mins INTEGER;
  v_contact JSONB; v_faqs JSONB; v_policies JSONB; v_services JSONB; v_notices JSONB;
BEGIN
  SELECT c.id, c.organization_id, mc.waba_id
  INTO v_client_id, v_org_id, v_waba_id
  FROM public.meta_connections mc
  JOIN public.clients c ON c.id = mc.client_id
  WHERE mc.whatsapp_phone_number_id = p_phone_number_id AND mc.status = 'active' LIMIT 1;

  IF v_client_id IS NULL THEN
    SELECT mc.client_id, mc.organization_id, mc.waba_id
    INTO v_client_id, v_org_id, v_waba_id
    FROM public.meta_connections mc
    WHERE mc.whatsapp_phone_number_id = p_phone_number_id AND mc.status = 'active' LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error','client_not_found','phone_number_id',p_phone_number_id);
  END IF;

  SELECT COALESCE(is_active,true), COALESCE(auto_assign,false), COALESCE(fallback_assign_after_mins,2)
  INTO v_bot_active, v_auto_assign, v_fallback_mins
  FROM public.agent_configs WHERE client_id = v_client_id LIMIT 1;

  IF NOT COALESCE(v_bot_active, true) THEN
    RETURN jsonb_build_object('client_id',v_client_id,'org_id',v_org_id,'bot_active',false,
      'waba_id',v_waba_id,'auto_assign',v_auto_assign,'fallback_assign_after_mins',v_fallback_mins);
  END IF;

  SELECT jsonb_build_object('phone',phone,'whatsapp',whatsapp,'instagram',instagram,
    'address',address,'opening_hours',opening_hours,'google_business_url',google_business_url)
  INTO v_contact FROM public.client_ai_settings WHERE client_id = v_client_id LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object('q',question,'a',answer,'cat',category,'priority',priority) ORDER BY priority DESC)
  INTO v_faqs FROM public.client_knowledge_faqs WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('title',title,'content',content,'type',policy_type))
  INTO v_policies FROM public.client_knowledge_policies WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('name',name,'desc',description,'price',price_info,'duration',duration_info,'cat',category) ORDER BY name)
  INTO v_services FROM public.client_knowledge_services WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('message',message,'priority',priority) ORDER BY priority DESC)
  INTO v_notices FROM public.client_ai_notices WHERE client_id = v_client_id AND status = 'active';

  RETURN jsonb_build_object(
    'client_id',v_client_id,'org_id',v_org_id,'bot_active',true,'waba_id',v_waba_id,
    'auto_assign',v_auto_assign,'fallback_assign_after_mins',v_fallback_mins,
    'contact',COALESCE(v_contact,'{}'),'faqs',COALESCE(v_faqs,'[]'),
    'policies',COALESCE(v_policies,'[]'),'services',COALESCE(v_services,'[]'),
    'notices',COALESCE(v_notices,'[]')
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_context_by_phone(TEXT) TO service_role, authenticated, anon;

-- get_agent_context_by_instagram_id — nova RPC para n8n Instagram
CREATE OR REPLACE FUNCTION public.get_agent_context_by_instagram_id(p_instagram_account_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID; v_org_id UUID;
  v_bot_active BOOLEAN; v_auto_assign BOOLEAN; v_fallback_mins INTEGER;
  v_contact JSONB; v_faqs JSONB; v_policies JSONB; v_services JSONB; v_notices JSONB;
BEGIN
  SELECT c.id, c.organization_id
  INTO v_client_id, v_org_id
  FROM public.meta_connections mc
  JOIN public.clients c ON c.id = mc.client_id
  WHERE mc.instagram_account_id = p_instagram_account_id AND mc.status = 'active' LIMIT 1;

  IF v_client_id IS NULL THEN
    SELECT mc.client_id, mc.organization_id INTO v_client_id, v_org_id
    FROM public.meta_connections mc
    WHERE mc.instagram_account_id = p_instagram_account_id AND mc.status = 'active' LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error','client_not_found','instagram_account_id',p_instagram_account_id);
  END IF;

  SELECT COALESCE(is_active,true), COALESCE(auto_assign,false), COALESCE(fallback_assign_after_mins,2)
  INTO v_bot_active, v_auto_assign, v_fallback_mins
  FROM public.agent_configs WHERE client_id = v_client_id LIMIT 1;

  IF NOT COALESCE(v_bot_active, true) THEN
    RETURN jsonb_build_object('client_id',v_client_id,'org_id',v_org_id,'bot_active',false,
      'auto_assign',v_auto_assign,'fallback_assign_after_mins',v_fallback_mins);
  END IF;

  SELECT jsonb_build_object('phone',phone,'whatsapp',whatsapp,'instagram',instagram,
    'address',address,'opening_hours',opening_hours,'google_business_url',google_business_url)
  INTO v_contact FROM public.client_ai_settings WHERE client_id = v_client_id LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object('q',question,'a',answer,'cat',category,'priority',priority) ORDER BY priority DESC)
  INTO v_faqs FROM public.client_knowledge_faqs WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('title',title,'content',content,'type',policy_type))
  INTO v_policies FROM public.client_knowledge_policies WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('name',name,'desc',description,'price',price_info,'duration',duration_info,'cat',category) ORDER BY name)
  INTO v_services FROM public.client_knowledge_services WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('message',message,'priority',priority) ORDER BY priority DESC)
  INTO v_notices FROM public.client_ai_notices WHERE client_id = v_client_id AND status = 'active';

  RETURN jsonb_build_object(
    'client_id',v_client_id,'org_id',v_org_id,'bot_active',true,
    'auto_assign',v_auto_assign,'fallback_assign_after_mins',v_fallback_mins,
    'contact',COALESCE(v_contact,'{}'),'faqs',COALESCE(v_faqs,'[]'),
    'policies',COALESCE(v_policies,'[]'),'services',COALESCE(v_services,'[]'),
    'notices',COALESCE(v_notices,'[]')
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_context_by_instagram_id(TEXT) TO service_role, authenticated, anon;

-- get_agent_context_by_page_id — nova RPC para n8n Facebook
CREATE OR REPLACE FUNCTION public.get_agent_context_by_page_id(p_facebook_page_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id UUID; v_org_id UUID;
  v_bot_active BOOLEAN; v_auto_assign BOOLEAN; v_fallback_mins INTEGER;
  v_contact JSONB; v_faqs JSONB; v_policies JSONB; v_services JSONB; v_notices JSONB;
BEGIN
  SELECT c.id, c.organization_id
  INTO v_client_id, v_org_id
  FROM public.meta_connections mc
  JOIN public.clients c ON c.id = mc.client_id
  WHERE mc.facebook_page_id = p_facebook_page_id AND mc.status = 'active' LIMIT 1;

  IF v_client_id IS NULL THEN
    SELECT mc.client_id, mc.organization_id INTO v_client_id, v_org_id
    FROM public.meta_connections mc
    WHERE mc.facebook_page_id = p_facebook_page_id AND mc.status = 'active' LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error','client_not_found','facebook_page_id',p_facebook_page_id);
  END IF;

  SELECT COALESCE(is_active,true), COALESCE(auto_assign,false), COALESCE(fallback_assign_after_mins,2)
  INTO v_bot_active, v_auto_assign, v_fallback_mins
  FROM public.agent_configs WHERE client_id = v_client_id LIMIT 1;

  IF NOT COALESCE(v_bot_active, true) THEN
    RETURN jsonb_build_object('client_id',v_client_id,'org_id',v_org_id,'bot_active',false,
      'auto_assign',v_auto_assign,'fallback_assign_after_mins',v_fallback_mins);
  END IF;

  SELECT jsonb_build_object('phone',phone,'whatsapp',whatsapp,'instagram',instagram,
    'address',address,'opening_hours',opening_hours,'google_business_url',google_business_url)
  INTO v_contact FROM public.client_ai_settings WHERE client_id = v_client_id LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object('q',question,'a',answer,'cat',category,'priority',priority) ORDER BY priority DESC)
  INTO v_faqs FROM public.client_knowledge_faqs WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('title',title,'content',content,'type',policy_type))
  INTO v_policies FROM public.client_knowledge_policies WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('name',name,'desc',description,'price',price_info,'duration',duration_info,'cat',category) ORDER BY name)
  INTO v_services FROM public.client_knowledge_services WHERE client_id = v_client_id AND active = true;

  SELECT jsonb_agg(jsonb_build_object('message',message,'priority',priority) ORDER BY priority DESC)
  INTO v_notices FROM public.client_ai_notices WHERE client_id = v_client_id AND status = 'active';

  RETURN jsonb_build_object(
    'client_id',v_client_id,'org_id',v_org_id,'bot_active',true,
    'auto_assign',v_auto_assign,'fallback_assign_after_mins',v_fallback_mins,
    'contact',COALESCE(v_contact,'{}'),'faqs',COALESCE(v_faqs,'[]'),
    'policies',COALESCE(v_policies,'[]'),'services',COALESCE(v_services,'[]'),
    'notices',COALESCE(v_notices,'[]')
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_context_by_page_id(TEXT) TO service_role, authenticated, anon;

-- get_client_attendance_config — lê de agent_configs em vez de client_queue_rules
CREATE OR REPLACE FUNCTION public.get_client_attendance_config(p_client_id UUID)
RETURNS TABLE(
  whatsapp_bot_active BOOLEAN, instagram_bot_active BOOLEAN, facebook_bot_active BOOLEAN,
  auto_assign BOOLEAN, fallback_assign_after_mins INTEGER, queue_message TEXT,
  outside_hours_message TEXT, human_hours_start TEXT, human_hours_end TEXT,
  human_days TEXT[], handoff_keywords TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT
    COALESCE(ac.handles_whatsapp, true),
    COALESCE(ac.handles_instagram, true),
    COALESCE(ac.handles_facebook, true),
    COALESCE(ac.auto_assign, false),
    COALESCE(ac.fallback_assign_after_mins, 2),
    ac.queue_message,
    ac.outside_hours_message_v2,
    ac.human_hours_start::TEXT,
    ac.human_hours_end::TEXT,
    COALESCE(ac.human_days, ARRAY['seg','ter','qua','qui','sex']),
    COALESCE(ac.handoff_keywords, '{}')
  FROM public.agent_configs ac WHERE ac.client_id = p_client_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_client_attendance_config(UUID) TO authenticated, anon, service_role;

-- upsert_client_attendance_config — escreve em agent_configs
CREATE OR REPLACE FUNCTION public.upsert_client_attendance_config(
  p_client_id UUID, p_organization_id UUID,
  p_whatsapp_bot_active BOOLEAN, p_instagram_bot_active BOOLEAN, p_facebook_bot_active BOOLEAN,
  p_auto_assign BOOLEAN, p_fallback_assign_after_mins INTEGER,
  p_queue_message TEXT, p_outside_hours_message TEXT,
  p_human_hours_start TEXT, p_human_hours_end TEXT,
  p_human_days TEXT[], p_handoff_keywords TEXT[]
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.agent_configs(
    client_id, organization_id, handles_whatsapp, handles_instagram, handles_facebook,
    auto_assign, fallback_assign_after_mins, queue_message, outside_hours_message_v2,
    human_hours_start, human_hours_end, human_days, handoff_keywords, is_active
  ) VALUES(
    p_client_id, p_organization_id, p_whatsapp_bot_active, p_instagram_bot_active, p_facebook_bot_active,
    p_auto_assign, GREATEST(1, LEAST(60, COALESCE(p_fallback_assign_after_mins, 2))),
    NULLIF(p_queue_message, ''), NULLIF(p_outside_hours_message, ''),
    p_human_hours_start::TIME, p_human_hours_end::TIME,
    COALESCE(p_human_days, ARRAY['seg','ter','qua','qui','sex']),
    COALESCE(p_handoff_keywords, '{}'), true
  )
  ON CONFLICT (client_id) DO UPDATE SET
    handles_whatsapp           = p_whatsapp_bot_active,
    handles_instagram          = p_instagram_bot_active,
    handles_facebook           = p_facebook_bot_active,
    auto_assign                = p_auto_assign,
    fallback_assign_after_mins = GREATEST(1, LEAST(60, COALESCE(p_fallback_assign_after_mins, 2))),
    queue_message              = NULLIF(p_queue_message, ''),
    outside_hours_message_v2   = NULLIF(p_outside_hours_message, ''),
    human_hours_start          = p_human_hours_start::TIME,
    human_hours_end            = p_human_hours_end::TIME,
    human_days                 = COALESCE(p_human_days, ARRAY['seg','ter','qua','qui','sex']),
    handoff_keywords           = COALESCE(p_handoff_keywords, '{}'),
    updated_at                 = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_client_attendance_config(UUID,UUID,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT[]) TO authenticated, anon, service_role;

-- get_agent_channel_config — lê auto_assign de agent_configs
CREATE OR REPLACE FUNCTION public.get_agent_channel_config(p_client_id UUID)
RETURNS TABLE(
  handles_whatsapp BOOLEAN, handles_instagram BOOLEAN, handles_facebook BOOLEAN,
  handles_comments BOOLEAN, is_active BOOLEAN, auto_assign BOOLEAN, rule_type TEXT
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
    COALESCE(ac.auto_assign, false),
    'round_robin'::TEXT
  FROM public.agent_configs ac WHERE ac.client_id = p_client_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_agent_channel_config(UUID) TO authenticated, anon, service_role;

-- upsert_agent_channel_config — escreve auto_assign em agent_configs
CREATE OR REPLACE FUNCTION public.upsert_agent_channel_config(
  p_client_id UUID, p_organization_id UUID,
  p_handles_whatsapp BOOLEAN, p_handles_instagram BOOLEAN,
  p_handles_facebook BOOLEAN, p_auto_assign BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.agent_configs(client_id, organization_id, handles_whatsapp, handles_instagram, handles_facebook, auto_assign, is_active)
  VALUES(p_client_id, p_organization_id, p_handles_whatsapp, p_handles_instagram, p_handles_facebook, p_auto_assign, true)
  ON CONFLICT (client_id) DO UPDATE SET
    handles_whatsapp  = p_handles_whatsapp,
    handles_instagram = p_handles_instagram,
    handles_facebook  = p_handles_facebook,
    auto_assign       = p_auto_assign,
    updated_at        = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_agent_channel_config(UUID,UUID,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN) TO authenticated, anon, service_role;

-- Remover handoff_keywords duplicado de client_queue_rules
ALTER TABLE public.client_queue_rules DROP COLUMN IF EXISTS handoff_keywords;

-- ── Versão ────────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('145_consolidate_agent_configs')
ON CONFLICT (version) DO NOTHING;
