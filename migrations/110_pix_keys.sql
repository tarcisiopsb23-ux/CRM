-- Migration 110: tabela pix_keys
-- Suporta múltiplas chaves PIX por organização para uso nos contratos.
-- A coluna organizations.chave_pix (simples) é mantida para retrocompatibilidade.

CREATE TABLE IF NOT EXISTS public.pix_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label           TEXT        NOT NULL,                  -- ex: "CNPJ Principal", "E-mail"
  key_type        TEXT        NOT NULL                   -- 'cnpj' | 'cpf' | 'email' | 'telefone' | 'aleatoria'
                  CHECK (key_type IN ('cnpj', 'cpf', 'email', 'telefone', 'aleatoria')),
  key_value       TEXT        NOT NULL,                  -- valor da chave
  holder_name     TEXT        NOT NULL DEFAULT '',       -- nome do titular (ex: "Agência C8 LTDA")
  is_default      BOOLEAN     NOT NULL DEFAULT false,    -- chave padrão da organização
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante no máximo uma chave padrão por organização
CREATE UNIQUE INDEX IF NOT EXISTS pix_keys_default_idx
  ON public.pix_keys (organization_id)
  WHERE is_default = true AND is_active = true;

-- RLS
ALTER TABLE public.pix_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pix_keys_select" ON public.pix_keys;
CREATE POLICY "pix_keys_select" ON public.pix_keys
  FOR SELECT USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "pix_keys_insert" ON public.pix_keys;
CREATE POLICY "pix_keys_insert" ON public.pix_keys
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::public.user_role[])
  );

DROP POLICY IF EXISTS "pix_keys_update" ON public.pix_keys;
CREATE POLICY "pix_keys_update" ON public.pix_keys
  FOR UPDATE USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::public.user_role[])
  );

DROP POLICY IF EXISTS "pix_keys_delete" ON public.pix_keys;
CREATE POLICY "pix_keys_delete" ON public.pix_keys
  FOR DELETE USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::public.user_role[])
  );

-- trigger updated_at
DROP TRIGGER IF EXISTS pix_keys_updated_at ON public.pix_keys;
CREATE TRIGGER pix_keys_updated_at
  BEFORE UPDATE ON public.pix_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- contracts_v2: chave_pix agora armazena o ID da pix_keys (UUID)
-- mantemos como TEXT para retrocompatibilidade com chaves hardcoded antigas
-- (um UUID é texto válido; o assembleContract resolve pelo ID se for UUID)

-- Garante que a coluna existe (pode ter sido criada pela 00213 ou não)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS chave_pix TEXT;

COMMENT ON COLUMN public.contracts_v2.chave_pix IS
  'ID (UUID) da chave PIX em public.pix_keys, ou valor literal legado.';

-- Também garante a coluna em organizations (criada pela 00213 — idempotente)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS chave_pix TEXT;

-- Versão
INSERT INTO public.schema_migrations (version)
VALUES ('110_pix_keys_v1')
ON CONFLICT (version) DO NOTHING;
