-- =============================================================================
-- Migration 00179: RPC pública para obter o ID da organização
--
-- Retorna o id da primeira organização ativa do banco.
-- Usado pela página pública de vagas para não precisar de VITE_PUBLIC_ORG_ID.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_public_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM organizations
  ORDER BY created_at ASC
  LIMIT 1;
$$;

-- Permite chamada sem autenticação (anon key)
GRANT EXECUTE ON FUNCTION get_public_org_id() TO anon;
GRANT EXECUTE ON FUNCTION get_public_org_id() TO authenticated;
