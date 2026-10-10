-- ============================================================
-- Migration 065: Fase 2 — Migração do Banco B para o Banco A
-- Execute no Supabase da AGÊNCIA (Banco A)
--
-- Cria as tabelas equivalentes às do Banco B no Banco A,
-- com isolamento multi-tenant via client_id → clients(id).
--
-- Tabelas criadas (espelhos do Banco B):
--   • client_crm_users          ← crm_users      (usuários do C8 Control)
--   • client_crm_contacts       ← crm_contacts   (contatos do CRM)
--   • client_crm_products       ← crm_products   (produtos/serviços do CRM)
--   • client_crm_pipeline_stages← crm_pipeline_stages
--   • client_crm_deals          ← crm_deals      (negociações)
--   • client_whatsapp_sessions  ← crm_whatsapp_sessions
--   • client_ai_events          ← ai_events      (agenda IA / eventos)
--   • client_ai_promotions      ← ai_promotions
--   • client_ai_suggestions     ← ai_suggestions
--   • client_ai_notices         ← ai_notices
--   • client_ai_reminders       ← ai_reminders
--   • client_ai_settings        ← ai_settings    (configs do agente)
--   • client_charges            espelho do Banco B — criada nesta migration
--
-- Estratégia de isolamento:
--   • Todas as tabelas têm client_id UUID → clients(id) ON DELETE CASCADE
--   • RLS ativada em todas
--   • Políticas: authenticated = acesso via RPC SECURITY DEFINER
--                anon          = sem acesso direto
--   • Frontend NUNCA acessa diretamente — sempre via RPC
--
-- Compatibilidade com Banco B:
--   • Prefixo "client_" nas tabelas do Banco A para evitar conflito de nomes
--   • Campos adicionais: client_id, organization_id (multi-tenant)
--   • Campos sensíveis (asaas_api_key) mantidos com padrão de segurança
-- ============================================================

-- ─── 1. Usuários do C8 Control ───────────────────────────────────────────────
-- Espelho de crm_users do Banco B.
-- No Banco A, auth.users é ÚNICO para todos os clientes — cada usuário
-- tem um registro aqui com client_id identificando a qual cliente pertence.
-- A autenticação ainda usa o Supabase Auth do Banco A após a migração.

CREATE TABLE IF NOT EXISTS public.client_crm_users (
  id           UUID        PRIMARY KEY,
  client_id    UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  full_name    TEXT,
  role         TEXT        NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner','admin','manager','member','viewer')),
  avatar_url   TEXT,
  active       BOOLEAN     NOT NULL DEFAULT true,
  is_support   BOOLEAN     NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  -- Referência ao auth.users do Banco A (após migração)
  auth_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Referência ao Banco B original (para rastreabilidade durante migração)
  bank_b_user_id UUID,
  bank_b_client_slug TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_users_client_id
  ON public.client_crm_users(client_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_users_email
  ON public.client_crm_users(client_id, email);
CREATE INDEX IF NOT EXISTS idx_client_crm_users_auth_user_id
  ON public.client_crm_users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON TABLE public.client_crm_users IS
  'Usuários do C8 Control por cliente. Fase 2: substitui crm_users do Banco B.';
COMMENT ON COLUMN public.client_crm_users.bank_b_user_id IS
  'ID original no Banco B — mantido para rastreabilidade durante migração. Removível após validação.';

-- ─── 2. Contatos do CRM ──────────────────────────────────────────────────────
-- Espelho de crm_contacts do Banco B.

CREATE TABLE IF NOT EXISTS public.client_crm_contacts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  phone        TEXT,
  email        TEXT,
  source       TEXT,
  tags         TEXT[]      DEFAULT '{}',
  notes        TEXT,
  metadata     JSONB       DEFAULT '{}',
  bank_b_id    UUID,              -- ID original no Banco B
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_contacts_client_id
  ON public.client_crm_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_contacts_phone
  ON public.client_crm_contacts(client_id, phone)
  WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_crm_contacts_email
  ON public.client_crm_contacts(client_id, email)
  WHERE email IS NOT NULL;

-- ─── 3. Produtos e serviços ───────────────────────────────────────────────────
-- Espelho de crm_products do Banco B.

CREATE TABLE IF NOT EXISTS public.client_crm_products (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID       NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         TEXT          NOT NULL,
  description  TEXT,
  price        NUMERIC(12,2) DEFAULT 0,
  unit         TEXT          DEFAULT 'unidade',
  active       BOOLEAN       NOT NULL DEFAULT true,
  bank_b_id    UUID,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_products_client_id
  ON public.client_crm_products(client_id);

-- ─── 4. Etapas do pipeline ────────────────────────────────────────────────────
-- Espelho de crm_pipeline_stages do Banco B.

CREATE TABLE IF NOT EXISTS public.client_crm_pipeline_stages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  "order"      INTEGER     NOT NULL DEFAULT 0,
  color        TEXT        NOT NULL DEFAULT '#6366f1',
  bank_b_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_pipeline_stages_client_id
  ON public.client_crm_pipeline_stages(client_id, "order");

-- ─── 5. Negociações (deals) ───────────────────────────────────────────────────
-- Espelho de crm_deals do Banco B.
-- FKs apontam para as tabelas do Banco A, não do Banco B.

CREATE TABLE IF NOT EXISTS public.client_crm_deals (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id          UUID          REFERENCES public.client_crm_contacts(id) ON DELETE SET NULL,
  product_id          UUID          REFERENCES public.client_crm_products(id) ON DELETE SET NULL,
  stage_id            UUID          REFERENCES public.client_crm_pipeline_stages(id) ON DELETE SET NULL,
  title               TEXT,
  value               NUMERIC(12,2) DEFAULT 0,
  status              TEXT          NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','won','lost')),
  notes               TEXT,
  expected_close_date DATE,
  bank_b_id           UUID,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_deals_client_id
  ON public.client_crm_deals(client_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_deals_stage_id
  ON public.client_crm_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_deals_status
  ON public.client_crm_deals(client_id, status);

-- ─── 6. Sessões WhatsApp ──────────────────────────────────────────────────────
-- Espelho de crm_whatsapp_sessions do Banco B.

CREATE TABLE IF NOT EXISTS public.client_whatsapp_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number     TEXT,
  session_status   TEXT        NOT NULL DEFAULT 'disconnected'
                   CHECK (session_status IN ('connected','disconnected','connecting','qr_pending')),
  connected_at     TIMESTAMPTZ,
  disconnected_at  TIMESTAMPTZ,
  last_sync_at     TIMESTAMPTZ,
  bank_b_id        UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_whatsapp_sessions_client_id
  ON public.client_whatsapp_sessions(client_id);

-- ─── 7. Eventos / Agenda IA ───────────────────────────────────────────────────
-- Espelho de ai_events do Banco B.
-- Renomeado para client_ai_events para evitar conflito com ai_events de Banco B
-- que ainda pode existir em bancos legados.

CREATE TABLE IF NOT EXISTS public.client_ai_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  rules        TEXT,
  date         DATE        NOT NULL,
  time         TEXT,
  location     TEXT,
  type         TEXT        NOT NULL DEFAULT 'musica_ao_vivo'
               CHECK (type IN ('musica_ao_vivo','dia_especial')),
  status       TEXT        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive')),
  bank_b_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ai_events_client_id
  ON public.client_ai_events(client_id);
CREATE INDEX IF NOT EXISTS idx_client_ai_events_date
  ON public.client_ai_events(client_id, date);
CREATE INDEX IF NOT EXISTS idx_client_ai_events_status
  ON public.client_ai_events(client_id, status);

-- ─── 8. Promoções ────────────────────────────────────────────────────────────
-- Espelho de ai_promotions do Banco B.

CREATE TABLE IF NOT EXISTS public.client_ai_promotions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  validity     TEXT,
  type         TEXT,
  rules        TEXT,
  status       TEXT        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive')),
  bank_b_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ai_promotions_client_id
  ON public.client_ai_promotions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_ai_promotions_status
  ON public.client_ai_promotions(client_id, status);

-- ─── 9. Sugestões da Semana ───────────────────────────────────────────────────
-- Espelho de ai_suggestions do Banco B.

CREATE TABLE IF NOT EXISTS public.client_ai_suggestions (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID       NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         TEXT          NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2),
  image_url    TEXT,
  rules        TEXT,
  status       TEXT          NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive')),
  bank_b_id    UUID,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ai_suggestions_client_id
  ON public.client_ai_suggestions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_ai_suggestions_status
  ON public.client_ai_suggestions(client_id, status);

-- ─── 10. Avisos ──────────────────────────────────────────────────────────────
-- Espelho de ai_notices do Banco B.

CREATE TABLE IF NOT EXISTS public.client_ai_notices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message      TEXT        NOT NULL,
  priority     TEXT        NOT NULL DEFAULT 'baixa'
               CHECK (priority IN ('alta','média','baixa')),
  validity     TEXT,
  rules        TEXT,
  status       TEXT        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive')),
  bank_b_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ai_notices_client_id
  ON public.client_ai_notices(client_id);
CREATE INDEX IF NOT EXISTS idx_client_ai_notices_status
  ON public.client_ai_notices(client_id, status);

-- ─── 11. Lembretes rápidos ────────────────────────────────────────────────────
-- Espelho de ai_reminders do Banco B.
-- created_by referencia client_crm_users (Banco A) em vez de crm_users (Banco B).

CREATE TABLE IF NOT EXISTS public.client_ai_reminders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  text         TEXT        NOT NULL,
  due_date     TIMESTAMPTZ,
  completed    BOOLEAN     NOT NULL DEFAULT false,
  created_by   UUID        REFERENCES public.client_crm_users(id) ON DELETE SET NULL,
  bank_b_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ai_reminders_client_id
  ON public.client_ai_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_client_ai_reminders_due_date
  ON public.client_ai_reminders(client_id, due_date)
  WHERE NOT completed;

-- ─── 12. Configurações do agente (ai_settings) ───────────────────────────────
-- Espelho de ai_settings do Banco B.
-- Uma linha por cliente — enforced via UNIQUE(client_id).
-- asaas_api_key NUNCA retornada ao frontend (mesmo padrão do Banco B).

CREATE TABLE IF NOT EXISTS public.client_ai_settings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID        NOT NULL UNIQUE
                       REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
  -- Pixels
  meta_pixel_id        TEXT,
  google_tag_id        TEXT,
  -- Asaas (NUNCA retornado ao frontend)
  asaas_api_key        TEXT,
  asaas_api_key_set    BOOLEAN     NOT NULL DEFAULT false,
  -- Métodos de pagamento
  pix_enabled          BOOLEAN     NOT NULL DEFAULT true,
  boleto_enabled       BOOLEAN     NOT NULL DEFAULT true,
  credit_card_enabled  BOOLEAN     NOT NULL DEFAULT false,
  bank_b_id            UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ai_settings_client_id
  ON public.client_ai_settings(client_id);

-- View segura: nunca expõe asaas_api_key
CREATE OR REPLACE VIEW public.client_ai_settings_safe
WITH (security_invoker = true) AS
  SELECT
    id, client_id, organization_id,
    establishment_name, phone, whatsapp, instagram, address,
    opening_hours, welcome_message, auto_reply_24h, forward_to_human,
    sidebar_logo_url, google_business_url, bot_active,
    meta_pixel_id, google_tag_id,
    asaas_api_key_set,
    pix_enabled, boleto_enabled, credit_card_enabled,
    updated_at, created_at
  FROM public.client_ai_settings;

COMMENT ON TABLE public.client_ai_settings IS
  'Configurações do agente IA por cliente. asaas_api_key nunca retornada — use client_ai_settings_safe.';

-- ─── 13. Cobranças Asaas ─────────────────────────────────────────────────────
-- Espelho de client_charges do Banco B, com client_id e organization_id
-- para isolamento multi-tenant no Banco A.

CREATE TABLE IF NOT EXISTS public.client_charges (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID          REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Identificação
  asaas_id        TEXT          UNIQUE,
  description     TEXT          NOT NULL DEFAULT '',
  -- Valores
  value           NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Datas
  due_date        DATE          NOT NULL,
  payment_date    DATE,
  -- Tipo e status
  billing_type    TEXT          NOT NULL DEFAULT 'PIX'
                  CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
  status          TEXT          NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','RECEIVED','CONFIRMED','OVERDUE','REFUNDED',
                    'REFUND_REQUESTED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE',
                    'AWAITING_CHARGEBACK_REVERSAL','DUNNING_REQUESTED','DUNNING_RECEIVED',
                    'AWAITING_RISK_ANALYSIS','CANCELLED')),
  -- Links e chaves
  invoice_url     TEXT,
  bank_slip_url   TEXT,
  pix_qr_code     TEXT,
  pix_copy_paste  TEXT,
  -- Metadados
  external_ref    TEXT,
  notes           TEXT,
  metadata        JSONB         DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_charges_client_id
  ON public.client_charges(client_id);
CREATE INDEX IF NOT EXISTS idx_client_charges_organization_id
  ON public.client_charges(organization_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_charges_status
  ON public.client_charges(status);
CREATE INDEX IF NOT EXISTS idx_client_charges_due_date
  ON public.client_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_client_charges_asaas_id
  ON public.client_charges(asaas_id)
  WHERE asaas_id IS NOT NULL;

-- ─── 14. RLS em todas as tabelas novas ───────────────────────────────────────

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'client_crm_users',
    'client_crm_contacts',
    'client_crm_products',
    'client_crm_pipeline_stages',
    'client_crm_deals',
    'client_whatsapp_sessions',
    'client_ai_events',
    'client_ai_promotions',
    'client_ai_suggestions',
    'client_ai_notices',
    'client_ai_reminders',
    'client_ai_settings',
    'client_charges'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Authenticated: acesso total (isolamento garantido pelas RPCs SECURITY DEFINER)
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_access" ON public.%I
       FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);

    -- Anon: sem acesso direto
    EXECUTE format('DROP POLICY IF EXISTS "no_anon_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "no_anon_access" ON public.%I
       FOR ALL TO anon USING (false)', t);
  END LOOP;
END $rls$;

-- ─── 15. Triggers updated_at ─────────────────────────────────────────────────
-- Reutiliza a função set_updated_at() já existente no Banco A.

DO $trg$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'client_crm_users',
    'client_crm_contacts',
    'client_crm_products',
    'client_crm_deals',
    'client_whatsapp_sessions',
    'client_ai_events',
    'client_ai_promotions',
    'client_ai_suggestions',
    'client_ai_notices',
    'client_ai_reminders',
    'client_ai_settings',
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

-- ─── 16. Seed: estágios padrão do pipeline ───────────────────────────────────
-- Função helper para seed de estágios ao ativar CRM para um cliente.
-- Chamada pelo n8n ou pelo painel interno após ativar o módulo CRM.

CREATE OR REPLACE FUNCTION public.seed_crm_pipeline_stages(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  -- Só cria se ainda não existir nenhum estágio para este cliente
  IF EXISTS (
    SELECT 1 FROM public.client_crm_pipeline_stages WHERE client_id = p_client_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'Estágios já existem');
  END IF;

  INSERT INTO public.client_crm_pipeline_stages
    (client_id, organization_id, name, "order", color)
  VALUES
    (p_client_id, v_org_id, 'Leads',        0, '#6366f1'),
    (p_client_id, v_org_id, 'Qualificados', 1, '#3b82f6'),
    (p_client_id, v_org_id, 'Proposta',     2, '#f59e0b'),
    (p_client_id, v_org_id, 'Negociação',   3, '#ec4899'),
    (p_client_id, v_org_id, 'Ganhos',       4, '#10b981');

  RETURN jsonb_build_object('success', true, 'skipped', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_crm_pipeline_stages(UUID) TO authenticated;

-- ─── 17. RPC segura: salvar chave Asaas (client_ai_settings) ─────────────────
-- Mesmo padrão da save_asaas_settings do Banco B — nunca retorna a chave.

CREATE OR REPLACE FUNCTION public.save_client_asaas_settings(
  p_client_id           UUID,
  p_asaas_api_key       TEXT    DEFAULT NULL,
  p_pix_enabled         BOOLEAN DEFAULT true,
  p_boleto_enabled      BOOLEAN DEFAULT true,
  p_credit_card_enabled BOOLEAN DEFAULT false
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_id     UUID;
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  SELECT id INTO v_id FROM public.client_ai_settings WHERE client_id = p_client_id LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.client_ai_settings SET
      asaas_api_key        = CASE WHEN p_asaas_api_key IS NOT NULL AND p_asaas_api_key <> ''
                               THEN p_asaas_api_key ELSE asaas_api_key END,
      asaas_api_key_set    = CASE WHEN p_asaas_api_key IS NOT NULL AND p_asaas_api_key <> ''
                               THEN true ELSE asaas_api_key_set END,
      pix_enabled          = p_pix_enabled,
      boleto_enabled       = p_boleto_enabled,
      credit_card_enabled  = p_credit_card_enabled,
      updated_at           = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.client_ai_settings (
      client_id, organization_id,
      asaas_api_key, asaas_api_key_set,
      pix_enabled, boleto_enabled, credit_card_enabled
    ) VALUES (
      p_client_id, v_org_id,
      NULLIF(p_asaas_api_key, ''),
      (p_asaas_api_key IS NOT NULL AND p_asaas_api_key <> ''),
      p_pix_enabled, p_boleto_enabled, p_credit_card_enabled
    ) RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'asaas_api_key_set', (SELECT asaas_api_key_set FROM public.client_ai_settings WHERE id = v_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_client_asaas_settings(UUID,TEXT,BOOLEAN,BOOLEAN,BOOLEAN)
  TO authenticated;

-- ─── 18. Tabela de controle da migração ──────────────────────────────────────
-- Rastreia o progresso da migração Banco B → Banco A por cliente.
-- Permite migração incremental e rollback seguro.

CREATE TABLE IF NOT EXISTS public.client_migration_status (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID        NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  bank_b_slug       TEXT,
  bank_b_url        TEXT,
  -- Status por módulo
  users_migrated    BOOLEAN     NOT NULL DEFAULT false,
  crm_migrated      BOOLEAN     NOT NULL DEFAULT false,
  ai_migrated       BOOLEAN     NOT NULL DEFAULT false,
  charges_migrated  BOOLEAN     NOT NULL DEFAULT false,
  -- Contadores
  users_count       INTEGER     DEFAULT 0,
  contacts_count    INTEGER     DEFAULT 0,
  deals_count       INTEGER     DEFAULT 0,
  events_count      INTEGER     DEFAULT 0,
  -- Estado geral
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','failed','rolled_back')),
  error_log         TEXT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  -- Fase: quando concluída, o Banco B pode ser desativado
  bank_b_deactivated BOOLEAN    NOT NULL DEFAULT false,
  bank_b_deactivated_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_migration_status_status
  ON public.client_migration_status(status);

ALTER TABLE public.client_migration_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_migration_status" ON public.client_migration_status;
CREATE POLICY "auth_migration_status"
  ON public.client_migration_status FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_client_migration_status_updated_at ON public.client_migration_status;
CREATE TRIGGER trg_client_migration_status_updated_at
  BEFORE UPDATE ON public.client_migration_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.client_migration_status IS
  'Controle de progresso da migração Banco B → Banco A por cliente. Uma linha por cliente.';

-- ─── 19. Comentários das tabelas principais ──────────────────────────────────

COMMENT ON TABLE public.client_crm_users IS
  'Usuários do C8 Control. Fase 2: substitui crm_users do Banco B. auth_user_id referencia auth.users do Banco A.';
COMMENT ON TABLE public.client_crm_contacts IS
  'Contatos do CRM por cliente. Fase 2: substitui crm_contacts do Banco B.';
COMMENT ON TABLE public.client_crm_products IS
  'Produtos/serviços do CRM. Fase 2: substitui crm_products do Banco B.';
COMMENT ON TABLE public.client_crm_pipeline_stages IS
  'Etapas do pipeline de vendas. Fase 2: substitui crm_pipeline_stages do Banco B.';
COMMENT ON TABLE public.client_crm_deals IS
  'Negociações do CRM. FKs apontam para tabelas do Banco A. Fase 2: substitui crm_deals do Banco B.';
COMMENT ON TABLE public.client_whatsapp_sessions IS
  'Metadados da sessão WhatsApp por cliente. Token real fica no VPS.';
COMMENT ON TABLE public.client_ai_events IS
  'Eventos/agenda do agente IA. Fase 2: substitui ai_events do Banco B.';
COMMENT ON TABLE public.client_ai_promotions IS
  'Promoções do agente IA. Fase 2: substitui ai_promotions do Banco B.';
COMMENT ON TABLE public.client_ai_suggestions IS
  'Sugestões da semana do agente IA. Fase 2: substitui ai_suggestions do Banco B.';
COMMENT ON TABLE public.client_ai_notices IS
  'Avisos do agente IA. Fase 2: substitui ai_notices do Banco B.';
COMMENT ON TABLE public.client_ai_reminders IS
  'Lembretes rápidos. Fase 2: substitui ai_reminders do Banco B.';

-- ─── Fim da Migration 065 ─────────────────────────────────────────────────────
-- Próximos passos (fora do escopo desta migration):
--   1. Executar script de migração de dados por cliente (n8n ou script manual)
--   2. Atualizar useDynamicClient → consultar Banco A quando client_migration_status.status = 'completed'
--   3. Atualizar as páginas do C8 Control para usar as novas tabelas client_* do Banco A
--   4. Após validação completa: desativar Banco B (client_migration_status.bank_b_deactivated = true)
