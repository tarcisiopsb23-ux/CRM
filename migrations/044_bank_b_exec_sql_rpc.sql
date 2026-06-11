-- ============================================================
-- Migration 044: RPC exec_sql para provisionamento do Banco B
-- Execute no Supabase de CADA CLIENTE (Banco B)
--
-- Permite que a Edge Function provision-client-db execute DDL
-- arbitrário no Banco B usando service_role_key.
-- Restrita a service_role — nunca exposta a usuários comuns.
-- ============================================================

CREATE OR REPLACE FUNCTION public.exec_sql(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Revoga acesso público — apenas service_role pode chamar
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM authenticated;
-- service_role ignora REVOKE por design do Supabase

COMMENT ON FUNCTION public.exec_sql IS
  'Executa SQL arbitrário. Uso exclusivo da Edge Function provision-client-db via service_role.';
