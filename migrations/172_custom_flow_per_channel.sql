-- ── Migration 172: custom_flow_enabled por canal ─────────────────────────────
-- Adiciona a coluna custom_flow_enabled em agent_channel_configs e
-- agency_channel_configs. Atualiza as RPCs relacionadas para suportar o novo
-- campo e ajusta resolve_bot_strategy para verificar o flag ANTES de checar
-- bot_mode, e get_bot_channel_context para expor custom_flow_enabled no meta.
--
-- Banco A only. Sem impacto no Banco B.

-- ── 1. ADD COLUMN custom_flow_enabled ────────────────────────────────────────

ALTER TABLE public.agent_channel_configs
  ADD COLUMN IF NOT EXISTS custom_flow_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.agency_channel_configs
  ADD COLUMN IF NOT EXISTS custom_flow_enabled BOOLEAN NOT NULL DEFAULT false;

-- ── 2. upsert_agent_channel_config (22 params) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_agent_channel_config(
  p_client_id                   UUID,
  p_organization_id             UUID,
  p_channel_type                TEXT,
  p_is_enabled                  BOOLEAN DEFAULT true,
  p_agent_name                  TEXT    DEFAULT 'Assistente',
  p_agent_role                  TEXT    DEFAULT 'Atendimento ao cliente',
  p_agent_description           TEXT    DEFAULT NULL,
  p_tone                        TEXT    DEFAULT 'amigavel',
  p_formality                   INTEGER DEFAULT 3,
  p_use_emojis                  BOOLEAN DEFAULT false,
  p_response_length             TEXT    DEFAULT 'medio',
  p_objective                   TEXT    DEFAULT 'atendimento',
  p_instructions                TEXT    DEFAULT NULL,
  p_behavior_use_knowledge      BOOLEAN DEFAULT true,
  p_behavior_collect_data       BOOLEAN DEFAULT true,
  p_behavior_create_opportunity BOOLEAN DEFAULT false,
  p_behavior_handoff            BOOLEAN DEFAULT true,
  p_handoff_keywords            TEXT[]  DEFAULT '{}',
  p_handoff_after_mins          INTEGER DEFAULT NULL,
  p_respond_outside_hours       BOOLEAN DEFAULT false,
  p_outside_hours_message       TEXT    DEFAULT NULL,
  p_custom_flow_enabled         BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.agent_channel_configs (
    client_id, organization_id, channel_type, is_enabled,
    agent_name, agent_role, agent_description,
    tone, formality, use_emojis, response_length,
    objective, instructions,
    behavior_use_knowledge, behavior_collect_data,
    behavior_create_opportunity, behavior_handoff,
    handoff_keywords, handoff_after_mins,
    respond_outside_hours, outside_hours_message,
    custom_flow_enabled
  ) VALUES (
    p_client_id, p_organization_id, p_channel_type, p_is_enabled,
    p_agent_name, p_agent_role, p_agent_description,
    p_tone, p_formality, p_use_emojis, p_response_length,
    p_objective, p_instructions,
    p_behavior_use_knowledge, p_behavior_collect_data,
    p_behavior_create_opportunity, p_behavior_handoff,
    COALESCE(p_handoff_keywords, '{}'), p_handoff_after_mins,
    p_respond_outside_hours, p_outside_hours_message,
    p_custom_flow_enabled
  )
  ON CONFLICT (client_id, channel_type) DO UPDATE SET
    is_enabled                  = p_is_enabled,
    agent_name                  = p_agent_name,
    agent_role                  = p_agent_role,
    agent_description           = p_agent_description,
    tone                        = p_tone,
    formality                   = p_formality,
    use_emojis                  = p_use_emojis,
    response_length             = p_response_length,
    objective                   = p_objective,
    instructions                = p_instructions,
    behavior_use_knowledge      = p_behavior_use_knowledge,
    behavior_collect_data       = p_behavior_collect_data,
    behavior_create_opportunity = p_behavior_create_opportunity,
    behavior_handoff            = p_behavior_handoff,
    handoff_keywords            = COALESCE(p_handoff_keywords, '{}'),
    handoff_after_mins          = p_handoff_after_mins,
    respond_outside_hours       = p_respond_outside_hours,
    outside_hours_message       = p_outside_hours_message,
    custom_flow_enabled         = p_custom_flow_enabled,
    updated_at                  = now();

  RETURN jsonb_build_object('success', true, 'channel_type', p_channel_type);
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_agent_channel_config(
  UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,
  BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT[],INTEGER,BOOLEAN,TEXT,BOOLEAN
) TO authenticated, anon, service_role;

-- ── 3. get_agent_channel_configs ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_agent_channel_configs(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(
    channel_type,
    jsonb_build_object(
      'is_enabled',                 is_enabled,
      'agent_name',                 agent_name,
      'agent_role',                 agent_role,
      'agent_description',          agent_description,
      'tone',                       tone,
      'formality',                  formality,
      'use_emojis',                 use_emojis,
      'response_length',            response_length,
      'objective',                  objective,
      'instructions',               instructions,
      'behavior_use_knowledge',     behavior_use_knowledge,
      'behavior_collect_data',      behavior_collect_data,
      'behavior_create_opportunity', behavior_create_opportunity,
      'behavior_handoff',           behavior_handoff,
      'handoff_keywords',           handoff_keywords,
      'handoff_after_mins',         handoff_after_mins,
      'respond_outside_hours',      respond_outside_hours,
      'outside_hours_message',      outside_hours_message,
      'custom_flow_enabled',        custom_flow_enabled
    )
  )
  INTO v_result
  FROM public.agent_channel_configs
  WHERE client_id = p_client_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_agent_channel_configs(UUID)
  TO authenticated, anon, service_role;

-- ── 4. upsert_agency_channel_config (22 params) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_agency_channel_config(
  p_organization_id             UUID,
  p_meta_connection_id          UUID,
  p_channel_type                TEXT,
  p_is_enabled                  BOOLEAN DEFAULT true,
  p_agent_name                  TEXT    DEFAULT 'Assistente',
  p_agent_role                  TEXT    DEFAULT 'Atendimento ao cliente',
  p_agent_description           TEXT    DEFAULT NULL,
  p_tone                        TEXT    DEFAULT 'amigavel',
  p_formality                   INTEGER DEFAULT 3,
  p_use_emojis                  BOOLEAN DEFAULT false,
  p_response_length             TEXT    DEFAULT 'medio',
  p_objective                   TEXT    DEFAULT 'atendimento',
  p_instructions                TEXT    DEFAULT NULL,
  p_behavior_use_knowledge      BOOLEAN DEFAULT true,
  p_behavior_collect_data       BOOLEAN DEFAULT true,
  p_behavior_create_opportunity BOOLEAN DEFAULT false,
  p_behavior_handoff            BOOLEAN DEFAULT true,
  p_handoff_keywords            TEXT[]  DEFAULT '{}',
  p_handoff_after_mins          INTEGER DEFAULT NULL,
  p_respond_outside_hours       BOOLEAN DEFAULT false,
  p_outside_hours_message       TEXT    DEFAULT NULL,
  p_custom_flow_enabled         BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.agency_channel_configs (
    organization_id, meta_connection_id, channel_type, is_enabled,
    agent_name, agent_role, agent_description,
    tone, formality, use_emojis, response_length,
    objective, instructions,
    behavior_use_knowledge, behavior_collect_data,
    behavior_create_opportunity, behavior_handoff,
    handoff_keywords, handoff_after_mins,
    respond_outside_hours, outside_hours_message,
    custom_flow_enabled
  ) VALUES (
    p_organization_id, p_meta_connection_id, p_channel_type, p_is_enabled,
    p_agent_name, p_agent_role, p_agent_description,
    p_tone, p_formality, p_use_emojis, p_response_length,
    p_objective, p_instructions,
    p_behavior_use_knowledge, p_behavior_collect_data,
    p_behavior_create_opportunity, p_behavior_handoff,
    COALESCE(p_handoff_keywords, '{}'), p_handoff_after_mins,
    p_respond_outside_hours, p_outside_hours_message,
    p_custom_flow_enabled
  )
  ON CONFLICT (meta_connection_id, channel_type) DO UPDATE SET
    is_enabled                  = p_is_enabled,
    agent_name                  = p_agent_name,
    agent_role                  = p_agent_role,
    agent_description           = p_agent_description,
    tone                        = p_tone,
    formality                   = p_formality,
    use_emojis                  = p_use_emojis,
    response_length             = p_response_length,
    objective                   = p_objective,
    instructions                = p_instructions,
    behavior_use_knowledge      = p_behavior_use_knowledge,
    behavior_collect_data       = p_behavior_collect_data,
    behavior_create_opportunity = p_behavior_create_opportunity,
    behavior_handoff            = p_behavior_handoff,
    handoff_keywords            = COALESCE(p_handoff_keywords, '{}'),
    handoff_after_mins          = p_handoff_after_mins,
    respond_outside_hours       = p_respond_outside_hours,
    outside_hours_message       = p_outside_hours_message,
    custom_flow_enabled         = p_custom_flow_enabled,
    updated_at                  = now();

  RETURN jsonb_build_object(
    'success',             true,
    'meta_connection_id',  p_meta_connection_id,
    'channel_type',        p_channel_type
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_agency_channel_config(
  UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,
  BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT[],INTEGER,BOOLEAN,TEXT,BOOLEAN
) TO authenticated, anon, service_role;

-- ── 5. get_agency_channel_configs ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_agency_channel_configs(p_meta_connection_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(
    channel_type,
    jsonb_build_object(
      'id',                         id,
      'is_enabled',                 is_enabled,
      'agent_name',                 agent_name,
      'agent_role',                 agent_role,
      'agent_description',          agent_description,
      'tone',                       tone,
      'formality',                  formality,
      'use_emojis',                 use_emojis,
      'response_length',            response_length,
      'objective',                  objective,
      'instructions',               instructions,
      'behavior_use_knowledge',     behavior_use_knowledge,
      'behavior_collect_data',      behavior_collect_data,
      'behavior_create_opportunity', behavior_create_opportunity,
      'behavior_handoff',           behavior_handoff,
      'handoff_keywords',           handoff_keywords,
      'handoff_after_mins',         handoff_after_mins,
      'respond_outside_hours',      respond_outside_hours,
      'outside_hours_message',      outside_hours_message,
      'custom_flow_enabled',        custom_flow_enabled
    )
  )
  INTO v_result
  FROM public.agency_channel_configs
  WHERE meta_connection_id = p_meta_connection_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_agency_channel_configs(UUID)
  TO authenticated, anon, service_role;

-- ── 6. resolve_bot_strategy ──────────────────────────────────────────────────
-- Verifica custom_flow_enabled ANTES de checar agent_configs.bot_mode.
-- Se custom_flow_enabled = true: tenta flow canal-específico, depois geral.
--   Encontrou flow ativo → {mode:'flow', flow_id, definition}
--   Não encontrou       → {mode:'padrao'}
-- Se false: segue a lógica original de bot_mode.

CREATE OR REPLACE FUNCTION public.resolve_bot_strategy(
  p_client_id UUID,
  p_channel   TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_custom_flow_enabled  BOOLEAN := false;
  v_bot_mode             TEXT;
  v_bot_mode_per_channel JSONB;
  v_effective_mode       TEXT;
  v_flow_id              UUID;
  v_definition           JSONB;
BEGIN
  -- ── Bloco custom_flow: verifica flag ANTES de ler agent_configs ──────────
  SELECT custom_flow_enabled
    INTO v_custom_flow_enabled
    FROM public.agent_channel_configs
   WHERE client_id    = p_client_id
     AND channel_type = p_channel
   LIMIT 1;

  IF v_custom_flow_enabled = true THEN
    -- Tenta flow canal-específico primeiro
    SELECT id, definition INTO v_flow_id, v_definition
      FROM public.chatbot_flows
     WHERE client_id   = p_client_id
       AND status      = 'active'
       AND scope       = 'channel'
       AND channel_type = p_channel
     LIMIT 1;

    -- Fallback para flow geral
    IF v_flow_id IS NULL THEN
      SELECT id, definition INTO v_flow_id, v_definition
        FROM public.chatbot_flows
       WHERE client_id = p_client_id
         AND status    = 'active'
         AND scope     = 'general'
       LIMIT 1;
    END IF;

    IF v_flow_id IS NOT NULL THEN
      RETURN jsonb_build_object('mode', 'flow', 'flow_id', v_flow_id, 'definition', v_definition);
    ELSE
      RETURN jsonb_build_object('mode', 'padrao');
    END IF;
  END IF;

  -- ── Lógica original de bot_mode (custom_flow_enabled = false) ───────────
  SELECT bot_mode, bot_mode_per_channel
    INTO v_bot_mode, v_bot_mode_per_channel
    FROM public.agent_configs
   WHERE client_id = p_client_id
   LIMIT 1;

  -- Resolve modo efetivo: per-channel override > default > fallback n8n
  v_effective_mode := COALESCE(
    NULLIF(v_bot_mode_per_channel ->> p_channel, ''),
    v_bot_mode,
    'padrao'
  );

  IF v_effective_mode = 'padrao' OR v_effective_mode IS NULL THEN
    RETURN jsonb_build_object('mode', 'padrao');
  END IF;

  -- Busca fluxo ativo: canal-específico primeiro, depois geral
  SELECT id, definition INTO v_flow_id, v_definition
    FROM public.chatbot_flows
   WHERE client_id   = p_client_id
     AND status      = 'active'
     AND scope       = 'channel'
     AND channel_type = p_channel
   LIMIT 1;

  IF v_flow_id IS NULL THEN
    SELECT id, definition INTO v_flow_id, v_definition
      FROM public.chatbot_flows
     WHERE client_id = p_client_id
       AND status    = 'active'
       AND scope     = 'general'
     LIMIT 1;
  END IF;

  IF v_flow_id IS NULL THEN
    -- Sem fluxo ativo → fallback padrao
    RETURN jsonb_build_object('mode', 'padrao');
  END IF;

  RETURN jsonb_build_object('mode', 'flow', 'flow_id', v_flow_id, 'definition', v_definition);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_bot_strategy(UUID, TEXT) TO service_role;

-- ── 7. get_bot_channel_context ───────────────────────────────────────────────
-- Adiciona custom_flow_enabled ao bloco 'meta' nos caminhos cliente e agência.
-- Nos retornos antecipados bot_active=false, expõe custom_flow_enabled: false.

CREATE OR REPLACE FUNCTION public.get_bot_channel_context(
  p_connection_id UUID,
  p_channel       TEXT DEFAULT 'whatsapp'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id      UUID;
  v_org_id         UUID;

  -- Cliente (agent_channel_configs)
  v_client_chan    RECORD;
  v_contact        RECORD;   -- client_ai_settings
  v_notices        JSONB;
  v_faqs           JSONB;
  v_services       JSONB;
  v_policies       JSONB;

  -- Agência (agency_channel_configs)
  v_agency_chan    RECORD;
  v_agency_faqs    JSONB;
  v_agency_policies JSONB;

  -- Compartilhados
  v_channel_note   TEXT;
  v_system_prompt  TEXT;
  v_system_message TEXT;
BEGIN
  -- ── 0. Resolve meta_connection → client_id + organization_id ─────────────
  SELECT client_id, organization_id
    INTO v_client_id, v_org_id
  FROM public.meta_connections
  WHERE id = p_connection_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',         'connection_not_found',
      'connection_id', p_connection_id
    );
  END IF;

  -- ── Nota de contexto do canal (compartilhada pelos dois lados) ─────────────
  v_channel_note := CASE p_channel
    WHEN 'whatsapp'          THEN 'Você está atendendo pelo WhatsApp. Seja proativo — antecipe dúvidas, sugira próximos passos e mantenha o cliente engajado.'
    WHEN 'instagram_dm'      THEN 'Você está atendendo pelo Instagram Direct. Seja consultivo — qualifique o lead, entenda a necessidade e guie para a conversão. Mensagens concisas.'
    WHEN 'instagram_comment' THEN 'Você está respondendo um comentário público no Instagram. Seja breve e cordial. Nunca compartilhe dados sensíveis. Se necessário, convide para continuar no Direct.'
    WHEN 'facebook_dm'       THEN 'Você está atendendo pelo Facebook Messenger. Tom amigável e direto. Qualifique o interesse e ofereça ajuda concreta.'
    WHEN 'facebook_comment'  THEN 'Você está respondendo um comentário público no Facebook. Seja breve e cordial. Nunca compartilhe dados sensíveis. Se necessário, convide para continuar no Messenger.'
    ELSE                          'Você está atendendo um cliente.'
  END;

  -- ══════════════════════════════════════════════════════════════════════════
  -- LADO CLIENTE (client_id IS NOT NULL)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_client_id IS NOT NULL THEN

    SELECT * INTO v_client_chan
    FROM public.agent_channel_configs
    WHERE client_id    = v_client_id
      AND channel_type = p_channel
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'error',         'channel_config_not_found',
        'side',          'client',
        'channel',       p_channel,
        'client_id',     v_client_id,
        'connection_id', p_connection_id,
        'hint',          'Configure este canal em Meu Agente antes de usar o bot.'
      );
    END IF;

    IF NOT v_client_chan.is_enabled THEN
      RETURN jsonb_build_object(
        'side',          'client',
        'bot_active',    false,
        'client_id',     v_client_id,
        'organization_id', v_org_id,
        'channel',       p_channel,
        'connection_id', p_connection_id,
        'custom_flow_enabled', false
      );
    END IF;

    -- Dados do estabelecimento
    SELECT establishment_name, phone, whatsapp, instagram,
           address, opening_hours, google_business_url
    INTO v_contact
    FROM public.client_ai_settings
    WHERE client_id = v_client_id
    LIMIT 1;

    -- Avisos ativos (sem duplicatas)
    SELECT jsonb_agg(aviso ORDER BY prioridade)
    INTO v_notices
    FROM (
      SELECT DISTINCT ON (message)
        jsonb_build_object('message', message, 'priority', priority) AS aviso,
        CASE priority WHEN 'alta' THEN 1 WHEN 'média' THEN 2 ELSE 3 END AS prioridade
      FROM public.client_ai_notices
      WHERE client_id = v_client_id AND status = 'active'
      ORDER BY message, prioridade
    ) sub;

    -- FAQs
    SELECT jsonb_agg(
      jsonb_build_object('q', question, 'a', answer, 'cat', category)
      ORDER BY priority DESC
    )
    INTO v_faqs
    FROM public.client_knowledge_faqs
    WHERE client_id = v_client_id AND active = true;

    -- Serviços
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', name, 'desc', description,
        'price', price_info, 'duration', duration_info, 'cat', category
      )
      ORDER BY name
    )
    INTO v_services
    FROM public.client_knowledge_services
    WHERE client_id = v_client_id AND active = true;

    -- Políticas
    SELECT jsonb_agg(
      jsonb_build_object('title', title, 'content', content, 'type', policy_type)
      ORDER BY created_at
    )
    INTO v_policies
    FROM public.client_knowledge_policies
    WHERE client_id = v_client_id AND active = true;

    -- System Prompt
    v_system_prompt :=
      'Você é ' || v_client_chan.agent_name || ', ' || v_client_chan.agent_role ||
      ' de ' || COALESCE(v_contact.establishment_name, 'nosso estabelecimento') || '.' ||
      CASE WHEN v_client_chan.agent_description IS NOT NULL AND trim(v_client_chan.agent_description) <> ''
        THEN E'\n\n' || v_client_chan.agent_description
        ELSE '' END ||
      E'\n\n' ||
      'Tom: ' || v_client_chan.tone ||
      '. Formalidade: ' || v_client_chan.formality::TEXT || '/5' ||
      '. Respostas: ' || v_client_chan.response_length ||
      '. ' || CASE WHEN v_client_chan.use_emojis THEN 'Use emojis moderadamente.' ELSE 'Não use emojis.' END ||
      CASE WHEN v_client_chan.objective IS NOT NULL AND trim(v_client_chan.objective) <> ''
        THEN E'\n\nObjetivo principal: ' || v_client_chan.objective
        ELSE '' END ||
      CASE WHEN v_client_chan.instructions IS NOT NULL AND trim(v_client_chan.instructions) <> ''
        THEN E'\n\nInstruções específicas:\n' || v_client_chan.instructions
        ELSE '' END ||
      CASE WHEN v_client_chan.behavior_handoff
            AND v_client_chan.handoff_keywords IS NOT NULL
            AND array_length(v_client_chan.handoff_keywords, 1) > 0
        THEN E'\n\nTransfira para um atendente humano quando o cliente usar: ' ||
             array_to_string(v_client_chan.handoff_keywords, ', ') || '.'
        ELSE '' END ||
      E'\n\n' || v_channel_note;

    -- System Message (dados dinâmicos do estabelecimento + avisos)
    v_system_message := '';
    IF v_contact IS NOT NULL THEN
      v_system_message :=
        'DADOS DO ESTABELECIMENTO' || E'\n' ||
        CASE WHEN v_contact.phone IS NOT NULL
          THEN 'Telefone: ' || v_contact.phone || E'\n' ELSE '' END ||
        CASE WHEN v_contact.whatsapp IS NOT NULL
          THEN 'WhatsApp: ' || v_contact.whatsapp || E'\n' ELSE '' END ||
        CASE WHEN v_contact.address IS NOT NULL
          THEN 'Endereço: ' || v_contact.address || E'\n' ELSE '' END ||
        CASE WHEN v_contact.opening_hours IS NOT NULL
          THEN 'Horário de funcionamento: ' || v_contact.opening_hours || E'\n' ELSE '' END;
    END IF;

    IF v_notices IS NOT NULL AND jsonb_array_length(v_notices) > 0 THEN
      v_system_message := v_system_message || E'\nAVISOS IMPORTANTES (informe ao cliente se relevante):\n';
      SELECT v_system_message || string_agg('- ' || (n->>'message'), E'\n')
      INTO v_system_message
      FROM jsonb_array_elements(v_notices) AS n;
    END IF;

    RETURN jsonb_build_object(
      'side',           'client',
      'system_prompt',  v_system_prompt,
      'system_message', NULLIF(trim(v_system_message), ''),
      'behaviors', jsonb_build_object(
        'use_knowledge',      v_client_chan.behavior_use_knowledge,
        'collect_data',       v_client_chan.behavior_collect_data,
        'create_opportunity', v_client_chan.behavior_create_opportunity,
        'handoff',            v_client_chan.behavior_handoff
      ),
      'handoff', jsonb_build_object(
        'enabled',           v_client_chan.behavior_handoff,
        'keywords',          COALESCE(v_client_chan.handoff_keywords, '{}'),
        'after_mins',        v_client_chan.handoff_after_mins,
        'outside_hours_msg', v_client_chan.outside_hours_message
      ),
      'tools_context', jsonb_build_object(
        'faqs',     COALESCE(v_faqs,     '[]'::jsonb),
        'services', COALESCE(v_services, '[]'::jsonb),
        'policies', COALESCE(v_policies, '[]'::jsonb)
      ),
      'meta', jsonb_build_object(
        'client_id',           v_client_id,
        'organization_id',     v_org_id,
        'channel',             p_channel,
        'bot_active',          v_client_chan.is_enabled,
        'connection_id',       p_connection_id,
        'custom_flow_enabled', v_client_chan.custom_flow_enabled
      )
    );

  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- LADO AGÊNCIA (client_id IS NULL)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT * INTO v_agency_chan
  FROM public.agency_channel_configs
  WHERE meta_connection_id = p_connection_id
    AND channel_type       = p_channel
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',         'channel_config_not_found',
      'side',          'agency',
      'channel',       p_channel,
      'organization_id', v_org_id,
      'connection_id', p_connection_id,
      'hint',          'Configure este canal no Maestria antes de usar o bot.'
    );
  END IF;

  IF NOT v_agency_chan.is_enabled THEN
    RETURN jsonb_build_object(
      'side',                'agency',
      'bot_active',          false,
      'organization_id',     v_org_id,
      'channel',             p_channel,
      'connection_id',       p_connection_id,
      'custom_flow_enabled', false
    );
  END IF;

  -- FAQs da agência (guard defensivo — tabela pode não existir)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agency_knowledge_faqs'
  ) THEN
    EXECUTE $q$
      SELECT jsonb_agg(
        jsonb_build_object('q', question, 'a', answer, 'cat', category)
        ORDER BY priority DESC
      )
      FROM public.agency_knowledge_faqs
      WHERE organization_id = $1 AND active = true
    $q$ INTO v_agency_faqs USING v_org_id;
  END IF;

  -- Políticas da agência (guard defensivo)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agency_knowledge_policies'
  ) THEN
    EXECUTE $q$
      SELECT jsonb_agg(
        jsonb_build_object('title', title, 'content', content, 'type', policy_type)
        ORDER BY created_at
      )
      FROM public.agency_knowledge_policies
      WHERE organization_id = $1 AND active = true
    $q$ INTO v_agency_policies USING v_org_id;
  END IF;

  -- System Prompt (sem establishment_name — usa 'nossa empresa')
  v_system_prompt :=
    'Você é ' || v_agency_chan.agent_name || ', ' || v_agency_chan.agent_role ||
    ' de nossa empresa.' ||
    CASE WHEN v_agency_chan.agent_description IS NOT NULL AND trim(v_agency_chan.agent_description) <> ''
      THEN E'\n\n' || v_agency_chan.agent_description
      ELSE '' END ||
    E'\n\n' ||
    'Tom: ' || v_agency_chan.tone ||
    '. Formalidade: ' || v_agency_chan.formality::TEXT || '/5' ||
    '. Respostas: ' || v_agency_chan.response_length ||
    '. ' || CASE WHEN v_agency_chan.use_emojis THEN 'Use emojis moderadamente.' ELSE 'Não use emojis.' END ||
    CASE WHEN v_agency_chan.objective IS NOT NULL AND trim(v_agency_chan.objective) <> ''
      THEN E'\n\nObjetivo principal: ' || v_agency_chan.objective
      ELSE '' END ||
    CASE WHEN v_agency_chan.instructions IS NOT NULL AND trim(v_agency_chan.instructions) <> ''
      THEN E'\n\nInstruções específicas:\n' || v_agency_chan.instructions
      ELSE '' END ||
    CASE WHEN v_agency_chan.behavior_handoff
          AND v_agency_chan.handoff_keywords IS NOT NULL
          AND array_length(v_agency_chan.handoff_keywords, 1) > 0
      THEN E'\n\nTransfira para um atendente humano quando o cliente usar: ' ||
           array_to_string(v_agency_chan.handoff_keywords, ', ') || '.'
      ELSE '' END ||
    E'\n\n' || v_channel_note;

  RETURN jsonb_build_object(
    'side',           'agency',
    'system_prompt',  v_system_prompt,
    'system_message', NULL,
    'behaviors', jsonb_build_object(
      'use_knowledge',      v_agency_chan.behavior_use_knowledge,
      'collect_data',       v_agency_chan.behavior_collect_data,
      'create_opportunity', v_agency_chan.behavior_create_opportunity,
      'handoff',            v_agency_chan.behavior_handoff
    ),
    'handoff', jsonb_build_object(
      'enabled',           v_agency_chan.behavior_handoff,
      'keywords',          COALESCE(v_agency_chan.handoff_keywords, '{}'),
      'after_mins',        v_agency_chan.handoff_after_mins,
      'outside_hours_msg', v_agency_chan.outside_hours_message
    ),
    'tools_context', jsonb_build_object(
      'faqs',     COALESCE(v_agency_faqs,     '[]'::jsonb),
      'services', '[]'::jsonb,
      'policies', COALESCE(v_agency_policies, '[]'::jsonb)
    ),
    'meta', jsonb_build_object(
      'organization_id',     v_org_id,
      'channel',             p_channel,
      'bot_active',          v_agency_chan.is_enabled,
      'connection_id',       p_connection_id,
      'custom_flow_enabled', v_agency_chan.custom_flow_enabled
    )
  );

END; $$;

GRANT EXECUTE ON FUNCTION public.get_bot_channel_context(UUID, TEXT)
  TO authenticated, anon, service_role;

-- ── 8. Version marker ─────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('172_custom_flow_per_channel')
ON CONFLICT (version) DO NOTHING;
