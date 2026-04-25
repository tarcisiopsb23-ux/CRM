-- =============================================================================
-- Migration 00136: Senhas de suporte do C8 Control
-- Armazena a senha do usuário suporte@agenciac8.com.br por tenant
-- O usuário de suporte não contabiliza no limite de usuários
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.c8_support_passwords (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  support_email   TEXT NOT NULL DEFAULT 'suporte@agenciac8.com.br',
  password        TEXT NOT NULL,
  c8_user_id      TEXT,  -- ID do usuário no auth.users do C8 Control
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_c8_support_passwords_org
  ON public.c8_support_passwords (organization_id);

ALTER TABLE public.c8_support_passwords ENABLE ROW LEVEL SECURITY;

CREATE POLICY c8_support_passwords_org ON public.c8_support_passwords
  FOR ALL
  USING (organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[]));

CREATE OR REPLACE FUNCTION update_c8_support_passwords_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_c8_support_passwords_updated_at
  BEFORE UPDATE ON public.c8_support_passwords
  FOR EACH ROW EXECUTE FUNCTION update_c8_support_passwords_updated_at();
