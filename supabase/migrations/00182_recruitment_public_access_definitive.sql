-- =============================================================================
-- Migration 00182: Acesso público definitivo ao módulo de recrutamento
-- Execute este script no Supabase SQL Editor para corrigir o problema.
-- =============================================================================

-- ── 1. Garante que RLS está ativo ────────────────────────────────────────────
ALTER TABLE job_openings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications       ENABLE ROW LEVEL SECURITY;

-- ── 2. Remove TODAS as policies existentes das tabelas ───────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE tablename IN ('job_openings','job_form_questions','candidates','applications')
      AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ── 3. job_openings ──────────────────────────────────────────────────────────

-- Qualquer pessoa pode VER vagas abertas (sem autenticação)
CREATE POLICY "jo_public_read" ON job_openings
  FOR SELECT USING (status = 'aberta');

-- Usuários autenticados da organização podem ver TODAS as vagas
CREATE POLICY "jo_auth_read" ON job_openings
  FOR SELECT USING (organization_id = get_user_organization_id());

-- Apenas autenticados podem criar/editar/excluir
CREATE POLICY "jo_auth_insert" ON job_openings
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "jo_auth_update" ON job_openings
  FOR UPDATE USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "jo_auth_delete" ON job_openings
  FOR DELETE USING (organization_id = get_user_organization_id());

-- ── 4. job_form_questions ────────────────────────────────────────────────────

-- Qualquer pessoa pode ver perguntas de vagas abertas
CREATE POLICY "jfq_public_read" ON job_form_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM job_openings jo
      WHERE jo.id = job_opening_id AND jo.status = 'aberta'
    )
  );

-- Autenticados da organização têm acesso total
CREATE POLICY "jfq_auth_all" ON job_form_questions
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── 5. candidates ────────────────────────────────────────────────────────────

-- Qualquer pessoa pode se cadastrar como candidato
CREATE POLICY "cand_public_insert" ON candidates
  FOR INSERT WITH CHECK (true);

-- Autenticados da organização têm acesso total
CREATE POLICY "cand_auth_all" ON candidates
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── 6. applications ──────────────────────────────────────────────────────────

-- Qualquer pessoa pode submeter candidatura
CREATE POLICY "app_public_insert" ON applications
  FOR INSERT WITH CHECK (true);

-- Autenticados da organização têm acesso total
CREATE POLICY "app_auth_all" ON applications
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── 7. RPC pública para listar vagas (bypassa RLS completamente) ─────────────
CREATE OR REPLACE FUNCTION get_public_job_openings()
RETURNS TABLE (
  id UUID, organization_id UUID, title TEXT, job_title TEXT,
  department TEXT, description TEXT, requirements TEXT,
  location_type TEXT, salary_range TEXT, status TEXT,
  published_at TIMESTAMPTZ, closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, organization_id, title, job_title, department,
         description, requirements, location_type, salary_range,
         status, published_at, closes_at, created_at, updated_at
  FROM job_openings
  WHERE status = 'aberta'
  ORDER BY created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION get_public_job_openings() TO anon;
GRANT EXECUTE ON FUNCTION get_public_job_openings() TO authenticated;

-- ── 8. RPC para vaga individual ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_public_job_opening(p_job_opening_id UUID)
RETURNS TABLE (
  id UUID, organization_id UUID, title TEXT, job_title TEXT,
  department TEXT, description TEXT, requirements TEXT,
  location_type TEXT, salary_range TEXT, status TEXT,
  published_at TIMESTAMPTZ, closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, organization_id, title, job_title, department,
         description, requirements, location_type, salary_range,
         status, published_at, closes_at, created_at, updated_at
  FROM job_openings
  WHERE id = p_job_opening_id AND status = 'aberta';
$$;
GRANT EXECUTE ON FUNCTION get_public_job_opening(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_public_job_opening(UUID) TO authenticated;

-- ── 9. RPC para perguntas do formulário ──────────────────────────────────────
CREATE OR REPLACE FUNCTION get_public_job_form_questions(p_job_opening_id UUID)
RETURNS TABLE (
  id UUID, job_opening_id UUID, organization_id UUID,
  question_text TEXT, question_type TEXT, options JSONB,
  correct_answer JSONB, weight INTEGER, is_required BOOLEAN,
  sort_order INTEGER, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT q.id, q.job_opening_id, q.organization_id, q.question_text,
         q.question_type, q.options, q.correct_answer, q.weight,
         q.is_required, q.sort_order, q.created_at
  FROM job_form_questions q
  JOIN job_openings jo ON jo.id = q.job_opening_id
  WHERE q.job_opening_id = p_job_opening_id AND jo.status = 'aberta'
  ORDER BY q.sort_order ASC;
$$;
GRANT EXECUTE ON FUNCTION get_public_job_form_questions(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_public_job_form_questions(UUID) TO authenticated;

-- ── 10. RPC para org ID público ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_public_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_public_org_id() TO anon;
GRANT EXECUTE ON FUNCTION get_public_org_id() TO authenticated;
