-- Migration: RPCs de Senha de Suporte Técnico
-- Cria/recria as funções para gestão da senha de suporte da agência.
-- Todas as funções usam SECURITY DEFINER e SET search_path = public.
-- Idempotente: usa CREATE OR REPLACE FUNCTION.
--
-- Requisitos cobertos: 4.1, 4.3, 4.5

-- ============================================================
-- RPC: set_support_password
-- Cria ou redefine a senha de suporte técnico da agência para um parceiro.
-- Usa merge parcial (||) para não sobrescrever outros campos do metadata (req 13.2).
-- Valida o slug antes de atualizar (req 12.1).
-- ============================================================
CREATE OR REPLACE FUNCTION set_support_password(
  p_slug     TEXT,
  p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  SELECT id
  INTO   v_client_id
  FROM   clients
  WHERE  dashboard_slug = p_slug
  LIMIT 1;

  -- Slug inválido: retorna sem fazer nada
  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  -- Merge parcial: preserva todos os outros campos do metadata (req 13.2)
  UPDATE clients
  SET metadata = metadata
    || jsonb_build_object('support_password', p_password)
  WHERE id = v_client_id;
END;
$$;

-- ============================================================
-- RPC: validate_support_password
-- Valida a senha de suporte técnico contra metadata->>'support_password'.
-- Retorna FALSE se a senha não estiver configurada ou se o slug for inválido (req 4.5).
-- Não expõe o valor armazenado na resposta (req 4.1).
-- ============================================================
CREATE OR REPLACE FUNCTION validate_support_password(
  p_slug     TEXT,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_password TEXT;
BEGIN
  SELECT metadata->>'support_password'
  INTO   v_stored_password
  FROM   clients
  WHERE  dashboard_slug = p_slug
  LIMIT 1;

  -- Slug inválido ou senha não configurada: retorna FALSE (req 4.5)
  IF v_stored_password IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_stored_password = p_password;
END;
$$;
