-- =============================================================================
-- Migration 120: Content Operations — Portal Parceiro (partner_users)
-- Banco A — Idempotente
--
-- Cria a tabela partner_users para terceirizados (designers, videomakers,
-- copywriters, fotógrafos) que acessam o portal parceiro.c8control.com.br.
--
-- Modelo de autenticação:
--   login_key = lower(email) || '::' || lower(partner_slug)
--   Mesmo padrão multi-tenant do dashboard_users (login_key = email::slug).
--   E-mail em auth.users: <email>::<partner_slug>@c8partner.internal
--
-- Acesso:
--   Parceiros só veem content_items onde assigned_to = seu id
--   e assigned_to_type = 'partner'.
--   Sem acesso a contratos, clientes, financeiro ou qualquer outro módulo.
--
-- Dependências: migration 118 (content_items, content_assets, content_comments)
-- =============================================================================

-- ─── 1. partner_users ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identificação única multi-tenant: par (email + partner_slug)
  login_key       TEXT        NOT NULL UNIQUE,  -- lower(email) || '::' || lower(partner_slug)
  real_email      TEXT        NOT NULL,
  partner_slug    TEXT        NOT NULL,         -- slug identificador do parceiro

  -- Referência ao auth.users do Banco A
  -- E-mail em auth.users: <email>::<partner_slug>@c8partner.internal
  auth_user_id    UUID        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Perfil
  full_name       TEXT,
  specialty       TEXT        CHECK (specialty IN (
                    'designer','videomaker','copywriter',
                    'fotografo','social_media','outro'
                  )),
  avatar_url      TEXT,
  phone           TEXT,
  active          BOOLEAN     NOT NULL DEFAULT true,
  last_seen_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_users_org_id
  ON public.partner_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_users_login_key
  ON public.partner_users(login_key);
CREATE INDEX IF NOT EXISTS idx_partner_users_real_email
  ON public.partner_users(real_email);
CREATE INDEX IF NOT EXISTS idx_partner_users_auth_user_id
  ON public.partner_users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;

-- Agência: acesso total para gestão dos parceiros
DROP POLICY IF EXISTS "partner_users_agency_access" ON public.partner_users;
CREATE POLICY "partner_users_agency_access"
  ON public.partner_users FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Parceiro: pode ler e atualizar apenas o próprio perfil
DROP POLICY IF EXISTS "partner_users_self_access" ON public.partner_users;
CREATE POLICY "partner_users_self_access"
  ON public.partner_users FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND id = (auth.jwt() ->> 'partner_user_id')::UUID
  );

DROP POLICY IF EXISTS "partner_users_self_update" ON public.partner_users;
CREATE POLICY "partner_users_self_update"
  ON public.partner_users FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND id = (auth.jwt() ->> 'partner_user_id')::UUID
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND id = (auth.jwt() ->> 'partner_user_id')::UUID
  );

CREATE OR REPLACE TRIGGER trg_partner_users_updated_at
  BEFORE UPDATE ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.partner_users IS
  'Terceirizados com acesso restrito ao portal parceiro.c8control.com.br.
   login_key = lower(email) || ''::'' || lower(partner_slug).
   E-mail em auth.users: <email>::<partner_slug>@c8partner.internal.
   Parceiros só veem itens de conteúdo atribuídos a eles (assigned_to = id).';

-- ─── 2. RLS para parceiros nas tabelas de conteúdo ───────────────────────────

-- content_items: parceiro vê apenas os itens atribuídos a ele
DROP POLICY IF EXISTS "content_items_partner_access" ON public.content_items;
CREATE POLICY "content_items_partner_access"
  ON public.content_items FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
    AND assigned_to_type = 'partner'
  );

-- content_items: parceiro pode atualizar campos operacionais dos seus itens
-- (status de produção, publication_notes — mas não approval_status, is_visible_to_client)
DROP POLICY IF EXISTS "content_items_partner_update" ON public.content_items;
CREATE POLICY "content_items_partner_update"
  ON public.content_items FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
    AND assigned_to_type = 'partner'
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
    -- Parceiro não pode alterar campos de controle de acesso
    -- Esses campos só são alterados via RPC SECURITY DEFINER
  );

-- content_assets: parceiro pode ver e fazer upload de assets dos seus itens
DROP POLICY IF EXISTS "content_assets_partner_access" ON public.content_assets;
CREATE POLICY "content_assets_partner_access"
  ON public.content_assets FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
        AND ci.assigned_to_type = 'partner'
    )
  );

DROP POLICY IF EXISTS "content_assets_partner_insert" ON public.content_assets;
CREATE POLICY "content_assets_partner_insert"
  ON public.content_assets FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND uploader_type = 'partner'
    AND uploaded_by = (auth.jwt() ->> 'partner_user_id')::UUID
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
        AND ci.assigned_to_type = 'partner'
    )
  );

-- content_comments: parceiro vê e cria comentários não-internos dos seus itens
DROP POLICY IF EXISTS "content_comments_partner_read" ON public.content_comments;
CREATE POLICY "content_comments_partner_read"
  ON public.content_comments FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
        AND ci.assigned_to_type = 'partner'
    )
  );

DROP POLICY IF EXISTS "content_comments_partner_insert" ON public.content_comments;
CREATE POLICY "content_comments_partner_insert"
  ON public.content_comments FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND author_type = 'partner'
    AND author_id = (auth.jwt() ->> 'partner_user_id')::UUID
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
        AND ci.assigned_to_type = 'partner'
    )
  );

-- content_item_versions: parceiro pode ver versões dos seus itens
DROP POLICY IF EXISTS "content_item_versions_partner_read" ON public.content_item_versions;
CREATE POLICY "content_item_versions_partner_read"
  ON public.content_item_versions FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
        AND ci.assigned_to_type = 'partner'
    )
  );

-- ─── 3. RPC: get_partner_user_by_login_key ────────────────────────────────────
-- Usada pela Edge Function partner-dashboard-auth para resolver o parceiro
-- durante o login. Nunca retorna credenciais ou tokens.

CREATE OR REPLACE FUNCTION public.get_partner_user_by_login_key(
  p_login_key TEXT
)
RETURNS TABLE (
  partner_user_id  UUID,
  auth_user_id     UUID,
  organization_id  UUID,
  partner_slug     TEXT,
  real_email       TEXT,
  full_name        TEXT,
  specialty        TEXT,
  active           BOOLEAN,
  -- Dados da organização para montar o contexto
  org_name         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pu.id              AS partner_user_id,
    pu.auth_user_id,
    pu.organization_id,
    pu.partner_slug,
    pu.real_email,
    pu.full_name,
    pu.specialty,
    pu.active,
    o.name             AS org_name
  FROM public.partner_users pu
  JOIN public.organizations o ON o.id = pu.organization_id
  WHERE pu.login_key = lower(trim(p_login_key))
    AND pu.active    = true
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_partner_user_by_login_key IS
  'Usada pela Edge Function partner-dashboard-auth para resolver o parceiro
   durante o login pelo login_key (email::partner_slug).
   SECURITY DEFINER para acesso sem RLS durante a autenticação.';

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('120_content_ops_partners')
ON CONFLICT (version) DO NOTHING;
