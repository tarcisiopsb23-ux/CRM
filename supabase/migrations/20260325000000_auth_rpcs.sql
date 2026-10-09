-- Migration: RPCs de Autenticação do Dashboard (single-tenant, sem slug)
-- Modelo: um banco por parceiro, hospedado no VPS do cliente.
-- Sem slug na URL — o cliente é identificado pelo único registro em `clients`.
-- Todas as funções usam SECURITY DEFINER e SET search_path = public.
-- DROP explícito em todas as funções para garantir idempotência total.

DROP FUNCTION IF EXISTS get_client_by_slug(TEXT);
DROP FUNCTION IF EXISTS get_client_data();
DROP FUNCTION IF EXISTS validate_client_dashboard_password(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS validate_client_dashboard_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS recover_client_password(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS recover_client_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS validate_support_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS validate_support_password(TEXT);
DROP FUNCTION IF EXISTS set_support_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS set_support_password(TEXT);
DROP FUNCTION IF EXISTS update_client_dashboard_password(UUID, TEXT);

-- ============================================================
-- RPC: get_client_data
-- ============================================================
CREATE FUNCTION get_client_data()
RETURNS TABLE (
  id                    UUID,
  name                  TEXT,
  favicon_url           TEXT,
  has_temp_password     BOOLEAN,
  dashboard_performance BOOLEAN,
  dashboard_atendimento BOOLEAN,
  dashboard_crm         BOOLEAN,
  metadata              JSONB
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
    c.favicon_url::TEXT,
    COALESCE((c.metadata->>'has_temp_password')::BOOLEAN,  FALSE)       AS has_temp_password,
    COALESCE((c.metadata->>'dashboard_performance')::BOOLEAN, TRUE)     AS dashboard_performance,
    COALESCE((c.metadata->>'dashboard_atendimento')::BOOLEAN, FALSE)    AS dashboard_atendimento,
    COALESCE((c.metadata->>'dashboard_crm')::BOOLEAN, FALSE)            AS dashboard_crm,
    (c.metadata - 'dashboard_password' - 'support_password')::JSONB    AS metadata
  FROM clients c
  LIMIT 1;
END;
$$;

-- ============================================================
-- RPC: validate_client_dashboard_password
-- ============================================================
CREATE FUNCTION validate_client_dashboard_password(
  p_email    TEXT,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_email    TEXT;
  v_stored_password TEXT;
BEGIN
  SELECT
    metadata->>'dashboard_email',
    metadata->>'dashboard_password'
  INTO v_stored_email, v_stored_password
  FROM clients
  LIMIT 1;

  IF v_stored_password IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN (
    LOWER(TRIM(v_stored_email)) = LOWER(TRIM(p_email))
    AND v_stored_password       = p_password
  );
END;
$$;

-- ============================================================
-- RPC: validate_support_password
-- ============================================================
CREATE FUNCTION validate_support_password(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored TEXT;
BEGIN
  SELECT metadata->>'support_password'
  INTO   v_stored
  FROM   clients
  LIMIT 1;

  IF v_stored IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_stored = p_password;
END;
$$;

-- ============================================================
-- RPC: recover_client_password
-- ============================================================
CREATE FUNCTION recover_client_password(
  p_email             TEXT,
  p_new_temp_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  SELECT id INTO v_client_id
  FROM   clients
  WHERE  LOWER(TRIM(metadata->>'dashboard_email')) = LOWER(TRIM(p_email))
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE clients
  SET metadata = metadata || jsonb_build_object(
    'dashboard_password', p_new_temp_password,
    'has_temp_password',  TRUE
  )
  WHERE id = v_client_id;
END;
$$;

-- ============================================================
-- RPC: update_client_dashboard_password
-- ============================================================
CREATE FUNCTION update_client_dashboard_password(
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
  SET metadata = metadata || jsonb_build_object(
    'dashboard_password', p_new_password,
    'has_temp_password',  FALSE
  )
  WHERE id = p_client_id;
END;
$$;

-- ============================================================
-- RPC: set_support_password
-- ============================================================
CREATE FUNCTION set_support_password(p_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET metadata = metadata || jsonb_build_object('support_password', p_password);
END;
$$;
