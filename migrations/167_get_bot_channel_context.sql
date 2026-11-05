-- ── Migration 167: RPC get_bot_channel_context ───────────────────────────────
-- Retorna o contexto completo do bot para um canal específico, diferenciando
-- automaticamente entre conta de cliente (client_id IS NOT NULL) e conta da
-- agência (client_id IS NULL) com base em meta_connections.client_id.
--
-- Parâmetros:
--   p_connection_id  UUID  — ID da meta_connections
--   p_channel        TEXT  — 'whatsapp' | 'instagram_dm' | 'instagram_comment'
--                            'facebook_dm' | 'facebook_comment'
--
-- Retorno:
--   side            → 'client' ou 'agency'
--   system_prompt   → campo System Prompt do nó AI Agent
--   system_message  → injetar no início da conversa (dados dinâmicos — NULL p/ agência)
--   behaviors       → flags de comportamento do canal
--   handoff         → keywords e config de transferência
--   tools_context   → FAQs, serviços e políticas
--   meta            → contexto de execução (client_id, organization_id, etc.)
--
-- Banco A only. Sem impacto no Banco B.

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
        'connection_id', p_connection_id
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
        'client_id',       v_client_id,
        'organization_id', v_org_id,
        'channel',         p_channel,
        'bot_active',      v_client_chan.is_enabled,
        'connection_id',   p_connection_id
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
      'side',            'agency',
      'bot_active',      false,
      'organization_id', v_org_id,
      'channel',         p_channel,
      'connection_id',   p_connection_id
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
      'organization_id', v_org_id,
      'channel',         p_channel,
      'bot_active',      v_agency_chan.is_enabled,
      'connection_id',   p_connection_id
    )
  );

END; $$;

GRANT EXECUTE ON FUNCTION public.get_bot_channel_context(UUID, TEXT)
  TO authenticated, anon, service_role;

-- ── Version marker ────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('167_get_bot_channel_context')
ON CONFLICT (version) DO NOTHING;
