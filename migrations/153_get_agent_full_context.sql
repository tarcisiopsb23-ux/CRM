-- ── Migration 153: RPC get_agent_full_context ─────────────────────────────────
-- Retorna tudo que o n8n precisa para montar o AI Agent em uma única chamada.
-- Lê de agent_channel_configs (migration 154) — cada canal tem config autônoma.
--
-- Parâmetros:
--   p_client_id   UUID  — ID do cliente C8 Control
--   p_channel     TEXT  — 'whatsapp' | 'instagram_dm' | 'instagram_comment'
--                         'facebook_dm' | 'facebook_comment'
--
-- Retorno:
--   system_prompt   → campo System Prompt do nó AI Agent (quem é, como age)
--   system_message  → injetar como msg system no início da conversa (dados dinâmicos)
--   behaviors       → flags de comportamento do canal (create_opportunity, etc.)
--   handoff         → keywords e config de transferência
--   tools_context   → FAQs, serviços e políticas (usar como Tools no AI Agent)
--   meta            → client_id, channel, bot_active, auto_assign

CREATE OR REPLACE FUNCTION public.get_agent_full_context(
  p_client_id UUID,
  p_channel   TEXT DEFAULT 'whatsapp'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chan    RECORD;   -- agent_channel_configs
  v_base    RECORD;   -- agent_configs (para auto_assign, fallback_mins)
  v_contact RECORD;   -- client_ai_settings
  v_notices JSONB;
  v_faqs    JSONB;
  v_services JSONB;
  v_policies JSONB;
  v_channel_note  TEXT;
  v_system_prompt TEXT;
  v_system_message TEXT;
BEGIN
  -- ── 1. Configuração do canal específico ────────────────────────────────────
  SELECT * INTO v_chan
  FROM public.agent_channel_configs
  WHERE client_id  = p_client_id
    AND channel_type = p_channel
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',   'channel_config_not_found',
      'channel', p_channel,
      'hint',    'Configure este canal em Meu Agente antes de usar o bot.'
    );
  END IF;

  -- Canal desabilitado → retorna rapidamente sem montar prompt
  IF NOT v_chan.is_enabled THEN
    RETURN jsonb_build_object(
      'client_id',  p_client_id,
      'channel',    p_channel,
      'bot_active', false
    );
  END IF;

  -- ── 2. Config base (auto_assign, fallback_mins) ────────────────────────────
  SELECT
    COALESCE(ac.auto_assign, false)             AS auto_assign,
    COALESCE(ac.fallback_assign_after_mins, 2)  AS fallback_assign_after_mins
  INTO v_base
  FROM public.agent_configs ac
  WHERE ac.client_id = p_client_id
  LIMIT 1;

  -- ── 3. Dados de contato do estabelecimento ─────────────────────────────────
  SELECT establishment_name, phone, whatsapp, instagram,
         address, opening_hours, google_business_url
  INTO v_contact
  FROM public.client_ai_settings
  WHERE client_id = p_client_id
  LIMIT 1;

  -- ── 4. Avisos ativos (sem duplicatas) ──────────────────────────────────────
  SELECT jsonb_agg(aviso ORDER BY prioridade)
  INTO v_notices
  FROM (
    SELECT DISTINCT ON (message)
      jsonb_build_object('message', message, 'priority', priority) AS aviso,
      CASE priority WHEN 'alta' THEN 1 WHEN 'média' THEN 2 ELSE 3 END AS prioridade
    FROM public.client_ai_notices
    WHERE client_id = p_client_id AND status = 'active'
    ORDER BY message, prioridade
  ) sub;

  -- ── 5. Base de conhecimento (tools) ───────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object('q', question, 'a', answer, 'cat', category)
    ORDER BY priority DESC
  )
  INTO v_faqs
  FROM public.client_knowledge_faqs
  WHERE client_id = p_client_id AND active = true;

  SELECT jsonb_agg(
    jsonb_build_object('name', name, 'desc', description,
                       'price', price_info, 'duration', duration_info, 'cat', category)
    ORDER BY name
  )
  INTO v_services
  FROM public.client_knowledge_services
  WHERE client_id = p_client_id AND active = true;

  SELECT jsonb_agg(
    jsonb_build_object('title', title, 'content', content, 'type', policy_type)
    ORDER BY created_at
  )
  INTO v_policies
  FROM public.client_knowledge_policies
  WHERE client_id = p_client_id AND active = true;

  -- ── 6. Nota de contexto do canal ───────────────────────────────────────────
  v_channel_note := CASE p_channel
    WHEN 'whatsapp'          THEN 'Você está atendendo pelo WhatsApp. Seja proativo — antecipe dúvidas, sugira próximos passos e mantenha o cliente engajado.'
    WHEN 'instagram_dm'      THEN 'Você está atendendo pelo Instagram Direct. Seja consultivo — qualifique o lead, entenda a necessidade e guie para a conversão. Mensagens concisas.'
    WHEN 'instagram_comment' THEN 'Você está respondendo um comentário público no Instagram. Seja breve e cordial. Nunca compartilhe dados sensíveis. Se necessário, convide para continuar no Direct.'
    WHEN 'facebook_dm'       THEN 'Você está atendendo pelo Facebook Messenger. Tom amigável e direto. Qualifique o interesse e ofereça ajuda concreta.'
    WHEN 'facebook_comment'  THEN 'Você está respondendo um comentário público no Facebook. Seja breve e cordial. Nunca compartilhe dados sensíveis. Se necessário, convide para continuar no Messenger.'
    ELSE                          'Você está atendendo um cliente.'
  END;

  -- ── 7. System Prompt ───────────────────────────────────────────────────────
  -- Quem é o agente, como deve agir — estático por conversa
  v_system_prompt :=
    'Você é ' || v_chan.agent_name || ', ' || v_chan.agent_role ||
    ' de ' || COALESCE(v_contact.establishment_name, 'nosso estabelecimento') || '.' ||
    CASE WHEN v_chan.agent_description IS NOT NULL AND trim(v_chan.agent_description) <> ''
      THEN E'\n\n' || v_chan.agent_description
      ELSE '' END ||
    E'\n\n' ||
    'Tom: ' || v_chan.tone ||
    '. Formalidade: ' || v_chan.formality::TEXT || '/5' ||
    '. Respostas: ' || v_chan.response_length ||
    '. ' || CASE WHEN v_chan.use_emojis THEN 'Use emojis moderadamente.' ELSE 'Não use emojis.' END ||
    CASE WHEN v_chan.objective IS NOT NULL AND trim(v_chan.objective) <> ''
      THEN E'\n\nObjetivo principal: ' || v_chan.objective
      ELSE '' END ||
    CASE WHEN v_chan.instructions IS NOT NULL AND trim(v_chan.instructions) <> ''
      THEN E'\n\nInstruções específicas:\n' || v_chan.instructions
      ELSE '' END ||
    CASE WHEN v_chan.behavior_handoff
          AND v_chan.handoff_keywords IS NOT NULL
          AND array_length(v_chan.handoff_keywords, 1) > 0
      THEN E'\n\nTransfira para um atendente humano quando o cliente usar: ' ||
           array_to_string(v_chan.handoff_keywords, ', ') || '.'
      ELSE '' END ||
    E'\n\n' || v_channel_note;

  -- ── 8. System Message ──────────────────────────────────────────────────────
  -- Contexto dinâmico: dados do estabelecimento + avisos ativos
  -- Injetar no início do array de mensagens como role "system"
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

  -- ── 9. Retorno final ───────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    -- Meta
    'client_id',                  p_client_id,
    'channel',                    p_channel,
    'bot_active',                 v_chan.is_enabled,
    'auto_assign',                COALESCE(v_base.auto_assign, false),
    'fallback_assign_after_mins', COALESCE(v_base.fallback_assign_after_mins, 2),

    -- Textos prontos
    'system_prompt',   v_system_prompt,
    'system_message',  NULLIF(trim(v_system_message), ''),

    -- Behaviors (flags para o n8n decidir quais nodes ativar)
    'behaviors', jsonb_build_object(
      'use_knowledge',      v_chan.behavior_use_knowledge,
      'collect_data',       v_chan.behavior_collect_data,
      'create_opportunity', v_chan.behavior_create_opportunity,
      'handoff',            v_chan.behavior_handoff
    ),

    -- Handoff
    'handoff', jsonb_build_object(
      'enabled',            v_chan.behavior_handoff,
      'keywords',           COALESCE(v_chan.handoff_keywords, '{}'),
      'after_mins',         v_chan.handoff_after_mins,
      'outside_hours_msg',  v_chan.outside_hours_message
    ),

    -- Tools (base de conhecimento — usar como Tools no nó AI Agent)
    'tools_context', jsonb_build_object(
      'faqs',     COALESCE(v_faqs,     '[]'::jsonb),
      'services', COALESCE(v_services, '[]'::jsonb),
      'policies', COALESCE(v_policies, '[]'::jsonb)
    )
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_agent_full_context(UUID, TEXT)
  TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('153_get_agent_full_context')
ON CONFLICT (version) DO NOTHING;
