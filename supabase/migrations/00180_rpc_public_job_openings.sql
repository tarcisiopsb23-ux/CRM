-- =============================================================================
-- Migration 00180: RPC pública para listar vagas abertas
--
-- Retorna todas as vagas com status 'aberta' da organização.
-- SECURITY DEFINER bypassa o RLS — seguro pois só expõe vagas abertas.
-- Não requer autenticação (acessível pelo anon key).
-- =============================================================================

CREATE OR REPLACE FUNCTION get_public_job_openings()
RETURNS TABLE (
  id              UUID,
  organization_id UUID,
  title           TEXT,
  job_title       TEXT,
  department      TEXT,
  description     TEXT,
  requirements    TEXT,
  location_type   TEXT,
  salary_range    TEXT,
  status          TEXT,
  published_at    TIMESTAMPTZ,
  closes_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, organization_id, title, job_title, department,
    description, requirements, location_type, salary_range,
    status, published_at, closes_at, created_at, updated_at
  FROM job_openings
  WHERE status = 'aberta'
  ORDER BY published_at DESC NULLS LAST, created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_public_job_openings() TO anon;
GRANT EXECUTE ON FUNCTION get_public_job_openings() TO authenticated;

-- =============================================================================
-- RPC para buscar uma vaga específica publicamente (para VagaDetailPage)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_public_job_opening(p_job_opening_id UUID)
RETURNS TABLE (
  id              UUID,
  organization_id UUID,
  title           TEXT,
  job_title       TEXT,
  department      TEXT,
  description     TEXT,
  requirements    TEXT,
  location_type   TEXT,
  salary_range    TEXT,
  status          TEXT,
  published_at    TIMESTAMPTZ,
  closes_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, organization_id, title, job_title, department,
    description, requirements, location_type, salary_range,
    status, published_at, closes_at, created_at, updated_at
  FROM job_openings
  WHERE id = p_job_opening_id
    AND status = 'aberta';
$$;

GRANT EXECUTE ON FUNCTION get_public_job_opening(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_public_job_opening(UUID) TO authenticated;

-- =============================================================================
-- RPC para buscar perguntas do formulário de uma vaga pública
-- =============================================================================

CREATE OR REPLACE FUNCTION get_public_job_form_questions(p_job_opening_id UUID)
RETURNS TABLE (
  id              UUID,
  job_opening_id  UUID,
  organization_id UUID,
  question_text   TEXT,
  question_type   TEXT,
  options         JSONB,
  correct_answer  JSONB,
  weight          INTEGER,
  is_required     BOOLEAN,
  sort_order      INTEGER,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.*
  FROM job_form_questions q
  JOIN job_openings jo ON jo.id = q.job_opening_id
  WHERE q.job_opening_id = p_job_opening_id
    AND jo.status = 'aberta'
  ORDER BY q.sort_order ASC;
$$;

GRANT EXECUTE ON FUNCTION get_public_job_form_questions(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_public_job_form_questions(UUID) TO authenticated;
