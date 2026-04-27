-- =============================================================================
-- Migration 00178: Corrige policies do módulo de recrutamento
-- Garante idempotência — remove e recria todas as policies das tabelas
-- =============================================================================

-- ─── job_openings ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "job_openings_org_access"     ON job_openings;
DROP POLICY IF EXISTS "job_openings_public_select"  ON job_openings;

CREATE POLICY "job_openings_org_access" ON job_openings
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "job_openings_public_select" ON job_openings
  FOR SELECT USING (status = 'aberta');

-- ─── job_form_questions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "job_form_questions_org_access"    ON job_form_questions;
DROP POLICY IF EXISTS "job_form_questions_public_select" ON job_form_questions;

CREATE POLICY "job_form_questions_org_access" ON job_form_questions
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "job_form_questions_public_select" ON job_form_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM job_openings jo
      WHERE jo.id = job_opening_id AND jo.status = 'aberta'
    )
  );

-- ─── candidates ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "candidates_org_access"    ON candidates;
DROP POLICY IF EXISTS "candidates_public_insert" ON candidates;

CREATE POLICY "candidates_org_access" ON candidates
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "candidates_public_insert" ON candidates
  FOR INSERT WITH CHECK (true);

-- ─── applications ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "applications_org_access"    ON applications;
DROP POLICY IF EXISTS "applications_public_insert" ON applications;

CREATE POLICY "applications_org_access" ON applications
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "applications_public_insert" ON applications
  FOR INSERT WITH CHECK (true);
