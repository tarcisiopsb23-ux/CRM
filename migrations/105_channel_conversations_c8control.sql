-- =============================================================================
-- Migration 105: Conversas e mensagens dos clientes do C8 Control (Banco A)
--
-- Tabelas criadas aqui são para os CLIENTES FINAIS dos tenants do C8 Control
-- (ex: clientes de um restaurante, loja, clínica) via WhatsApp/Instagram/Facebook.
--
-- Isolamento: client_id + organization_id em todas as tabelas.
-- Nomenclatura: prefixo "client_channel_*" para distinguir das tabelas da agência.
--
-- O que está aqui:
--   • client_channel_contacts   — contatos externos (cliente final de cada tenant)
--   • client_channel_conversations — conversas omnichannel por tenant
--   • client_channel_messages   — mensagens com histórico bot + humano
--   • client_channel_events     — idempotência e rastreio de webhooks Meta
--   • client_contact_identities — vínculo contato ↔ canal externo
-- =============================================================================

-- ── 1. Contatos externos dos clientes C8 ─────────────────────────────────────
-- Cada "contato" é o cliente final de um tenant C8 Control.

CREATE TABLE IF NOT EXISTS public.client_channel_contacts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identidade
  display_name        TEXT        NOT NULL DEFAULT 'Contato',
  phone               TEXT,
  email               TEXT,

  -- Metadados de enriquecimento
  tags                TEXT[]      DEFAULT '{}',
  notes               TEXT,
  metadata            JSONB       DEFAULT '{}',

  -- Vínculo com CRM do cliente
  crm_contact_id      UUID        REFERENCES public.client_crm_contacts(id) ON DELETE SET NULL,
  lead_id             UUID,       -- referência ao lead no CRM do cliente (sem FK por isolamento)

  -- Controle
  is_blocked          BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccc_client       ON public.client_channel_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_ccc_phone        ON public.client_channel_contacts(client_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ccc_crm          ON public.client_channel_contacts(crm_contact_id) WHERE crm_contact_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ccc_updated_at ON public.client_channel_contacts;
CREATE TRIGGER trg_ccc_updated_at
  BEFORE UPDATE ON public.client_channel_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_channel_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ccc_auth" ON public.client_channel_contacts;
CREATE POLICY "ccc_auth" ON public.client_channel_contacts FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_channel_contacts TO authenticated;

-- ── 2. Identidades de canal por contato ───────────────────────────────────────
-- Vincula um contato a seus identificadores externos por canal.
-- Permite que o mesmo contato use WhatsApp (phone), Instagram (ig_user_id) e Facebook.

CREATE TABLE IF NOT EXISTS public.client_contact_identities (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id          UUID        NOT NULL REFERENCES public.client_channel_contacts(id) ON DELETE CASCADE,

  channel_type        TEXT        NOT NULL
                      CHECK (channel_type IN ('whatsapp','instagram_dm','facebook_dm','instagram_comment','facebook_comment')),
  external_user_id    TEXT        NOT NULL,   -- phone (WA), ig_user_id, psid (FB)
  display_name        TEXT,                   -- nome no canal externo
  username            TEXT,                   -- @username (Instagram)
  metadata            JSONB       DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, channel_type, external_user_id)
);

CREATE INDEX IF NOT EXISTS idx_cci_lookup ON public.client_contact_identities(client_id, channel_type, external_user_id);

ALTER TABLE public.client_contact_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cci_auth" ON public.client_contact_identities;
CREATE POLICY "cci_auth" ON public.client_contact_identities FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contact_identities TO authenticated;

-- ── 3. Conversas omnichannel dos clientes C8 ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_channel_conversations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Canal e conexão Meta
  channel_type        TEXT        NOT NULL
                      CHECK (channel_type IN ('whatsapp','instagram_dm','facebook_dm','instagram_comment','facebook_comment')),
  meta_connection_id  UUID        REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  external_account_id TEXT,        -- waba_id, instagram_account_id, page_id

  -- Contato
  contact_id          UUID        REFERENCES public.client_channel_contacts(id) ON DELETE SET NULL,

  -- Estado da conversa
  status              TEXT        NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','bot_active','waiting_human','human_active','waiting_customer','resolved','closed')),
  priority            TEXT        NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low','medium','high','urgent')),
  sentiment           TEXT        NOT NULL DEFAULT 'neutral'
                      CHECK (sentiment IN ('positive','neutral','negative')),
  lead_score          INTEGER     NOT NULL DEFAULT 50 CHECK (lead_score BETWEEN 0 AND 100),
  tags                TEXT[]      DEFAULT '{}',
  is_vip              BOOLEAN     NOT NULL DEFAULT false,

  -- Atendimento
  assigned_agent_id   UUID        REFERENCES public.client_crm_users(id) ON DELETE SET NULL,
  -- Nota: client_crm_users não tem FK real (sem UUID FK cross-table) — armazenamos como UUID
  assigned_team       TEXT,

  -- Bot
  bot_active          BOOLEAN     NOT NULL DEFAULT true,
  bot_context         JSONB       DEFAULT '{}',
  bot_session_id      TEXT,

  -- SLA
  sla_limit_mins      INTEGER     DEFAULT 60,
  sla_started_at      TIMESTAMPTZ,
  sla_breached        BOOLEAN     NOT NULL DEFAULT false,

  -- Handoff
  handoff_summary     TEXT,       -- resumo gerado ao transferir para humano
  handoff_at          TIMESTAMPTZ,

  -- Timestamps de controle
  last_message_at     TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cconv_client       ON public.client_channel_conversations(client_id, status);
CREATE INDEX IF NOT EXISTS idx_cconv_channel      ON public.client_channel_conversations(client_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_cconv_contact      ON public.client_channel_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_cconv_agent        ON public.client_channel_conversations(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cconv_meta_conn    ON public.client_channel_conversations(meta_connection_id) WHERE meta_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cconv_last_msg     ON public.client_channel_conversations(client_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_cconv_sla          ON public.client_channel_conversations(sla_started_at) WHERE sla_breached = false AND status NOT IN ('resolved','closed');

DROP TRIGGER IF EXISTS trg_cconv_updated_at ON public.client_channel_conversations;
CREATE TRIGGER trg_cconv_updated_at
  BEFORE UPDATE ON public.client_channel_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_channel_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cconv_auth" ON public.client_channel_conversations;
CREATE POLICY "cconv_auth" ON public.client_channel_conversations FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_channel_conversations TO authenticated;

-- ── 4. Mensagens das conversas dos clientes C8 ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_channel_messages (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id     UUID        NOT NULL REFERENCES public.client_channel_conversations(id) ON DELETE CASCADE,

  -- Identificação externa (idempotência)
  external_message_id TEXT,       -- ID da mensagem na Meta API

  -- Direção e remetente
  direction           TEXT        NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_type         TEXT        NOT NULL DEFAULT 'customer'
                      CHECK (sender_type IN ('customer','bot','human','system','automation')),
  sender_agent_id     TEXT,       -- UUID do crm_user (sem FK para simplificar isolamento)
  sender_name         TEXT,

  -- Conteúdo
  channel_type        TEXT        NOT NULL
                      CHECK (channel_type IN ('whatsapp','instagram_dm','facebook_dm','instagram_comment','facebook_comment')),
  message_type        TEXT        NOT NULL DEFAULT 'text'
                      CHECK (message_type IN ('text','image','video','audio','document','sticker','reaction','template','interactive','comment')),
  content             TEXT,
  media_url           TEXT,
  media_type          TEXT,
  media_caption       TEXT,

  -- Template WhatsApp
  template_name       TEXT,
  template_params     JSONB,

  -- Status de entrega
  delivery_status     TEXT        NOT NULL DEFAULT 'sent'
                      CHECK (delivery_status IN ('pending','sent','delivered','read','failed')),
  error_message       TEXT,

  -- Referências
  reply_to_id         UUID        REFERENCES public.client_channel_messages(id) ON DELETE SET NULL,
  n8n_execution_id    TEXT,

  -- Metadados Meta (timestamp original, etc.)
  meta_timestamp      BIGINT,
  metadata            JSONB       DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (client_id, external_message_id) -- idempotência por cliente
);

CREATE INDEX IF NOT EXISTS idx_cmsg_conv         ON public.client_channel_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmsg_ext_id       ON public.client_channel_messages(client_id, external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmsg_sender       ON public.client_channel_messages(conversation_id, sender_type);
CREATE INDEX IF NOT EXISTS idx_cmsg_status       ON public.client_channel_messages(delivery_status) WHERE delivery_status IN ('pending','failed');

-- Trigger para atualizar last_message_at na conversa
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.client_channel_conversations
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cmsg_update_conv ON public.client_channel_messages;
CREATE TRIGGER trg_cmsg_update_conv
  AFTER INSERT ON public.client_channel_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

ALTER TABLE public.client_channel_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cmsg_auth" ON public.client_channel_messages;
CREATE POLICY "cmsg_auth" ON public.client_channel_messages FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_channel_messages TO authenticated;

-- ── 5. Idempotência de webhooks Meta ──────────────────────────────────────────
-- Garante que o mesmo evento Meta não seja processado duas vezes.

CREATE TABLE IF NOT EXISTS public.client_channel_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meta_connection_id  UUID        REFERENCES public.meta_connections(id) ON DELETE SET NULL,

  -- Identificação única do evento na Meta
  external_event_id   TEXT        NOT NULL,
  channel_type        TEXT        NOT NULL,
  event_type          TEXT        NOT NULL,   -- message, comment, reaction, etc.

  -- Payload original (para reprocessamento se necessário)
  raw_payload         JSONB       NOT NULL DEFAULT '{}',

  -- Processamento
  processed_at        TIMESTAMPTZ,
  processing_status   TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (processing_status IN ('pending','processed','failed','skipped')),
  error_message       TEXT,
  n8n_execution_id    TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (client_id, channel_type, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_cevt_lookup    ON public.client_channel_events(client_id, channel_type, external_event_id);
CREATE INDEX IF NOT EXISTS idx_cevt_pending   ON public.client_channel_events(processing_status, created_at) WHERE processing_status = 'pending';

ALTER TABLE public.client_channel_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cevt_auth" ON public.client_channel_events;
CREATE POLICY "cevt_auth" ON public.client_channel_events FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_channel_events TO authenticated;

-- ── 6. Handoffs dos clientes C8 ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_channel_handoffs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id     UUID        NOT NULL REFERENCES public.client_channel_conversations(id) ON DELETE CASCADE,

  from_type           TEXT        NOT NULL CHECK (from_type IN ('bot','human','automation')),
  from_agent_id       TEXT,       -- UUID do crm_user que transferiu (string para flexibilidade)

  to_agent_id         TEXT,       -- UUID do crm_user destino
  to_team             TEXT,

  reason              TEXT,
  summary             TEXT,       -- Resumo da conversa até o handoff
  last_n_messages     JSONB,      -- Últimas mensagens para contexto
  customer_data       JSONB,      -- Dados extraídos do cliente
  intent_detected     TEXT,
  lead_score_at_transfer INTEGER,

  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chandoff_conv ON public.client_channel_handoffs(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chandoff_to   ON public.client_channel_handoffs(to_agent_id) WHERE accepted_at IS NULL;

ALTER TABLE public.client_channel_handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chandoff_auth" ON public.client_channel_handoffs;
CREATE POLICY "chandoff_auth" ON public.client_channel_handoffs FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_channel_handoffs TO authenticated;

-- ── 7. Timeline de eventos dos clientes C8 ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_channel_timeline (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id     UUID        NOT NULL REFERENCES public.client_channel_conversations(id) ON DELETE CASCADE,

  event_type          TEXT        NOT NULL,
  actor_type          TEXT        CHECK (actor_type IN ('bot','human','system','n8n','automation')),
  actor_id            TEXT,
  actor_name          TEXT,
  metadata            JSONB       DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctimeline_conv ON public.client_channel_timeline(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ctimeline_org  ON public.client_channel_timeline(client_id, event_type);

ALTER TABLE public.client_channel_timeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctimeline_auth" ON public.client_channel_timeline;
CREATE POLICY "ctimeline_auth" ON public.client_channel_timeline FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_channel_timeline TO authenticated;

-- ── 8. RPC: get_client_conversation_summary ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_client_conversation_summary(
  p_conversation_id UUID,
  p_last_n_messages INTEGER DEFAULT 20
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id   UUID;
  v_conv     JSONB;
  v_msgs     JSONB;
  v_contact  JSONB;
  v_handoffs JSONB;
  v_timeline JSONB;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.client_channel_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND OR v_org_id != get_user_organization_id() THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;

  SELECT to_jsonb(c) INTO v_conv
  FROM public.client_channel_conversations c
  WHERE id = p_conversation_id;

  SELECT jsonb_agg(m ORDER BY m.created_at ASC) INTO v_msgs
  FROM (
    SELECT id, direction, content, sender_type, sender_agent_id,
           sender_name, message_type, media_url, created_at
    FROM public.client_channel_messages
    WHERE conversation_id = p_conversation_id
    ORDER BY created_at DESC
    LIMIT p_last_n_messages
  ) m;

  SELECT to_jsonb(c) INTO v_contact
  FROM public.client_channel_contacts c
  JOIN public.client_channel_conversations conv ON conv.contact_id = c.id
  WHERE conv.id = p_conversation_id;

  SELECT jsonb_agg(h ORDER BY h.created_at DESC) INTO v_handoffs
  FROM public.client_channel_handoffs h
  WHERE h.conversation_id = p_conversation_id LIMIT 5;

  SELECT jsonb_agg(e ORDER BY e.created_at DESC) INTO v_timeline
  FROM public.client_channel_timeline e
  WHERE e.conversation_id = p_conversation_id LIMIT 10;

  RETURN jsonb_build_object(
    'conversation', v_conv,
    'messages',     COALESCE(v_msgs, '[]'::jsonb),
    'contact',      v_contact,
    'handoffs',     COALESCE(v_handoffs, '[]'::jsonb),
    'timeline',     COALESCE(v_timeline, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_conversation_summary TO authenticated;

-- ── 9. Registra versão ────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('105_channel_conversations_c8control', now())
ON CONFLICT (version) DO NOTHING;
