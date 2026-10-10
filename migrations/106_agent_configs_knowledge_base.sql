-- =============================================================================
-- Migration 106: Agent Configs + Knowledge Base estruturada por client_id
--
-- Expande client_ai_settings para agent_configs completo com:
--   • Identidade, personalidade, objetivo, instruções e comportamentos
--   • Knowledge base estruturada (FAQ, políticas, serviços, horários)
--   • Regras de bot (palavras-chave, gatilhos, respostas rápidas)
--   • Templates de mensagem WhatsApp por cliente
-- =============================================================================

-- ── 1. agent_configs ──────────────────────────────────────────────────────────
-- Evolução do client_ai_settings — configuração completa do agente IA por cliente.

CREATE TABLE IF NOT EXISTS public.agent_configs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Toggle global (migrado de client_ai_settings.bot_active)
  is_active           BOOLEAN     NOT NULL DEFAULT true,

  -- Identidade
  agent_name          TEXT        NOT NULL DEFAULT 'Assistente',
  agent_role          TEXT        NOT NULL DEFAULT 'Atendimento ao cliente',
  agent_description   TEXT,

  -- Personalidade
  tone                TEXT        NOT NULL DEFAULT 'amigavel'
                      CHECK (tone IN ('amigavel','profissional','descontraido','tecnico')),
  formality           INTEGER     NOT NULL DEFAULT 3 CHECK (formality BETWEEN 1 AND 5),
  use_emojis          BOOLEAN     NOT NULL DEFAULT false,
  response_length     TEXT        NOT NULL DEFAULT 'medio'
                      CHECK (response_length IN ('curto','medio','longo')),

  -- Objetivo principal
  objective           TEXT        NOT NULL DEFAULT 'atendimento'
                      CHECK (objective IN ('atendimento','qualificacao','vendas','agendamento','suporte','personalizado')),

  -- Instruções livres (prompt personalizado)
  instructions        TEXT,

  -- Comportamentos habilitados
  behavior_use_knowledge BOOLEAN  NOT NULL DEFAULT true,   -- consultar base de conhecimento
  behavior_collect_data BOOLEAN   NOT NULL DEFAULT true,   -- coletar dados do contato
  behavior_update_crm  BOOLEAN    NOT NULL DEFAULT false,  -- atualizar CRM
  behavior_create_deal BOOLEAN    NOT NULL DEFAULT false,  -- criar oportunidade
  behavior_handoff     BOOLEAN    NOT NULL DEFAULT true,   -- transferir para humano

  -- Regras de horário
  respond_outside_hours BOOLEAN   NOT NULL DEFAULT false,  -- responder fora do horário?
  outside_hours_message TEXT,

  -- Handoff automático
  handoff_keywords    TEXT[]      DEFAULT '{}',            -- palavras que disparam handoff
  handoff_after_mins  INTEGER     DEFAULT NULL,            -- handoff após N minutos sem resposta humana

  -- Canais que o bot atende
  handles_whatsapp    BOOLEAN     NOT NULL DEFAULT true,
  handles_instagram   BOOLEAN     NOT NULL DEFAULT false,
  handles_facebook    BOOLEAN     NOT NULL DEFAULT false,
  handles_comments    BOOLEAN     NOT NULL DEFAULT false,  -- responder comentários

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_client ON public.agent_configs(client_id);

DROP TRIGGER IF EXISTS trg_agent_configs_updated_at ON public.agent_configs;
CREATE TRIGGER trg_agent_configs_updated_at
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_configs_auth" ON public.agent_configs;
CREATE POLICY "agent_configs_auth" ON public.agent_configs FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_configs TO authenticated;

-- ── 2. Knowledge Base: FAQ ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_knowledge_faqs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  question            TEXT        NOT NULL,
  answer              TEXT        NOT NULL,
  keywords            TEXT[]      DEFAULT '{}',   -- palavras para matching
  category            TEXT,
  priority            INTEGER     NOT NULL DEFAULT 0,
  active              BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kfaq_client ON public.client_knowledge_faqs(client_id, active);

DROP TRIGGER IF EXISTS trg_kfaq_updated_at ON public.client_knowledge_faqs;
CREATE TRIGGER trg_kfaq_updated_at BEFORE UPDATE ON public.client_knowledge_faqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_knowledge_faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kfaq_auth" ON public.client_knowledge_faqs;
CREATE POLICY "kfaq_auth" ON public.client_knowledge_faqs FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_knowledge_faqs TO authenticated;

-- ── 3. Knowledge Base: Políticas ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_knowledge_policies (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  content             TEXT        NOT NULL,
  policy_type         TEXT        NOT NULL DEFAULT 'geral'
                      CHECK (policy_type IN ('devolucao','entrega','pagamento','privacidade','cancelamento','geral')),
  active              BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpol_client ON public.client_knowledge_policies(client_id, active);

DROP TRIGGER IF EXISTS trg_kpol_updated_at ON public.client_knowledge_policies;
CREATE TRIGGER trg_kpol_updated_at BEFORE UPDATE ON public.client_knowledge_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_knowledge_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kpol_auth" ON public.client_knowledge_policies;
CREATE POLICY "kpol_auth" ON public.client_knowledge_policies FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_knowledge_policies TO authenticated;

-- ── 4. Knowledge Base: Serviços/Produtos ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_knowledge_services (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  description         TEXT        NOT NULL,
  price_info          TEXT,        -- Texto livre: "A partir de R$ 50" ou "Sob consulta"
  duration_info       TEXT,        -- "30 minutos", "1 hora"
  availability        TEXT,        -- Disponibilidade em texto livre
  category            TEXT,
  keywords            TEXT[]      DEFAULT '{}',
  active              BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ksvc_client ON public.client_knowledge_services(client_id, active);

DROP TRIGGER IF EXISTS trg_ksvc_updated_at ON public.client_knowledge_services;
CREATE TRIGGER trg_ksvc_updated_at BEFORE UPDATE ON public.client_knowledge_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_knowledge_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ksvc_auth" ON public.client_knowledge_services;
CREATE POLICY "ksvc_auth" ON public.client_knowledge_services FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_knowledge_services TO authenticated;

-- ── 5. Knowledge Base: Horários de Funcionamento ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_knowledge_schedules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day_of_week         INTEGER     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Dom, 1=Seg...
  opens_at            TIME,
  closes_at           TIME,
  is_closed           BOOLEAN     NOT NULL DEFAULT false,
  notes               TEXT,       -- Ex: "Fechado no feriado"
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_ksched_client ON public.client_knowledge_schedules(client_id);

DROP TRIGGER IF EXISTS trg_ksched_updated_at ON public.client_knowledge_schedules;
CREATE TRIGGER trg_ksched_updated_at BEFORE UPDATE ON public.client_knowledge_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_knowledge_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ksched_auth" ON public.client_knowledge_schedules;
CREATE POLICY "ksched_auth" ON public.client_knowledge_schedules FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_knowledge_schedules TO authenticated;

-- ── 6. Templates de Mensagem WhatsApp ─────────────────────────────────────────
-- Templates aprovados pela Meta para uso no WhatsApp Business.

CREATE TABLE IF NOT EXISTS public.client_message_templates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  name                TEXT        NOT NULL,              -- nome interno
  meta_template_name  TEXT,                              -- nome no Meta (para API)
  category            TEXT        NOT NULL DEFAULT 'UTILITY'
                      CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  language            TEXT        NOT NULL DEFAULT 'pt_BR',

  -- Conteúdo
  header_type         TEXT        CHECK (header_type IN ('TEXT','IMAGE','VIDEO','DOCUMENT')),
  header_content      TEXT,
  body                TEXT        NOT NULL,
  footer              TEXT,

  -- Variáveis mapeadas: { "1": "nome_do_contato", "2": "valor" }
  variables_mapping   JSONB       DEFAULT '{}',

  -- Status
  status              TEXT        NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','pending_approval','approved','rejected')),
  active              BOOLEAN     NOT NULL DEFAULT true,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ktpl_client ON public.client_message_templates(client_id, status);

DROP TRIGGER IF EXISTS trg_ktpl_updated_at ON public.client_message_templates;
CREATE TRIGGER trg_ktpl_updated_at BEFORE UPDATE ON public.client_message_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.client_message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ktpl_auth" ON public.client_message_templates;
CREATE POLICY "ktpl_auth" ON public.client_message_templates FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_message_templates TO authenticated;

-- ── 7. Respostas Rápidas ───────────────────────────────────────────────────────
-- Atalhos que os atendentes humanos podem usar durante o chat.

CREATE TABLE IF NOT EXISTS public.client_quick_replies (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shortcut            TEXT        NOT NULL,   -- Ex: "/ola", "/preco"
  content             TEXT        NOT NULL,
  category            TEXT,
  active              BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, shortcut)
);

CREATE INDEX IF NOT EXISTS idx_qr_client ON public.client_quick_replies(client_id, active);

ALTER TABLE public.client_quick_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qr_auth" ON public.client_quick_replies;
CREATE POLICY "qr_auth" ON public.client_quick_replies FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_quick_replies TO authenticated;

-- ── 8. RPC: get_client_knowledge_context ──────────────────────────────────────
-- Retorna todo o contexto de conhecimento de um cliente para o n8n/bot.
-- Usado pelo n8n ao montar o prompt para o LLM.

CREATE OR REPLACE FUNCTION public.get_client_knowledge_context(p_client_id UUID)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_org_id    UUID;
  v_agent     JSONB;
  v_faqs      JSONB;
  v_policies  JSONB;
  v_services  JSONB;
  v_schedules JSONB;
  v_ai_cfg    JSONB;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  -- agent_configs
  SELECT to_jsonb(a) INTO v_agent
  FROM public.agent_configs a
  WHERE client_id = p_client_id AND is_active = true;

  -- FAQs ativas
  SELECT jsonb_agg(f ORDER BY f.priority DESC, f.created_at) INTO v_faqs
  FROM public.client_knowledge_faqs f
  WHERE client_id = p_client_id AND active = true;

  -- Políticas ativas
  SELECT jsonb_agg(p) INTO v_policies
  FROM public.client_knowledge_policies p
  WHERE client_id = p_client_id AND active = true;

  -- Serviços ativos
  SELECT jsonb_agg(s) INTO v_services
  FROM public.client_knowledge_services s
  WHERE client_id = p_client_id AND active = true;

  -- Horários
  SELECT jsonb_agg(h ORDER BY h.day_of_week) INTO v_schedules
  FROM public.client_knowledge_schedules h
  WHERE client_id = p_client_id;

  -- client_ai_settings como fallback de configuração básica
  SELECT jsonb_build_object(
    'establishment_name', establishment_name,
    'welcome_message',    welcome_message,
    'opening_hours',      opening_hours,
    'bot_active',         bot_active,
    'auto_reply_24h',     auto_reply_24h,
    'forward_to_human',   forward_to_human
  ) INTO v_ai_cfg
  FROM public.client_ai_settings
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object(
    'client_id',    p_client_id,
    'agent',        v_agent,
    'ai_settings',  v_ai_cfg,
    'faqs',         COALESCE(v_faqs,      '[]'::jsonb),
    'policies',     COALESCE(v_policies,  '[]'::jsonb),
    'services',     COALESCE(v_services,  '[]'::jsonb),
    'schedules',    COALESCE(v_schedules, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_knowledge_context TO authenticated;

-- ── 9. Registra versão ────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('106_agent_configs_knowledge_base', now())
ON CONFLICT (version) DO NOTHING;
