-- =============================================================================
-- Migration 107: Multi-atendentes para agência e C8 Control
--
-- Adiciona o suporte completo a múltiplos atendentes humanos por tenant:
--   • client_agents         — atendentes dos clientes C8 Control
--   • client_agent_sessions — disponibilidade e carga em tempo real
--   • client_queue_rules    — regras de fila por cliente (round-robin, etc.)
--   • Atualiza client_channel_conversations para FK em client_agents
--   • Índices para lookup eficiente de agentes disponíveis
--   • RPCs: next_available_agent, set_agent_status
-- =============================================================================

-- ── 1. Atendentes dos clientes C8 Control ─────────────────────────────────────
-- Cada registro vincula um crm_user a um cliente como atendente de conversas.

CREATE TABLE IF NOT EXISTS public.client_agents (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Vínculo com o usuário do CRM do cliente
  crm_user_id         UUID        NOT NULL REFERENCES public.client_crm_users(id) ON DELETE CASCADE,
  display_name        TEXT        NOT NULL,
  avatar_url          TEXT,

  -- Canais que atende
  handles_whatsapp    BOOLEAN     NOT NULL DEFAULT true,
  handles_instagram   BOOLEAN     NOT NULL DEFAULT false,
  handles_facebook    BOOLEAN     NOT NULL DEFAULT false,
  handles_comments    BOOLEAN     NOT NULL DEFAULT false,

  -- Capacidade
  max_simultaneous    INTEGER     NOT NULL DEFAULT 5,

  -- Equipe/fila
  teams               TEXT[]      DEFAULT '{}',

  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (client_id, crm_user_id)
);

CREATE INDEX IF NOT EXISTS idx_cagent_client   ON public.client_agents(client_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cagent_crm_user ON public.client_agents(crm_user_id);

DROP TRIGGER IF EXISTS trg_cagent_updated_at ON public.client_agents;
CREATE TRIGGER trg_cagent_updated_at
  BEFORE UPDATE ON public.client_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cagent_auth" ON public.client_agents;
CREATE POLICY "cagent_auth" ON public.client_agents FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_agents TO authenticated;

-- ── 2. Sessões de disponibilidade dos atendentes C8 ───────────────────────────
-- Controla o status online/offline e carga atual de cada atendente.
-- Atualizado pelo frontend quando o atendente entra/sai, e pelo n8n ao atribuir.

CREATE TABLE IF NOT EXISTS public.client_agent_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id            UUID        NOT NULL REFERENCES public.client_agents(id) ON DELETE CASCADE,

  status              TEXT        NOT NULL DEFAULT 'offline'
                      CHECK (status IN ('online','busy','away','lunch','offline')),
  current_load        INTEGER     NOT NULL DEFAULT 0 CHECK (current_load >= 0),
  last_seen_at        TIMESTAMPTZ,

  -- Estatísticas da sessão
  conversations_today INTEGER     NOT NULL DEFAULT 0,
  resolutions_today   INTEGER     NOT NULL DEFAULT 0,

  session_started_at  TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agent_id)  -- uma sessão ativa por agente
);

CREATE INDEX IF NOT EXISTS idx_casess_available ON public.client_agent_sessions(client_id, status, current_load)
  WHERE status = 'online';

DROP TRIGGER IF EXISTS trg_casess_updated_at ON public.client_agent_sessions;
CREATE TRIGGER trg_casess_updated_at
  BEFORE UPDATE ON public.client_agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_agent_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "casess_auth" ON public.client_agent_sessions;
CREATE POLICY "casess_auth" ON public.client_agent_sessions FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_agent_sessions TO authenticated;

-- ── 3. Regras de distribuição de conversas por cliente ────────────────────────

CREATE TABLE IF NOT EXISTS public.client_queue_rules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  name                TEXT        NOT NULL DEFAULT 'Padrão',
  channel_type        TEXT,       -- null = aplica a todos os canais
  rule_type           TEXT        NOT NULL DEFAULT 'round_robin'
                      CHECK (rule_type IN ('round_robin','least_busy','manual','broadcast','random')),

  -- Configurações de handoff automático
  auto_assign         BOOLEAN     NOT NULL DEFAULT true,
  notify_on_assign    BOOLEAN     NOT NULL DEFAULT true,

  -- Tempo máximo sem resposta humana antes de re-atribuir
  reassign_after_mins INTEGER     DEFAULT NULL,

  -- Mensagem automática ao cliente quando entra na fila
  queue_message       TEXT,

  -- Horário de atendimento humano (fora desse horário fica no bot)
  human_hours_start   TIME,
  human_hours_end     TIME,
  human_days          INTEGER[]   DEFAULT '{1,2,3,4,5}', -- 0=Dom, 1=Seg...

  is_active           BOOLEAN     NOT NULL DEFAULT true,
  priority_order      INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cqrule_client ON public.client_queue_rules(client_id, is_active);

DROP TRIGGER IF EXISTS trg_cqrule_updated_at ON public.client_queue_rules;
CREATE TRIGGER trg_cqrule_updated_at
  BEFORE UPDATE ON public.client_queue_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_queue_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cqrule_auth" ON public.client_queue_rules;
CREATE POLICY "cqrule_auth" ON public.client_queue_rules FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_queue_rules TO authenticated;

-- ── 4. Fila de espera por conversa ────────────────────────────────────────────
-- Conversas aguardando atendente humano, com posição e tempo de espera.

CREATE TABLE IF NOT EXISTS public.client_queue_entries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id     UUID        NOT NULL REFERENCES public.client_channel_conversations(id) ON DELETE CASCADE,

  queue_position      INTEGER,
  channel_type        TEXT,
  preferred_agent_id  UUID        REFERENCES public.client_agents(id) ON DELETE SET NULL,

  -- Contexto para o atendente
  reason              TEXT,
  bot_summary         TEXT,
  customer_intent     TEXT,

  queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at         TIMESTAMPTZ,
  assigned_agent_id   UUID        REFERENCES public.client_agents(id) ON DELETE SET NULL,

  UNIQUE (conversation_id)  -- uma entrada por conversa
);

CREATE INDEX IF NOT EXISTS idx_cqentry_client  ON public.client_queue_entries(client_id, queued_at);
CREATE INDEX IF NOT EXISTS idx_cqentry_pending ON public.client_queue_entries(client_id, channel_type) WHERE assigned_at IS NULL;

ALTER TABLE public.client_queue_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cqentry_auth" ON public.client_queue_entries;
CREATE POLICY "cqentry_auth" ON public.client_queue_entries FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_queue_entries TO authenticated;

-- ── 5. RPC: get_next_available_agent ──────────────────────────────────────────
-- Retorna o próximo atendente disponível para um cliente e canal.
-- Chamada pelo n8n no momento do handoff.

CREATE OR REPLACE FUNCTION public.get_next_available_agent(
  p_client_id    UUID,
  p_channel_type TEXT DEFAULT 'whatsapp',
  p_rule_type    TEXT DEFAULT 'round_robin'
)
RETURNS UUID   -- agent_id ou NULL se nenhum disponível
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  IF p_rule_type = 'least_busy' THEN
    -- Agente online com menor carga
    SELECT a.id INTO v_agent_id
    FROM public.client_agents a
    JOIN public.client_agent_sessions s ON s.agent_id = a.id
    WHERE a.client_id = p_client_id
      AND a.is_active = true
      AND s.status = 'online'
      AND s.current_load < a.max_simultaneous
      AND (
        (p_channel_type = 'whatsapp'         AND a.handles_whatsapp  = true) OR
        (p_channel_type = 'instagram_dm'     AND a.handles_instagram = true) OR
        (p_channel_type = 'facebook_dm'      AND a.handles_facebook  = true) OR
        (p_channel_type = 'instagram_comment' AND a.handles_comments  = true) OR
        (p_channel_type = 'facebook_comment' AND a.handles_comments  = true)
      )
    ORDER BY s.current_load ASC, s.last_seen_at DESC
    LIMIT 1;

  ELSE -- round_robin (default): mais tempo sem receber conversa
    SELECT a.id INTO v_agent_id
    FROM public.client_agents a
    JOIN public.client_agent_sessions s ON s.agent_id = a.id
    WHERE a.client_id = p_client_id
      AND a.is_active = true
      AND s.status = 'online'
      AND s.current_load < a.max_simultaneous
      AND (
        (p_channel_type = 'whatsapp'          AND a.handles_whatsapp  = true) OR
        (p_channel_type = 'instagram_dm'      AND a.handles_instagram = true) OR
        (p_channel_type = 'facebook_dm'       AND a.handles_facebook  = true) OR
        (p_channel_type = 'instagram_comment' AND a.handles_comments  = true) OR
        (p_channel_type = 'facebook_comment'  AND a.handles_comments  = true)
      )
    ORDER BY s.last_seen_at ASC NULLS FIRST, s.current_load ASC
    LIMIT 1;
  END IF;

  RETURN v_agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_available_agent TO authenticated;

-- ── 6. RPC: assign_client_conversation ────────────────────────────────────────
-- Atribui uma conversa a um atendente C8, registra na timeline e
-- atualiza a carga. Chamada pelo n8n ao aceitar handoff.

CREATE OR REPLACE FUNCTION public.assign_client_conversation(
  p_conversation_id UUID,
  p_agent_id        UUID,
  p_from_bot        BOOLEAN DEFAULT false,
  p_reason          TEXT    DEFAULT NULL,
  p_summary         TEXT    DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id      UUID;
  v_client_id   UUID;
  v_prev_agent  UUID;
BEGIN
  SELECT organization_id, client_id, assigned_agent_id
  INTO v_org_id, v_client_id, v_prev_agent
  FROM public.client_channel_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'conversation_not_found'; END IF;

  -- Atualiza conversa
  UPDATE public.client_channel_conversations
  SET assigned_agent_id = p_agent_id::TEXT,
      status            = 'human_active',
      bot_active        = false,
      handoff_at        = CASE WHEN p_from_bot THEN now() ELSE handoff_at END,
      handoff_summary   = COALESCE(p_summary, handoff_summary),
      updated_at        = now()
  WHERE id = p_conversation_id;

  -- Remove da fila se estava
  DELETE FROM public.client_queue_entries
  WHERE conversation_id = p_conversation_id;

  -- Timeline
  INSERT INTO public.client_channel_timeline(
    client_id, organization_id, conversation_id,
    event_type, actor_type, actor_id, metadata
  ) VALUES (
    v_client_id, v_org_id, p_conversation_id,
    CASE WHEN p_from_bot THEN 'handoff_accepted' ELSE 'agent_assigned' END,
    'system', p_agent_id::TEXT,
    jsonb_build_object('reason', p_reason, 'from_bot', p_from_bot)
  );

  -- Incrementa carga do novo agente
  INSERT INTO public.client_agent_sessions(client_id, organization_id, agent_id, status, current_load, last_seen_at)
  VALUES (v_client_id, v_org_id, p_agent_id, 'online', 1, now())
  ON CONFLICT (agent_id) DO UPDATE
    SET current_load  = client_agent_sessions.current_load + 1,
        last_seen_at  = now(),
        updated_at    = now();

  -- Decrementa carga do agente anterior (se houver e for diferente)
  IF v_prev_agent IS NOT NULL AND v_prev_agent != p_agent_id THEN
    UPDATE public.client_agent_sessions
    SET current_load = GREATEST(0, current_load - 1), updated_at = now()
    WHERE agent_id = v_prev_agent;
  END IF;

  RETURN jsonb_build_object('success', true, 'conversation_id', p_conversation_id, 'agent_id', p_agent_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_client_conversation TO authenticated;

-- ── 7. RPC: set_agent_status ──────────────────────────────────────────────────
-- Atualiza o status do atendente (online/offline/away). Chamada pelo frontend.

CREATE OR REPLACE FUNCTION public.set_agent_status(
  p_agent_id UUID,
  p_status   TEXT,
  p_client_id UUID DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id    UUID;
  v_client_id UUID;
BEGIN
  SELECT a.organization_id, a.client_id
  INTO v_org_id, v_client_id
  FROM public.client_agents a
  WHERE a.id = p_agent_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'agent_not_found'; END IF;

  INSERT INTO public.client_agent_sessions(
    client_id, organization_id, agent_id, status,
    session_started_at, last_seen_at, updated_at
  )
  VALUES (
    v_client_id, v_org_id, p_agent_id, p_status,
    CASE WHEN p_status = 'online' THEN now() ELSE NULL END,
    now(), now()
  )
  ON CONFLICT (agent_id) DO UPDATE
    SET status             = EXCLUDED.status,
        last_seen_at       = now(),
        session_started_at = CASE
          WHEN EXCLUDED.status = 'online' AND client_agent_sessions.status != 'online'
          THEN now()
          ELSE client_agent_sessions.session_started_at
        END,
        updated_at = now();

  RETURN jsonb_build_object('success', true, 'agent_id', p_agent_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_agent_status TO authenticated;

-- ── 8. Também expande omni_agents da agência com fila ─────────────────────────
-- A tabela omni_agents (agência) já foi criada na migration 104.
-- Aqui adicionamos a tabela de fila da agência.

CREATE TABLE IF NOT EXISTS public.omni_queue_entries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id     UUID        NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,

  queue_position      INTEGER,
  channel_type        TEXT,
  preferred_agent_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  reason              TEXT,
  bot_summary         TEXT,
  customer_intent     TEXT,

  queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at         TIMESTAMPTZ,
  assigned_agent_id   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_oqentry_org     ON public.omni_queue_entries(organization_id, queued_at);
CREATE INDEX IF NOT EXISTS idx_oqentry_pending ON public.omni_queue_entries(organization_id) WHERE assigned_at IS NULL;

ALTER TABLE public.omni_queue_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oqentry_auth" ON public.omni_queue_entries;
CREATE POLICY "oqentry_auth" ON public.omni_queue_entries FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_queue_entries TO authenticated;

-- ── 9. Registra versão ────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('107_multi_agents_c8control', now())
ON CONFLICT (version) DO NOTHING;
