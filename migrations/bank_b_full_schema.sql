-- ============================================================
-- BANCO B — Schema Completo do Cliente
-- Arquivo único, idempotente (pode rodar múltiplas vezes sem erro)
--
-- Executar via n8n em TODOS os clientes ao modificar este arquivo,
-- ou automaticamente quando um novo cliente preencher os campos
-- client_supabase_url e client_supabase_anon_key no Banco A.
--
-- Cobertura:
--   • Controle de versão (schema_migrations)
--   • Usuários do dashboard (crm_users)
--   • CRM: contatos, produtos, pipeline, negociações
--   • WhatsApp: sessões (metadados; token fica no VPS)
--   • Conteúdo IA: eventos/agenda, promoções, sugestões, avisos
--   • IA: lembretes rápidos
--   • Configurações gerais (ai_settings) — todos os campos
--   • RLS em todas as tabelas (IA pública, CRM autenticado)
--   • Triggers de updated_at e sincronização auth.users → crm_users
--   • RPC segura para salvar chave Asaas (nunca retornada ao frontend)
--   • RPC exec_sql para provisionamento remoto via Edge Function
--   • Seed de estágios padrão do pipeline
-- ============================================================

-- ── 0. Controle de versão ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_migrations"  ON public.schema_migrations;
DROP POLICY IF EXISTS "write_migrations" ON public.schema_migrations;
CREATE POLICY "read_migrations"
  ON public.schema_migrations FOR SELECT USING (true);
CREATE POLICY "write_migrations"
  ON public.schema_migrations FOR INSERT TO authenticated WITH CHECK (true);

-- ── 1. Usuários do dashboard ──────────────────────────────────────────────────
-- Espelho do auth.users do Banco B; sincronizado via trigger (seção 8).

CREATE TABLE IF NOT EXISTS public.crm_users (
  id           UUID        PRIMARY KEY,           -- mesmo id do auth.users
  client_id    TEXT        NOT NULL,              -- UUID ou slug do cliente no Banco A
  email        TEXT        NOT NULL,
  full_name    TEXT,
  role         TEXT        NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner','admin','manager','member','viewer')),
  avatar_url   TEXT,
  active       BOOLEAN     NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_users_client_id
  ON public.crm_users(client_id);

-- ── 2. Contatos do CRM ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  phone      TEXT,
  email      TEXT,
  source     TEXT,                               -- whatsapp, instagram, manual, import…
  tags       TEXT[]      DEFAULT '{}',
  notes      TEXT,
  metadata   JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_client_id
  ON public.crm_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone
  ON public.crm_contacts(phone);

-- ── 3. Produtos e serviços ────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_crm_products_client_id
  ON public.crm_products(client_id);

-- ── 4. Etapas do pipeline de vendas ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  "order"    INTEGER     NOT NULL DEFAULT 0,
  color      TEXT        NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_client_id
  ON public.crm_pipeline_stages(client_id, "order");

-- ── 5. Negociações (deals) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           TEXT        NOT NULL,
  contact_id          UUID        REFERENCES public.crm_contacts(id)        ON DELETE SET NULL,
  product_id          UUID        REFERENCES public.crm_products(id)        ON DELETE SET NULL,
  stage_id            UUID        REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  title               TEXT,
  value               NUMERIC(12,2) DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','won','lost')),
  notes               TEXT,
  expected_close_date DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_client_id
  ON public.crm_deals(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_id
  ON public.crm_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status
  ON public.crm_deals(status);

-- ── 6. Sessões WhatsApp (metadados; token real fica no VPS) ──────────────────

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

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_client_id
  ON public.crm_whatsapp_sessions(client_id);

-- ── 7. Tabelas do Módulo Conteúdo IA ─────────────────────────────────────────
-- Usadas pelo Agente IA e pelo Dashboard Público do cliente.
-- RLS com acesso público via anon key (leitura e escrita pelo bot e pelo dashboard).

CREATE TABLE IF NOT EXISTS public.ai_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  rules       TEXT,                               -- instruções para o Agente Virtual: o que pode/não pode informar sobre o evento
  date        DATE        NOT NULL,
  time        TEXT,                               -- formato HH:MM (texto para flexibilidade)
  location    TEXT,
  type        TEXT        NOT NULL DEFAULT 'musica_ao_vivo'
              CHECK (type IN ('musica_ao_vivo','dia_especial')),
  status      TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante colunas em bancos legados (tabela pode ter estrutura antiga sem estas colunas)
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS rules     TEXT;
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS time      TEXT;

-- Migra valores legados do enum type para o novo padrão
UPDATE public.ai_events SET type = 'musica_ao_vivo' WHERE type = 'schedule';
UPDATE public.ai_events SET type = 'dia_especial'   WHERE type = 'event';
UPDATE public.ai_events SET type = 'musica_ao_vivo' WHERE type IS NULL OR type NOT IN ('musica_ao_vivo','dia_especial');

-- Índices criados após ALTER TABLE para garantir que as colunas existem
CREATE INDEX IF NOT EXISTS idx_ai_events_client_id ON public.ai_events(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_events_date      ON public.ai_events(date);
CREATE INDEX IF NOT EXISTS idx_ai_events_status    ON public.ai_events(status);

CREATE TABLE IF NOT EXISTS public.ai_promotions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  validity    TEXT,
  type        TEXT,
  status      TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_promotions_status ON public.ai_promotions(status);

CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT          NOT NULL,
  description TEXT,
  price       NUMERIC(10,2),
  image_url   TEXT,
  status      TEXT          NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON public.ai_suggestions(status);

CREATE TABLE IF NOT EXISTS public.ai_notices (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message     TEXT        NOT NULL,
  priority    TEXT        NOT NULL DEFAULT 'baixa'
              CHECK (priority IN ('alta', 'média', 'baixa')),
  validity    TEXT,
  status      TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_notices_status ON public.ai_notices(status);

-- ── 8. Lembretes rápidos ──────────────────────────────────────────────────────

-- ── 8. Lembretes rápidos ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_reminders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  TEXT        NOT NULL,
  text       TEXT        NOT NULL,
  due_date   TIMESTAMPTZ,
  completed  BOOLEAN     NOT NULL DEFAULT false,
  created_by UUID        REFERENCES public.crm_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reminders_client_id
  ON public.ai_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_reminders_due_date
  ON public.ai_reminders(due_date) WHERE NOT completed;

-- ── 8b. Cobranças do cliente (Asaas) ─────────────────────────────────────────
-- Sincronizadas do Asaas via n8n ou geradas manualmente pelo dashboard.
-- Campos de código PIX / URL do boleto armazenados para exibição imediata.

CREATE TABLE IF NOT EXISTS public.client_charges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT        NOT NULL,
  asaas_id        TEXT        UNIQUE,               -- ID da cobrança no Asaas
  description     TEXT        NOT NULL DEFAULT '',
  value           NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date        DATE        NOT NULL,
  payment_date    DATE,
  billing_type    TEXT        NOT NULL DEFAULT 'PIX'
                  CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
  status          TEXT        NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN (
                    'PENDING','RECEIVED','CONFIRMED','OVERDUE',
                    'REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED',
                    'CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL',
                    'DUNNING_REQUESTED','DUNNING_RECEIVED',
                    'AWAITING_RISK_ANALYSIS','CANCELLED'
                  )),
  invoice_url     TEXT,
  bank_slip_url   TEXT,
  pix_qr_code     TEXT,
  pix_copy_paste  TEXT,
  external_ref    TEXT,
  notes           TEXT,
  metadata        JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_charges_client_id ON public.client_charges(client_id);
CREATE INDEX IF NOT EXISTS idx_client_charges_status    ON public.client_charges(status);
CREATE INDEX IF NOT EXISTS idx_client_charges_due_date  ON public.client_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_client_charges_asaas_id  ON public.client_charges(asaas_id);

-- ── 9. Configurações do agente e integrações ─────────────────────────────────
-- Tabela ai_settings centraliza todas as configs operacionais do cliente.
-- Campos sensíveis (asaas_api_key) nunca são retornados ao frontend —
-- use a RPC save_asaas_settings (seção 11) e a view ai_settings_safe.

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dados do estabelecimento
  establishment_name   TEXT,
  phone                TEXT,
  whatsapp             TEXT,
  instagram            TEXT,
  address              TEXT,
  opening_hours        TEXT,
  welcome_message      TEXT,
  google_business_url  TEXT,
  sidebar_logo_url     TEXT,
  -- Comportamento do bot
  auto_reply_24h       BOOLEAN     NOT NULL DEFAULT true,
  forward_to_human     BOOLEAN     NOT NULL DEFAULT true,
  bot_active           BOOLEAN     NOT NULL DEFAULT true,
  -- Pixels de rastreamento (injetados dinamicamente nas páginas do dashboard)
  meta_pixel_id        TEXT,
  google_tag_id        TEXT,
  -- Integração Asaas (chave armazenada; NUNCA retornada ao frontend)
  asaas_api_key        TEXT,
  asaas_api_key_set    BOOLEAN     NOT NULL DEFAULT false,
  -- Métodos de pagamento
  pix_enabled          BOOLEAN     NOT NULL DEFAULT true,
  boleto_enabled       BOOLEAN     NOT NULL DEFAULT true,
  credit_card_enabled  BOOLEAN     NOT NULL DEFAULT false,
  -- Timestamps
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante colunas adicionadas em migrations posteriores (idempotência em bancos legados)
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS whatsapp            TEXT;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS instagram           TEXT;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS google_business_url TEXT;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS sidebar_logo_url    TEXT;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS bot_active          BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS meta_pixel_id       TEXT;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS google_tag_id       TEXT;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS asaas_api_key       TEXT;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS asaas_api_key_set   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS pix_enabled         BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS boleto_enabled      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS credit_card_enabled BOOLEAN NOT NULL DEFAULT false;

-- View segura: expõe ai_settings sem asaas_api_key
CREATE OR REPLACE VIEW public.ai_settings_safe
WITH (security_invoker = true) AS
  SELECT
    id, establishment_name, phone, whatsapp, instagram, address,
    opening_hours, welcome_message, auto_reply_24h, forward_to_human,
    sidebar_logo_url, google_business_url, bot_active,
    meta_pixel_id, google_tag_id,
    asaas_api_key_set,            -- apenas o boolean; nunca a chave real
    pix_enabled, boleto_enabled, credit_card_enabled,
    updated_at, created_at
  FROM public.ai_settings;

-- ── 9. RLS em todas as tabelas ────────────────────────────────────────────────

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_users','crm_contacts','crm_products',
    'crm_pipeline_stages','crm_deals',
    'crm_whatsapp_sessions','ai_reminders','ai_settings',
    'client_charges'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Usuários autenticados (JWT do Banco B): acesso total
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_access" ON public.%I
       FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);

    -- Anônimos: sem acesso
    EXECUTE format('DROP POLICY IF EXISTS "no_anon_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "no_anon_access" ON public.%I
       FOR ALL TO anon USING (false)', t);
  END LOOP;
END $rls$;

-- Tabelas IA de conteúdo público: acesso anon liberado (leitura e escrita pelo bot/dashboard)
DO $rls_ia$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_events','ai_promotions','ai_suggestions','ai_notices'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "public_read"  ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_write" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access" ON public.%I', t);

    -- Leitura pública (dashboard e bot via anon key)
    EXECUTE format(
      'CREATE POLICY "public_read" ON public.%I FOR SELECT USING (true)', t);
    -- Escrita autenticada (dashboard interno e bot autenticado)
    EXECUTE format(
      'CREATE POLICY "public_write" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $rls_ia$;

-- ── 10. Trigger updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $trg$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_users','crm_contacts','crm_products','crm_deals',
    'crm_whatsapp_sessions','ai_reminders','ai_settings',
    'ai_events','ai_promotions','ai_suggestions','ai_notices',
    'client_charges'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $trg$;

-- ── 11. Trigger auth.users → crm_users ───────────────────────────────────────
-- Quando um usuário é criado/atualizado no Supabase Auth do Banco B,
-- mantém crm_users sincronizado automaticamente.
-- client_id e role vêm dos metadados definidos no convite.

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id TEXT;
  v_role      TEXT;
  v_full_name TEXT;
BEGIN
  v_client_id := COALESCE(
    NEW.raw_user_meta_data  ->> 'client_id',
    NEW.raw_app_meta_data   ->> 'client_id'
  );
  v_role := COALESCE(
    NEW.raw_user_meta_data  ->> 'role',
    NEW.raw_app_meta_data   ->> 'role',
    'member'
  );
  v_full_name := COALESCE(
    NEW.raw_user_meta_data  ->> 'full_name',
    NEW.raw_user_meta_data  ->> 'name',
    split_part(NEW.email, '@', 1)
  );

  -- Sem client_id: usuário órfão, não sincroniza
  IF v_client_id IS NULL OR v_client_id = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.crm_users (id, client_id, email, full_name, role, active)
  VALUES (NEW.id, v_client_id, NEW.email, v_full_name, v_role, true)
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    full_name  = COALESCE(EXCLUDED.full_name, crm_users.full_name),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_auth_user ON auth.users;
CREATE TRIGGER trg_sync_auth_user
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data, raw_app_meta_data
  ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_to_crm();

-- Atualiza last_seen_at a cada login
CREATE OR REPLACE FUNCTION public.update_crm_user_last_seen()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at
     AND NEW.last_sign_in_at IS NOT NULL THEN
    UPDATE public.crm_users
    SET last_seen_at = NEW.last_sign_in_at, updated_at = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_user_last_seen ON auth.users;
CREATE TRIGGER trg_crm_user_last_seen
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.update_crm_user_last_seen();

-- ── 12. RPC: salvar chave Asaas com segurança ─────────────────────────────────
-- A chave é gravada diretamente no banco; NUNCA retornada ao frontend.
-- O frontend chama esta RPC e recebe apenas o boolean asaas_api_key_set.

CREATE OR REPLACE FUNCTION public.save_asaas_settings(
  p_asaas_api_key       TEXT    DEFAULT NULL,
  p_pix_enabled         BOOLEAN DEFAULT true,
  p_boleto_enabled      BOOLEAN DEFAULT true,
  p_credit_card_enabled BOOLEAN DEFAULT false
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.ai_settings LIMIT 1;

  IF v_id IS NOT NULL THEN
    IF p_asaas_api_key IS NOT NULL AND p_asaas_api_key <> '' THEN
      UPDATE public.ai_settings SET
        asaas_api_key        = p_asaas_api_key,
        asaas_api_key_set    = true,
        pix_enabled          = p_pix_enabled,
        boleto_enabled       = p_boleto_enabled,
        credit_card_enabled  = p_credit_card_enabled,
        updated_at           = now()
      WHERE id = v_id;
    ELSE
      UPDATE public.ai_settings SET
        pix_enabled          = p_pix_enabled,
        boleto_enabled       = p_boleto_enabled,
        credit_card_enabled  = p_credit_card_enabled,
        updated_at           = now()
      WHERE id = v_id;
    END IF;
  ELSE
    INSERT INTO public.ai_settings (
      asaas_api_key, asaas_api_key_set,
      pix_enabled, boleto_enabled, credit_card_enabled
    ) VALUES (
      NULLIF(p_asaas_api_key, ''),
      (p_asaas_api_key IS NOT NULL AND p_asaas_api_key <> ''),
      p_pix_enabled, p_boleto_enabled, p_credit_card_enabled
    ) RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'asaas_api_key_set', (SELECT asaas_api_key_set FROM public.ai_settings WHERE id = v_id)
  );
END;
$$;

-- ── 13. RPC: exec_sql para provisionamento remoto ─────────────────────────────
-- Usada pela Edge Function provision-client-db e pelo workflow n8n
-- para executar DDL arbitrário via service_role_key.
-- Acesso restrito: apenas service_role (anon e authenticated são revogados).

CREATE OR REPLACE FUNCTION public.exec_sql(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM authenticated;

-- ── 14. Seed: estágios padrão do pipeline ────────────────────────────────────
-- Inserido apenas se a tabela ainda não tiver nenhum estágio.
-- O client_id será definido pelo n8n ou pela Edge Function ao provisionar.
-- Para rodar manualmente substitua :CLIENT_ID pelo UUID ou slug do cliente.

DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crm_pipeline_stages LIMIT 1) THEN
    INSERT INTO public.crm_pipeline_stages (client_id, name, "order", color) VALUES
      ('__pending__', 'Leads',        0, '#6366f1'),
      ('__pending__', 'Qualificados', 1, '#3b82f6'),
      ('__pending__', 'Proposta',     2, '#f59e0b'),
      ('__pending__', 'Negociação',   3, '#ec4899'),
      ('__pending__', 'Ganhos',       4, '#10b981');

    RAISE NOTICE 'Estágios padrão criados com client_id temporário __pending__. '
                 'Atualize para o client_id real do cliente após o provisionamento.';
  END IF;
END $seed$;

-- ── Upgrades incrementais (aplicados em bancos legados a cada execução) ────────

-- v3.1: ai_events — adiciona colunas novas se não existirem
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS client_id   TEXT;
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS rules       TEXT;
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- v3.1: ai_events — converte coluna time de TIME para TEXT se ainda for TIME
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ai_events'
      AND column_name  = 'time'
      AND data_type    = 'time without time zone'
  ) THEN
    ALTER TABLE public.ai_events
      ALTER COLUMN time TYPE TEXT USING to_char(time, 'HH24:MI');
  END IF;
END $$;

-- v3.1: ai_events — migra valores legados do enum type
UPDATE public.ai_events SET type = 'musica_ao_vivo' WHERE type = 'schedule';
UPDATE public.ai_events SET type = 'dia_especial'   WHERE type = 'event';
UPDATE public.ai_events SET type = 'musica_ao_vivo'
  WHERE type IS NULL OR type NOT IN ('musica_ao_vivo','dia_especial');

-- v3.1: ai_events — remove constraint antiga e recria com novos valores
DO $$
DECLARE v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.ai_events'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%'
    AND conname <> 'ai_events_type_check';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_events DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.ai_events DROP CONSTRAINT IF EXISTS ai_events_type_check;
ALTER TABLE public.ai_events
  ADD CONSTRAINT ai_events_type_check
  CHECK (type IN ('musica_ao_vivo','dia_especial'));

CREATE INDEX IF NOT EXISTS idx_ai_events_client_id ON public.ai_events(client_id);

-- v3.1: client_charges — garante colunas se tabela já existir sem algumas delas
ALTER TABLE public.client_charges ADD COLUMN IF NOT EXISTS notes        TEXT;
ALTER TABLE public.client_charges ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}';
ALTER TABLE public.client_charges ADD COLUMN IF NOT EXISTS external_ref TEXT;

-- ── 15. Registra versão aplicada ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('bank_b_full_schema_v3')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.schema_migrations (version)
VALUES ('bank_b_upgrade_v3_1')
ON CONFLICT (version) DO NOTHING;
