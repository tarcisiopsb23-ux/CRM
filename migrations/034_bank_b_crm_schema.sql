-- ============================================================
-- Migration 034: Schema CRM completo para o Banco B (Supabase do cliente)
-- Execute no Supabase de CADA CLIENTE, não no CRM da agência
-- Versão: 034 — Fase 1 Fundação
-- ============================================================

-- ── Controle de versão ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: não reaplica se já executado
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '034') THEN
    RAISE NOTICE 'Migration 034 já aplicada. Ignorando.';
    RETURN;
  END IF;
END $$;

-- ── Usuários do dashboard (espelho do Supabase Auth do Banco B) ───────────────
-- Sincronizado via trigger no auth.users do Banco B
CREATE TABLE IF NOT EXISTS public.crm_users (
  id          UUID        PRIMARY KEY,           -- mesmo id do auth.users
  client_id   TEXT        NOT NULL,              -- slug ou UUID do cliente no Banco A
  email       TEXT        NOT NULL,
  full_name   TEXT,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner','admin','manager','member','viewer')),
  avatar_url  TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Contatos do CRM ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  phone       TEXT,
  email       TEXT,
  source      TEXT,                              -- whatsapp, instagram, manual, import, etc.
  tags        TEXT[]      DEFAULT '{}',
  notes       TEXT,
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Produtos e serviços ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  description TEXT,
  price       NUMERIC(12,2) DEFAULT 0,
  unit        TEXT        DEFAULT 'unidade',
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Etapas do funil de vendas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  "order"     INTEGER     NOT NULL DEFAULT 0,
  color       TEXT        NOT NULL DEFAULT '#6366f1',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Negociações (deals) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_deals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT        NOT NULL,
  contact_id  UUID        REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  product_id  UUID        REFERENCES public.crm_products(id) ON DELETE SET NULL,
  stage_id    UUID        REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  title       TEXT,
  value       NUMERIC(12,2) DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','won','lost')),
  notes       TEXT,
  expected_close_date DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Sessões WhatsApp (metadados apenas — token fica no VPS) ──────────────────
CREATE TABLE IF NOT EXISTS public.crm_whatsapp_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT        NOT NULL,
  phone_number    TEXT,
  session_status  TEXT        NOT NULL DEFAULT 'disconnected'
                              CHECK (session_status IN ('connected','disconnected','connecting','qr_pending')),
  connected_at    TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Lembretes rápidos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_reminders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT        NOT NULL,
  text        TEXT        NOT NULL,
  due_date    TIMESTAMPTZ,
  completed   BOOLEAN     NOT NULL DEFAULT false,
  created_by  UUID        REFERENCES public.crm_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices de performance ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crm_users_client_id       ON public.crm_users(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_client_id    ON public.crm_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone        ON public.crm_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_crm_products_client_id    ON public.crm_products(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_client_id    ON public.crm_pipeline_stages(client_id, "order");
CREATE INDEX IF NOT EXISTS idx_crm_deals_client_id       ON public.crm_deals(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_id        ON public.crm_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status          ON public.crm_deals(status);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_client_id    ON public.crm_whatsapp_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_reminders_client_id    ON public.ai_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_reminders_due_date     ON public.ai_reminders(due_date) WHERE NOT completed;

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.crm_users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_stages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reminders          ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: leitura e escrita autenticada (isolamento por JWT)
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_users','crm_contacts','crm_products',
    'crm_pipeline_stages','crm_deals','crm_whatsapp_sessions','ai_reminders'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_access" ON public.%I
       FOR ALL TO authenticated
       USING (true) WITH CHECK (true)',
      t
    );
    -- Sem acesso anônimo a dados do CRM
    EXECUTE format('DROP POLICY IF EXISTS "no_anon_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "no_anon_access" ON public.%I
       FOR ALL TO anon USING (false)',
      t
    );
  END LOOP;
END $$;

-- schema_migrations: leitura pública, escrita autenticada
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_migrations"  ON public.schema_migrations;
DROP POLICY IF EXISTS "write_migrations" ON public.schema_migrations;
CREATE POLICY "read_migrations"  ON public.schema_migrations FOR SELECT USING (true);
CREATE POLICY "write_migrations" ON public.schema_migrations FOR INSERT TO authenticated WITH CHECK (true);

-- ── Estágios padrão do pipeline (seed condicional) ────────────────────────────
-- Criados apenas se a tabela estiver vazia para este client_id
-- (executado separadamente pelo C8 Control ao provisionar o cliente)

-- ── Trigger: atualiza updated_at automaticamente ──────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_users','crm_contacts','crm_products','crm_deals',
    'crm_whatsapp_sessions','ai_reminders'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ── Registra versão aplicada ──────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version) VALUES ('034')
ON CONFLICT (version) DO NOTHING;
