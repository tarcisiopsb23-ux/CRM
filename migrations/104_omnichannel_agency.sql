-- =============================================================================
-- Migration 104: Omnichannel para a Agência (Banco A)
--
-- Expande o sistema existente whatsapp_* para omnichannel completo:
--   • Adiciona colunas faltantes em whatsapp_conversations (multi-atendentes,
--     SLA, sentimento, score, canal, handoff)
--   • Cria tabelas para Instagram e Facebook (ou generaliza com canal_type)
--   • Histórico completo de mensagens (bot + humano) com remetente tipado
--   • Tabela de atendentes disponíveis por organização
--   • Tabela de transferências/handoff com contexto e resumo
--   • Tabela de eventos de timeline por conversa
--   • Idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- =============================================================================

-- ── 1. ENUMs ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'omni_channel_type') THEN
    CREATE TYPE omni_channel_type AS ENUM (
      'whatsapp', 'instagram_dm', 'facebook_dm',
      'instagram_comment', 'facebook_comment'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'omni_conv_status') THEN
    CREATE TYPE omni_conv_status AS ENUM (
      'open',           -- Recém chegada, ainda não triada
      'bot_active',     -- Bot respondendo automaticamente
      'waiting_human',  -- Bot escalou, aguardando atendente
      'human_active',   -- Atendente humano assumiu
      'waiting_customer',-- Aguardando resposta do cliente
      'resolved',       -- Encerrada com resolução
      'closed'          -- Encerrada manualmente
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'omni_msg_sender_type') THEN
    CREATE TYPE omni_msg_sender_type AS ENUM (
      'customer',   -- Mensagem do cliente
      'bot',        -- Resposta automática do bot
      'human',      -- Atendente humano
      'system',     -- Mensagem de sistema (ex: "Transferido para X")
      'automation'  -- Enviada por automação/workflow
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'omni_priority') THEN
    CREATE TYPE omni_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'omni_sentiment') THEN
    CREATE TYPE omni_sentiment AS ENUM ('positive', 'neutral', 'negative');
  END IF;
END $$;

-- ── 2. Expandir whatsapp_conversations ───────────────────────────────────────
-- Adiciona colunas de omnichannel sem remover as existentes

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS channel_type       omni_channel_type   NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS omni_status        omni_conv_status    NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS priority           omni_priority       NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS sentiment          omni_sentiment      NOT NULL DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS lead_score         INTEGER             NOT NULL DEFAULT 50
                                              CHECK (lead_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS assigned_agent_id  UUID                REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_team      TEXT,
  ADD COLUMN IF NOT EXISTS is_vip             BOOLEAN             NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags               TEXT[]              DEFAULT '{}',
  -- SLA
  ADD COLUMN IF NOT EXISTS sla_limit_mins     INTEGER             DEFAULT 60,
  ADD COLUMN IF NOT EXISTS sla_started_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_breached       BOOLEAN             NOT NULL DEFAULT false,
  -- Bot
  ADD COLUMN IF NOT EXISTS bot_session_id     TEXT,
  ADD COLUMN IF NOT EXISTS bot_context        JSONB               DEFAULT '{}',
  -- Resumo para handoff (gerado automaticamente ao transferir)
  ADD COLUMN IF NOT EXISTS handoff_summary    TEXT,
  ADD COLUMN IF NOT EXISTS handoff_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_by         UUID                REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Metadados extras
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,  -- page_id, instagram_account_id, waba_id
  ADD COLUMN IF NOT EXISTS meta_connection_id UUID    REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_probability  INTEGER DEFAULT 20 CHECK (close_probability BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS next_action        TEXT;

-- Índices novos
CREATE INDEX IF NOT EXISTS idx_wa_conv_status        ON public.whatsapp_conversations(organization_id, omni_status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_agent         ON public.whatsapp_conversations(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conv_channel       ON public.whatsapp_conversations(organization_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_wa_conv_meta_conn     ON public.whatsapp_conversations(meta_connection_id) WHERE meta_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conv_sla           ON public.whatsapp_conversations(sla_started_at) WHERE sla_breached = false AND omni_status NOT IN ('resolved','closed');

-- ── 3. Expandir whatsapp_messages ─────────────────────────────────────────────
-- Adiciona tipo de remetente, status de entrega e referência de reply

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS sender_type        omni_msg_sender_type  NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS sender_agent_id    UUID                  REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_type       omni_channel_type     NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS delivery_status    TEXT                  NOT NULL DEFAULT 'sent'
                                              CHECK (delivery_status IN ('pending','sent','delivered','read','failed')),
  ADD COLUMN IF NOT EXISTS reply_to_id        UUID                  REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_type       TEXT                  NOT NULL DEFAULT 'text'
                                              CHECK (message_type IN ('text','image','video','audio','document','sticker','reaction','template','interactive')),
  ADD COLUMN IF NOT EXISTS template_name      TEXT,
  ADD COLUMN IF NOT EXISTS is_bot_response    BOOLEAN               NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS n8n_execution_id   TEXT;  -- rastrear qual execução n8n gerou a mensagem

CREATE INDEX IF NOT EXISTS idx_wa_msg_sender_type ON public.whatsapp_messages(conversation_id, sender_type);
CREATE INDEX IF NOT EXISTS idx_wa_msg_channel     ON public.whatsapp_messages(organization_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_wa_msg_status      ON public.whatsapp_messages(delivery_status) WHERE delivery_status IN ('pending','failed');

-- ── 4. Atendentes online (disponibilidade por organização) ───────────────────

CREATE TABLE IF NOT EXISTS public.omni_agents (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Disponibilidade
  status              TEXT        NOT NULL DEFAULT 'offline'
                      CHECK (status IN ('online','busy','away','offline')),
  max_simultaneous    INTEGER     NOT NULL DEFAULT 5,    -- máx de conversas simultâneas
  current_load        INTEGER     NOT NULL DEFAULT 0,
  last_active_at      TIMESTAMPTZ,

  -- Canais que este atendente atende
  handles_whatsapp    BOOLEAN     NOT NULL DEFAULT true,
  handles_instagram   BOOLEAN     NOT NULL DEFAULT false,
  handles_facebook    BOOLEAN     NOT NULL DEFAULT false,

  -- Filas e equipes
  teams               TEXT[]      DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_omni_agents_org    ON public.omni_agents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_omni_agents_load   ON public.omni_agents(organization_id, current_load) WHERE status = 'online';

DROP TRIGGER IF EXISTS trg_omni_agents_updated_at ON public.omni_agents;
CREATE TRIGGER trg_omni_agents_updated_at
  BEFORE UPDATE ON public.omni_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.omni_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "omni_agents_auth" ON public.omni_agents;
CREATE POLICY "omni_agents_auth" ON public.omni_agents FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_agents TO authenticated;

-- ── 5. Regras de distribuição de atendimentos ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.omni_distribution_rules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL DEFAULT 'Padrão',
  rule_type           TEXT        NOT NULL DEFAULT 'round_robin'
                      CHECK (rule_type IN ('round_robin','least_busy','manual','broadcast')),
  channel_type        omni_channel_type,    -- null = aplica a todos
  active              BOOLEAN     NOT NULL DEFAULT true,
  priority_order      INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.omni_distribution_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "omni_dist_auth" ON public.omni_distribution_rules;
CREATE POLICY "omni_dist_auth" ON public.omni_distribution_rules FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_distribution_rules TO authenticated;

-- ── 6. Tabela de handoff / transferências ─────────────────────────────────────
-- Registra cada transferência com o contexto completo da conversa.
-- Usada para gerar o resumo que o atendente recebe ao assumir.

CREATE TABLE IF NOT EXISTS public.omni_handoffs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id     UUID        NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,

  -- De quem transferiu (bot ou agente anterior)
  from_type           TEXT        NOT NULL CHECK (from_type IN ('bot','human','automation')),
  from_agent_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_team           TEXT,

  -- Para quem foi transferido
  to_agent_id         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_team             TEXT,

  -- Contexto da transferência
  reason              TEXT,        -- Por que foi transferido
  summary             TEXT,        -- Resumo automático da conversa até este ponto
  last_n_messages     JSONB,       -- Últimas N mensagens para contexto imediato
  customer_data       JSONB,       -- Dados do cliente extraídos pelo bot
  intent_detected     TEXT,        -- Intenção detectada pelo bot
  lead_score_at_transfer INTEGER,

  -- Resolução
  accepted_at         TIMESTAMPTZ,
  accepted_by_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omni_handoffs_conv ON public.omni_handoffs(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omni_handoffs_to   ON public.omni_handoffs(to_agent_id) WHERE accepted_at IS NULL;

ALTER TABLE public.omni_handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "omni_handoffs_auth" ON public.omni_handoffs;
CREATE POLICY "omni_handoffs_auth" ON public.omni_handoffs FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_handoffs TO authenticated;

-- ── 7. Timeline de eventos por conversa ───────────────────────────────────────
-- Registra ações no histórico (bot respondeu, transferido, lead criado, etc.)

CREATE TABLE IF NOT EXISTS public.omni_timeline_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id     UUID        NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,

  event_type          TEXT        NOT NULL,
  -- Exemplos: bot_responded, handoff_requested, agent_assigned, lead_created,
  --           deal_created, tag_added, sla_breached, conversation_closed,
  --           n8n_workflow_triggered, pipeline_changed

  actor_type          TEXT        CHECK (actor_type IN ('bot','human','system','n8n','automation')),
  actor_id            UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name          TEXT,

  metadata            JSONB       DEFAULT '{}',
  -- Dados livres: { reason, tag, pipeline, stage, lead_id, etc. }

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omni_timeline_conv ON public.omni_timeline_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omni_timeline_org  ON public.omni_timeline_events(organization_id, event_type, created_at DESC);

ALTER TABLE public.omni_timeline_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "omni_timeline_auth" ON public.omni_timeline_events;
CREATE POLICY "omni_timeline_auth" ON public.omni_timeline_events FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_timeline_events TO authenticated;

-- ── 8. RPC: get_conversation_summary ─────────────────────────────────────────
-- Retorna o contexto completo de uma conversa para o handoff:
-- últimas N mensagens, dados do contato, histórico de handoffs.

CREATE OR REPLACE FUNCTION public.get_conversation_summary(
  p_conversation_id UUID,
  p_last_n_messages INTEGER DEFAULT 20
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id UUID;
  v_conv   JSONB;
  v_msgs   JSONB;
  v_contact JSONB;
  v_handoffs JSONB;
  v_timeline JSONB;
BEGIN
  -- Verifica que o usuário tem acesso
  SELECT organization_id INTO v_org_id
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND OR v_org_id != get_user_organization_id() THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;

  -- Dados da conversa
  SELECT to_jsonb(c) INTO v_conv
  FROM public.whatsapp_conversations c
  WHERE id = p_conversation_id;

  -- Últimas N mensagens (mais recentes primeiro, depois invertidas)
  SELECT jsonb_agg(m ORDER BY m.created_at ASC) INTO v_msgs
  FROM (
    SELECT id, direction, content, sender_type, sender_agent_id,
           is_bot_response, message_type, media_url, created_at
    FROM public.whatsapp_messages
    WHERE conversation_id = p_conversation_id
    ORDER BY created_at DESC
    LIMIT p_last_n_messages
  ) m;

  -- Dados do contato
  SELECT to_jsonb(c) INTO v_contact
  FROM public.whatsapp_contacts c
  JOIN public.whatsapp_conversations conv ON conv.contact_id = c.id
  WHERE conv.id = p_conversation_id;

  -- Histórico de handoffs
  SELECT jsonb_agg(h ORDER BY h.created_at DESC) INTO v_handoffs
  FROM public.omni_handoffs h
  WHERE h.conversation_id = p_conversation_id
  LIMIT 5;

  -- Últimos 10 eventos da timeline
  SELECT jsonb_agg(e ORDER BY e.created_at DESC) INTO v_timeline
  FROM public.omni_timeline_events e
  WHERE e.conversation_id = p_conversation_id
  ORDER BY e.created_at DESC
  LIMIT 10;

  RETURN jsonb_build_object(
    'conversation',  v_conv,
    'messages',      COALESCE(v_msgs, '[]'::jsonb),
    'contact',       v_contact,
    'handoffs',      COALESCE(v_handoffs, '[]'::jsonb),
    'timeline',      COALESCE(v_timeline, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_summary TO authenticated;

-- ── 9. RPC: assign_conversation ───────────────────────────────────────────────
-- Atribui uma conversa a um atendente, cria o evento de timeline e
-- registra o handoff se veio do bot.

CREATE OR REPLACE FUNCTION public.assign_conversation(
  p_conversation_id UUID,
  p_agent_id        UUID,
  p_from_bot        BOOLEAN DEFAULT false,
  p_reason          TEXT DEFAULT NULL,
  p_summary         TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id UUID;
  v_prev_agent UUID;
  v_prev_status omni_conv_status;
BEGIN
  SELECT organization_id, assigned_agent_id, omni_status
  INTO v_org_id, v_prev_agent, v_prev_status
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'conversation_not_found'; END IF;

  -- Atualiza conversa
  UPDATE public.whatsapp_conversations
  SET assigned_agent_id = p_agent_id,
      omni_status       = 'human_active',
      handoff_at        = CASE WHEN p_from_bot THEN now() ELSE handoff_at END,
      handoff_summary   = COALESCE(p_summary, handoff_summary),
      updated_at        = now()
  WHERE id = p_conversation_id;

  -- Evento de timeline
  INSERT INTO public.omni_timeline_events(organization_id, conversation_id, event_type, actor_type, actor_id, metadata)
  VALUES (
    v_org_id, p_conversation_id,
    CASE WHEN p_from_bot THEN 'handoff_accepted' ELSE 'agent_assigned' END,
    'system', p_agent_id,
    jsonb_build_object('reason', p_reason, 'from_bot', p_from_bot, 'prev_agent_id', v_prev_agent)
  );

  -- Atualiza carga do atendente
  UPDATE public.omni_agents
  SET current_load = current_load + 1, last_active_at = now()
  WHERE organization_id = v_org_id AND profile_id = p_agent_id;

  -- Diminui carga do atendente anterior
  IF v_prev_agent IS NOT NULL AND v_prev_agent != p_agent_id THEN
    UPDATE public.omni_agents
    SET current_load = GREATEST(0, current_load - 1)
    WHERE organization_id = v_org_id AND profile_id = v_prev_agent;
  END IF;

  RETURN jsonb_build_object('success', true, 'conversation_id', p_conversation_id, 'agent_id', p_agent_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_conversation TO authenticated;

-- ── 10. Registra versão ───────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('104_omnichannel_agency', now())
ON CONFLICT (version) DO NOTHING;
