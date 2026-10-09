-- Migration: Tabela de usuários do dashboard (single-tenant, multi-user)
-- Permite múltiplos usuários por projeto sem alterar a tabela clients.
-- O login tenta primeiro nesta tabela; se não encontrar, cai no fallback
-- do metadata do clients (compatibilidade retroativa).

-- ── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  password   TEXT        NOT NULL,
  is_support BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, email)
);

ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_dashboard_users" ON dashboard_users;
CREATE POLICY "anon_all_dashboard_users" ON dashboard_users
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── RPC: validate_dashboard_user ─────────────────────────────────────────────
-- Valida e-mail + senha. Tenta dashboard_users primeiro; fallback em clients.metadata.
-- Retorna o client_id e is_support se válido, NULL se inválido.
CREATE OR REPLACE FUNCTION validate_dashboard_user(
  p_email    TEXT,
  p_password TEXT
)
RETURNS TABLE (client_id UUID, is_support BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id  UUID;
  v_is_support BOOLEAN;
BEGIN
  -- 1. Tenta na tabela dashboard_users
  SELECT du.client_id, du.is_support
    INTO v_client_id, v_is_support
    FROM dashboard_users du
   WHERE LOWER(TRIM(du.email)) = LOWER(TRIM(p_email))
     AND du.password = p_password
   LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    RETURN QUERY SELECT v_client_id, v_is_support;
    RETURN;
  END IF;

  -- 2. Fallback: metadata do clients (compatibilidade retroativa)
  SELECT c.id, COALESCE((c.metadata->>'is_support')::BOOLEAN, FALSE)
    INTO v_client_id, v_is_support
    FROM clients c
   WHERE LOWER(TRIM(c.metadata->>'dashboard_email')) = LOWER(TRIM(p_email))
     AND c.metadata->>'dashboard_password' = p_password
   LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    RETURN QUERY SELECT v_client_id, v_is_support;
  END IF;
END;
$$;

-- ── Insere o usuário admin da agência ────────────────────────────────────────
-- Usa o único client_id existente no banco (single-tenant)
INSERT INTO dashboard_users (client_id, email, password, is_support)
SELECT id, 'suporte@agenciac8.com.br', '62642301', TRUE
  FROM clients
 LIMIT 1
ON CONFLICT (client_id, email) DO UPDATE
  SET password   = EXCLUDED.password,
      is_support = EXCLUDED.is_support;
