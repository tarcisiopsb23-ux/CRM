-- =============================================================================
-- Migration 00183: Fix definitivo RLS recrutamento
-- Execute no Supabase SQL Editor
-- =============================================================================

-- 1. Remove TUDO relacionado a policies de job_openings
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE tablename = 'job_openings' AND schemaname = 'public'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON job_openings';
  END LOOP;
END $$;

-- 2. Desabilita e reabilita RLS para limpar estado
ALTER TABLE job_openings DISABLE ROW LEVEL SECURITY;
ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;

-- 3. Policy única e simples: vagas abertas são públicas
CREATE POLICY "vagas_abertas_publicas" ON job_openings
  FOR SELECT
  TO anon, authenticated
  USING (status = 'aberta');

-- 4. Policies para usuários autenticados (escrita)
CREATE POLICY "vagas_auth_insert" ON job_openings
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "vagas_auth_update" ON job_openings
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "vagas_auth_delete" ON job_openings
  FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id());

-- Policy para autenticados verem TODAS as vagas da org (não só abertas)
CREATE POLICY "vagas_auth_select_all" ON job_openings
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id());

-- 5. Verifica resultado
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'job_openings' AND schemaname = 'public'
ORDER BY policyname;
