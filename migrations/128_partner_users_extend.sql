-- =============================================================================
-- Migration 128: Extensão de partner_users — tipos e tokens de convite
-- Banco A — Idempotente
--
-- Adiciona:
--   1. partner_users.partner_type   — 'agency' | 'client'
--   2. partner_users.supplier_id    — FK → suppliers (quando type = agency)
--   3. partner_users.client_id      — FK → clients   (quando type = client)
--   4. partner_invite_tokens        — tokens de primeiro acesso (72h)
--
-- Lógica de negócio:
--   type = 'agency'  → parceiro da agência, vinculado a fornecedor existente,
--                       pode ser atribuído a qualquer cliente da org
--   type = 'client'  → parceiro do cliente, cadastrado diretamente pelo cliente
--                       (sem vínculo financeiro com a agência), restrito ao
--                       cliente que o cadastrou
--
-- Dependências: migration 120 (partner_users), suppliers, clients
-- =============================================================================

-- ─── 1. Novos campos em partner_users ────────────────────────────────────────

ALTER TABLE public.partner_users
  ADD COLUMN IF NOT EXISTS partner_type TEXT NOT NULL DEFAULT 'agency'
    CHECK (partner_type IN ('agency', 'client'));

ALTER TABLE public.partner_users
  ADD COLUMN IF NOT EXISTS supplier_id UUID
    REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.partner_users
  ADD COLUMN IF NOT EXISTS client_id UUID
    REFERENCES public.clients(id) ON DELETE CASCADE;

-- Índices
CREATE INDEX IF NOT EXISTS idx_partner_users_partner_type
  ON public.partner_users(partner_type);

CREATE INDEX IF NOT EXISTS idx_partner_users_supplier_id
  ON public.partner_users(supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_users_client_id
  ON public.partner_users(client_id)
  WHERE client_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.partner_users.partner_type IS
  'agency: parceiro da agência (vinculado a suppliers, vínculo financeiro).
   client: parceiro do cliente (cadastro direto, sem vínculo financeiro com a agência).';

COMMENT ON COLUMN public.partner_users.supplier_id IS
  'Fornecedor vinculado — preenchido quando partner_type = ''agency''.
   Permite rastrear obrigações financeiras via módulo Financeiro/Fornecedores.';

COMMENT ON COLUMN public.partner_users.client_id IS
  'Cliente vinculado — preenchido quando partner_type = ''client''.
   Parceiro só pode ser atribuído a itens de conteúdo deste cliente.';

-- ─── 2. partner_invite_tokens ─────────────────────────────────────────────────
-- Tokens de primeiro acesso válidos por 72 horas.
-- Enviados por e-mail com link: parceiro.c8control.com.br/{slug}/login?token={token}
-- Ao usar o token, o parceiro é redirecionado para definir a senha permanente.

CREATE TABLE IF NOT EXISTS public.partner_invite_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   UUID        NOT NULL REFERENCES public.partner_users(id) ON DELETE CASCADE,
  token        TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_invite_tokens_token
  ON public.partner_invite_tokens(token)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_invite_tokens_partner_id
  ON public.partner_invite_tokens(partner_id);

CREATE INDEX IF NOT EXISTS idx_partner_invite_tokens_expires
  ON public.partner_invite_tokens(expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.partner_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Service role tem acesso total (Edge Functions)
-- Usuários autenticados da agência podem ler (para reenviar convite)
DROP POLICY IF EXISTS "partner_invite_tokens_agency_read" ON public.partner_invite_tokens;
CREATE POLICY "partner_invite_tokens_agency_read"
  ON public.partner_invite_tokens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.id = partner_id
        AND pu.organization_id = public.get_user_organization_id()
    )
  );

COMMENT ON TABLE public.partner_invite_tokens IS
  'Tokens de primeiro acesso para o Portal Parceiro.
   Válidos por 72 horas. Enviados por e-mail via Resend na Edge Function partner-invite.
   Usados no fluxo: parceiro.c8control.com.br/{slug}/login?token={token}
   → valida o token → redireciona para definir senha permanente.';

-- ─── 3. RPC: validate_partner_invite_token ────────────────────────────────────
-- Valida o token e retorna os dados do parceiro para o Portal Parceiro.
-- Chamada no primeiro login via token de convite.
-- Marca o token como usado e retorna credenciais para login automático.

CREATE OR REPLACE FUNCTION public.validate_partner_invite_token(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token   partner_invite_tokens%ROWTYPE;
  v_partner partner_users%ROWTYPE;
BEGIN
  -- Busca o token
  SELECT * INTO v_token
  FROM public.partner_invite_tokens
  WHERE token    = p_token
    AND used_at  IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid',  false,
      'reason', 'Token inválido, expirado ou já utilizado'
    );
  END IF;

  -- Busca o parceiro
  SELECT * INTO v_partner
  FROM public.partner_users
  WHERE id = v_token.partner_id;

  IF NOT FOUND OR NOT v_partner.active THEN
    RETURN jsonb_build_object(
      'valid',  false,
      'reason', 'Parceiro não encontrado ou inativo'
    );
  END IF;

  -- Marca token como usado
  UPDATE public.partner_invite_tokens
  SET used_at = now()
  WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'valid',        true,
    'partner_id',   v_partner.id,
    'partner_slug', v_partner.partner_slug,
    'login_key',    v_partner.login_key,
    'real_email',   v_partner.real_email,
    'full_name',    v_partner.full_name,
    'partner_type', v_partner.partner_type
  );
END;
$$;

-- ─── 4. Atualiza RLS de content_items para parceiros do tipo 'client' ────────
-- Parceiros do tipo 'client' só podem ver/editar itens do cliente vinculado.

DROP POLICY IF EXISTS "content_items_partner_access" ON public.content_items;
CREATE POLICY "content_items_partner_access"
  ON public.content_items FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'partner'
    AND assigned_to = (auth.jwt() ->> 'partner_user_id')::UUID
    AND assigned_to_type = 'partner'
    AND (
      -- Parceiro da agência: pode ver itens de qualquer cliente
      EXISTS (
        SELECT 1 FROM public.partner_users pu
        WHERE pu.id           = (auth.jwt() ->> 'partner_user_id')::UUID
          AND pu.partner_type = 'agency'
      )
      OR
      -- Parceiro do cliente: só vê itens do seu cliente
      EXISTS (
        SELECT 1 FROM public.partner_users pu
        WHERE pu.id           = (auth.jwt() ->> 'partner_user_id')::UUID
          AND pu.partner_type = 'client'
          AND pu.client_id    = client_id
      )
    )
  );

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('128_partner_users_extend')
ON CONFLICT (version) DO NOTHING;
