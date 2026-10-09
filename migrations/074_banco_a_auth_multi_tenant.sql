-- =============================================================================
-- Migration 074: Suporte multi-tenant de autenticação no Banco A
-- Banco A — Idempotente
--
-- Problema:
--   Dois clientes diferentes podem ter um funcionário com o mesmo e-mail.
--   Ex: joao@gmail.com é usuário do cliente A E do cliente B.
--   No Banco B isso não era problema (projetos Supabase separados).
--   No Banco A unificado, auth.users tem UNIQUE(email) — colisão garantida.
--
-- Solução: login_key = email + '::' + dashboard_slug
--   Cada usuário é identificado pelo par (email, slug-do-cliente).
--   O login_key é armazenado em raw_user_meta_data->>'login_key'.
--   A Edge Function client-dashboard-auth usa login_key para encontrar
--   o usuário correto mesmo quando dois clientes têm o mesmo e-mail.
--
-- Impacto no auth.users:
--   • e-mail real do usuário fica em raw_user_meta_data->>'real_email'
--   • e-mail em auth.users recebe formato: <email>::<slug>@c8.internal
--     (evita colisão de UNIQUE sem mudar a experiência do usuário)
--   • login_key = '<email>::<slug>' indexado para busca rápida
--
-- Tabelas/RPCs criadas:
--   • dashboard_users — tabela de usuários do dashboard no Banco A
--     (substitui crm_users do Banco B + auth.users do Banco B)
--   • RPC get_dashboard_user_by_login_key — busca usuário por login_key
--   • RPC create_dashboard_user — cria usuário no Banco A com senha
--   • RPC upsert_client_migration_status — registra progresso
--
-- Regra de login_key:
--   login_key = lower(trim(email)) || '::' || lower(trim(slug))
--   Ex: 'joao@gmail.com::minha-empresa'
-- =============================================================================

-- ─── 0. Tabela dashboard_users ────────────────────────────────────────────────
-- Tabela central de usuários do C8 Control no Banco A.
-- Substitui crm_users do Banco B após migração.
-- auth_user_id → auth.users do Banco A (UUID do usuário Supabase Auth).

CREATE TABLE IF NOT EXISTS public.dashboard_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identificação única: par (email + slug) resolve colisão multi-tenant
  login_key       TEXT        NOT NULL UNIQUE,   -- 'email::slug'
  real_email      TEXT        NOT NULL,           -- e-mail real do usuário
  client_slug     TEXT        NOT NULL,           -- slug do cliente (dashboard_slug)

  -- Referência ao auth.users do Banco A
  auth_user_id    UUID        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Perfil
  full_name       TEXT,
  role            TEXT        NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner','admin','manager','member','viewer')),
  avatar_url      TEXT,
  active          BOOLEAN     NOT NULL DEFAULT true,
  is_support      BOOLEAN     NOT NULL DEFAULT false,
  last_seen_at    TIMESTAMPTZ,

  -- Rastreabilidade de migração
  bank_b_user_id  UUID,       -- UUID original no auth.users do Banco B
  migrated_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_users_client_id
  ON public.dashboard_users(client_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_login_key
  ON public.dashboard_users(login_key);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_real_email
  ON public.dashboard_users(real_email);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_auth_user_id
  ON public.dashboard_users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.dashboard_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dashboard_users_authenticated" ON public.dashboard_users;
CREATE POLICY "dashboard_users_authenticated"
  ON public.dashboard_users FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "dashboard_users_no_anon" ON public.dashboard_users;
CREATE POLICY "dashboard_users_no_anon"
  ON public.dashboard_users FOR ALL TO anon
  USING (false);

CREATE TRIGGER trg_dashboard_users_updated_at
  BEFORE UPDATE ON public.dashboard_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.dashboard_users IS
  'Usuários do C8 Control no Banco A unificado. login_key = email::slug garante unicidade multi-tenant.';
COMMENT ON COLUMN public.dashboard_users.login_key IS
  'Identificador único: lower(email) || ''::'' || lower(slug). Resolve colisão de e-mail entre clientes diferentes.';
COMMENT ON COLUMN public.dashboard_users.auth_user_id IS
  'UUID em auth.users do Banco A. O e-mail em auth.users é <email>::<slug>@c8.internal para evitar colisão de UNIQUE.';

-- ─── 1. Tabela dashboard_login_attempts (rate limiting) ───────────────────────
-- Já pode existir do sistema anterior — garante que existe e tem as colunas certas.

CREATE TABLE IF NOT EXISTS public.dashboard_login_attempts (
  rate_key       TEXT        PRIMARY KEY,
  attempts       INTEGER     NOT NULL DEFAULT 0,
  window_start   BIGINT,
  blocked_until  BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access" ON public.dashboard_login_attempts;
CREATE POLICY "no_direct_access"
  ON public.dashboard_login_attempts FOR ALL TO anon, authenticated
  USING (false);

-- ─── 2. RPC: get_dashboard_user_by_login_key ──────────────────────────────────
-- Usada pela Edge Function client-dashboard-auth para encontrar o usuário
-- correto durante o login. Retorna dados mínimos — nunca retorna senha.

CREATE OR REPLACE FUNCTION public.get_dashboard_user_by_login_key(
  p_login_key TEXT
)
RETURNS TABLE (
  dashboard_user_id  UUID,
  auth_user_id       UUID,
  client_id          UUID,
  organization_id    UUID,
  client_slug        TEXT,
  real_email         TEXT,
  full_name          TEXT,
  role               TEXT,
  active             BOOLEAN,
  is_support         BOOLEAN,
  -- Dados do cliente (para construir o ClientAuth no frontend)
  client_name        TEXT,
  client_company     TEXT,
  client_supabase_url     TEXT,  -- NULL após migração completa
  client_supabase_anon_key TEXT, -- NULL após migração completa
  show_ia_content    BOOLEAN,
  c8_control_enabled BOOLEAN,
  modules_config     JSONB,
  metadata           JSONB,
  migration_completed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    du.id                                    AS dashboard_user_id,
    du.auth_user_id,
    du.client_id,
    du.organization_id,
    du.client_slug,
    du.real_email,
    du.full_name,
    du.role,
    du.active,
    du.is_support,
    c.name                                   AS client_name,
    c.company                                AS client_company,
    c.client_supabase_url,
    c.client_supabase_anon_key,
    COALESCE(c.show_ia_content, false)       AS show_ia_content,
    COALESCE(c.c8_control_enabled, false)    AS c8_control_enabled,
    COALESCE(p.modules_config, '{}'::JSONB)  AS modules_config,
    COALESCE(c.metadata, '{}'::JSONB)        AS metadata,
    COALESCE(ms.status = 'completed', false) AS migration_completed
  FROM public.dashboard_users du
  JOIN public.clients c
    ON c.id = du.client_id
  LEFT JOIN public.crm_client_plans p
    ON p.client_id = du.client_id
  LEFT JOIN public.client_migration_status ms
    ON ms.client_id = du.client_id
  WHERE du.login_key = lower(trim(p_login_key))
    AND du.active    = true
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_user_by_login_key(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_user_by_login_key(TEXT) TO authenticated, service_role;

-- ─── 3. RPC: create_dashboard_user ────────────────────────────────────────────
-- Cria usuário no auth.users do Banco A com e-mail interno (email::slug@c8.internal)
-- e o registra em dashboard_users.
-- Chamada pelo script de migração (Passo 2) e pelo fluxo de convite futuro.
-- IMPORTANTE: esta RPC usa SECURITY DEFINER com service_role — nunca exposta a anon.

CREATE OR REPLACE FUNCTION public.create_dashboard_user(
  p_client_id   UUID,
  p_real_email  TEXT,
  p_full_name   TEXT    DEFAULT NULL,
  p_role        TEXT    DEFAULT 'member',
  p_bank_b_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client        public.clients%ROWTYPE;
  v_login_key     TEXT;
  v_internal_email TEXT;
  v_existing_du   UUID;
  v_existing_au   UUID;
BEGIN
  -- Busca dados do cliente
  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id LIMIT 1;
  IF NOT FOUND OR v_client.dashboard_slug IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado ou sem dashboard_slug');
  END IF;

  v_login_key      := lower(trim(p_real_email)) || '::' || lower(trim(v_client.dashboard_slug));
  v_internal_email := lower(trim(p_real_email)) || '::' || lower(trim(v_client.dashboard_slug)) || '@c8.internal';

  -- Verifica se login_key já existe
  SELECT id INTO v_existing_du
  FROM public.dashboard_users
  WHERE login_key = v_login_key;

  IF v_existing_du IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success',           true,
      'created',           false,
      'dashboard_user_id', v_existing_du,
      'login_key',         v_login_key,
      'reason',            'login_key já existe'
    );
  END IF;

  -- Verifica se auth_user com e-mail interno já existe
  SELECT id INTO v_existing_au
  FROM auth.users
  WHERE email = v_internal_email;

  -- Insere em dashboard_users (auth_user_id preenchido depois pelo chamador via UPDATE)
  INSERT INTO public.dashboard_users (
    client_id, organization_id,
    login_key, real_email, client_slug,
    auth_user_id,
    full_name, role, active, is_support,
    bank_b_user_id, migrated_at
  ) VALUES (
    p_client_id, v_client.organization_id,
    v_login_key, lower(trim(p_real_email)), v_client.dashboard_slug,
    v_existing_au,   -- pode ser NULL se auth_user ainda não foi criado
    p_full_name, p_role, true, false,
    p_bank_b_user_id,
    CASE WHEN p_bank_b_user_id IS NOT NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (login_key) DO NOTHING
  RETURNING id INTO v_existing_du;

  RETURN jsonb_build_object(
    'success',           true,
    'created',           true,
    'dashboard_user_id', v_existing_du,
    'login_key',         v_login_key,
    'internal_email',    v_internal_email,
    'auth_user_id',      v_existing_au
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_dashboard_user(UUID,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_dashboard_user(UUID,TEXT,TEXT,TEXT,UUID) TO service_role;

-- ─── 4. RPC: update_dashboard_user_auth_id ────────────────────────────────────
-- Atualiza auth_user_id em dashboard_users após criar o usuário no auth.users.
-- Chamada pelo script de migração após criar o usuário via Admin API.

CREATE OR REPLACE FUNCTION public.update_dashboard_user_auth_id(
  p_login_key    TEXT,
  p_auth_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  UPDATE public.dashboard_users
  SET auth_user_id = p_auth_user_id,
      updated_at   = now()
  WHERE login_key = lower(trim(p_login_key))
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'dashboard_user não encontrado');
  END IF;

  RETURN jsonb_build_object('success', true, 'dashboard_user_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_dashboard_user_auth_id(TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_dashboard_user_auth_id(TEXT,UUID) TO service_role;

-- ─── 5. RPC: upsert_client_migration_status ──────────────────────────────────
-- Registra/atualiza o progresso da migração de um cliente.

CREATE OR REPLACE FUNCTION public.upsert_client_migration_status(
  p_client_id       UUID,
  p_status          TEXT    DEFAULT 'in_progress',
  p_users_migrated  BOOLEAN DEFAULT false,
  p_crm_migrated    BOOLEAN DEFAULT false,
  p_ai_migrated     BOOLEAN DEFAULT false,
  p_charges_migrated BOOLEAN DEFAULT false,
  p_users_count     INTEGER DEFAULT 0,
  p_contacts_count  INTEGER DEFAULT 0,
  p_deals_count     INTEGER DEFAULT 0,
  p_events_count    INTEGER DEFAULT 0,
  p_error_log       TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank_b_slug TEXT;
  v_bank_b_url  TEXT;
BEGIN
  SELECT dashboard_slug, client_supabase_url
    INTO v_bank_b_slug, v_bank_b_url
  FROM public.clients WHERE id = p_client_id;

  INSERT INTO public.client_migration_status (
    client_id, bank_b_slug, bank_b_url,
    status,
    users_migrated, crm_migrated, ai_migrated, charges_migrated,
    users_count, contacts_count, deals_count, events_count,
    error_log,
    started_at,
    completed_at
  ) VALUES (
    p_client_id, v_bank_b_slug, v_bank_b_url,
    p_status,
    p_users_migrated, p_crm_migrated, p_ai_migrated, p_charges_migrated,
    p_users_count, p_contacts_count, p_deals_count, p_events_count,
    p_error_log,
    CASE WHEN p_status = 'in_progress' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'completed'   THEN now() ELSE NULL END
  )
  ON CONFLICT (client_id) DO UPDATE SET
    status             = EXCLUDED.status,
    users_migrated     = EXCLUDED.users_migrated,
    crm_migrated       = EXCLUDED.crm_migrated,
    ai_migrated        = EXCLUDED.ai_migrated,
    charges_migrated   = EXCLUDED.charges_migrated,
    users_count        = EXCLUDED.users_count,
    contacts_count     = EXCLUDED.contacts_count,
    deals_count        = EXCLUDED.deals_count,
    events_count       = EXCLUDED.events_count,
    error_log          = EXCLUDED.error_log,
    started_at         = COALESCE(client_migration_status.started_at, EXCLUDED.started_at),
    completed_at       = EXCLUDED.completed_at,
    updated_at         = now();

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_client_migration_status(UUID,TEXT,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,INTEGER,INTEGER,INTEGER,INTEGER,TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_client_migration_status(UUID,TEXT,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,INTEGER,INTEGER,INTEGER,INTEGER,TEXT)
  TO authenticated, service_role;

-- ─── 6. RPC: update_dashboard_user_last_seen ─────────────────────────────────
-- Chamada pela Edge Function de auth após login bem-sucedido.

CREATE OR REPLACE FUNCTION public.update_dashboard_user_last_seen(
  p_auth_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.dashboard_users
  SET last_seen_at = now(), updated_at = now()
  WHERE auth_user_id = p_auth_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_dashboard_user_last_seen(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_dashboard_user_last_seen(UUID) TO authenticated, service_role;

-- ─── 7. Versão ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version)
VALUES ('074_banco_a_auth_multi_tenant_v1')
ON CONFLICT (version) DO NOTHING;
