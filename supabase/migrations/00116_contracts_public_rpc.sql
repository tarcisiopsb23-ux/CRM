-- Migration 00116: RPC SECURITY DEFINER para buscar contratos no dashboard público
-- Necessário porque o usuário pode estar autenticado como membro de outra organização
-- e a RLS normal bloquearia o acesso. SECURITY DEFINER bypassa a RLS.

CREATE OR REPLACE FUNCTION public.get_client_contracts_public(p_client_id UUID)
RETURNS TABLE (
  id UUID,
  client_id UUID,
  start_date DATE,
  contract_date DATE,
  is_dashboard_reference BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Só retorna se o cliente tiver dashboard_slug (acesso público habilitado)
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND dashboard_slug IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.client_id,
    c.start_date::DATE,
    c.contract_date::DATE,
    COALESCE(c.is_dashboard_reference, false) AS is_dashboard_reference
  FROM public.contracts c
  WHERE c.client_id = p_client_id
  ORDER BY c.start_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_contracts_public(UUID) TO anon, authenticated;
