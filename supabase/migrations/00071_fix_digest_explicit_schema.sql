-- =============================================================================
-- Fix: digest() com schema explícito para garantir funcionamento no Supabase
-- O pgcrypto no Supabase fica no schema "extensions".
-- Usar extensions.digest() diretamente evita dependência do search_path.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION rep_p_hash_record(payload TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(payload, 'sha256'), 'hex');
$$;

GRANT EXECUTE ON FUNCTION rep_p_hash_record(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_hash_record(TEXT) TO service_role;

COMMIT;
