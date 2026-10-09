-- Migration 4: Autenticação do Dashboard por E-mail + Senha
-- Recria as RPCs de autenticação do dashboard público para exigir
-- e-mail + senha em vez de apenas senha.
-- A tabela clients já possui o campo email (adicionado na migration 2).
-- Idempotente: usa CREATE OR REPLACE FUNCTION.

-- ============================================================
-- RPC: validate_client_dashboard_password
-- Valida e-mail + senha para acesso ao dashboard público.
-- Retorna TRUE se e-mail e senha batem para o slug informado.
-- ============================================================
CREATE OR REPLACE FUNCTION validate_client_dashboard_password(
  p_slug     TEXT,
  p_email    TEXT,
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
  -- Busca a senha armazenada em metadata->>'dashboard_password'
  -- validando também o e-mail do cliente
  SELECT metadata->>'dashboard_password'
  INTO   v_stored_password
  FROM   clients
  WHERE  dashboard_slug = p_slug
    AND  LOWER(TRIM(email)) = LOWER(TRIM(p_email))
  LIMIT 1;

  IF v_stored_password IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN (v_stored_password = p_password);
END;
$$;

-- ============================================================
-- RPC: get_client_by_slug
-- Retorna dados públicos do cliente pelo slug (sem expor senha).
-- Mantém compatibilidade com o frontend existente.
-- ============================================================
CREATE OR REPLACE FUNCTION get_client_by_slug(p_slug TEXT)
RETURNS TABLE (
  id                    UUID,
  name                  TEXT,
  company               TEXT,
  dashboard_slug        TEXT,
  organization_id       UUID,
  has_temp_password     BOOLEAN,
  favicon_url           TEXT,
  dashboard_performance BOOLEAN,
  dashboard_atendimento BOOLEAN,
  dashboard_crm         BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name::TEXT,
    c.company::TEXT,
    c.dashboard_slug::TEXT,
    -- organization_id: usa o próprio id do cliente como referência
    c.id                                                    AS organization_id,
    COALESCE((c.metadata->>'has_temp_password')::BOOLEAN, FALSE) AS has_temp_password,
    c.favicon_url::TEXT,
    COALESCE((c.metadata->>'dashboard_performance')::BOOLEAN, TRUE)  AS dashboard_performance,
    COALESCE((c.metadata->>'dashboard_atendimento')::BOOLEAN, FALSE) AS dashboard_atendimento,
    COALESCE((c.metadata->>'dashboard_crm')::BOOLEAN, FALSE)         AS dashboard_crm
  FROM clients c
  WHERE c.dashboard_slug = p_slug
  LIMIT 1;
END;
$$;

-- ============================================================
-- RPC: recover_client_password
-- Reseta senha temporária validando slug + e-mail.
-- ============================================================
CREATE OR REPLACE FUNCTION recover_client_password(
  p_slug              TEXT,
  p_email             TEXT,
  p_new_temp_password TEXT
)
RETURNS TABLE (organization_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client clients%ROWTYPE;
BEGIN
  SELECT *
  INTO   v_client
  FROM   clients
  WHERE  dashboard_slug = p_slug
    AND  LOWER(TRIM(email)) = LOWER(TRIM(p_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE clients
  SET metadata = metadata
    || jsonb_build_object(
         'dashboard_password',  p_new_temp_password,
         'has_temp_password',   TRUE
       )
  WHERE id = v_client.id;

  RETURN QUERY SELECT v_client.id;
END;
$$;

-- ============================================================
-- RPC: update_client_dashboard_password
-- Troca senha temporária por definitiva (primeiro acesso).
-- ============================================================
CREATE OR REPLACE FUNCTION update_client_dashboard_password(
  p_client_id    UUID,
  p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET metadata = metadata
    || jsonb_build_object(
         'dashboard_password', p_new_password,
         'has_temp_password',  FALSE
       )
  WHERE id = p_client_id;
END;
$$;
