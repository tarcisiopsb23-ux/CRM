-- =============================================================================
-- Migration 026: Módulo de Recrutamento e Seleção
-- Tabelas: job_openings, job_form_questions, candidates, applications
-- =============================================================================

-- ─── 1. Adicionar 'recruitment' ao enum permission_module ────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'recruitment'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'recruitment';
  END IF;
END $$;

-- ─── 2. Tabela de vagas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_openings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  job_title        TEXT,
  department       TEXT,
  description      TEXT,
  requirements     TEXT,
  location_type    TEXT CHECK (location_type IN ('presencial','remoto','hibrido')),
  salary_range     TEXT,
  status           TEXT NOT NULL DEFAULT 'aberta'
                   CHECK (status IN ('aberta','pausada','encerrada')),
  published_at     TIMESTAMPTZ DEFAULT NOW(),
  closes_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_openings_org_status
  ON job_openings(organization_id, status);

-- ─── 3. Tabela de perguntas do formulário por vaga ───────────────────────────
CREATE TABLE IF NOT EXISTS job_form_questions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_opening_id   UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  question_text    TEXT NOT NULL,
  question_type    TEXT NOT NULL
                   CHECK (question_type IN ('text','single_choice','multiple_choice','scale_1_5','yes_no')),
  options          JSONB,
  correct_answer   JSONB,
  weight           INTEGER NOT NULL DEFAULT 5 CHECK (weight BETWEEN 1 AND 10),
  is_required      BOOLEAN NOT NULL DEFAULT true,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_form_questions_opening
  ON job_form_questions(job_opening_id, sort_order);

-- ─── 4. Tabela de candidatos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT,
  linkedin_url     TEXT,
  portfolio_url    TEXT,
  resume_drive_url TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_candidates_org_email
  ON candidates(organization_id, email);

-- ─── 5. Tabela de candidaturas ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_opening_id   UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  candidate_id     UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cover_letter     TEXT,
  answers          JSONB NOT NULL DEFAULT '[]',
  score_auto       NUMERIC(8,2) DEFAULT 0,
  score_manual     NUMERIC(8,2),
  score_total      NUMERIC(8,2) DEFAULT 0,
  score_max        NUMERIC(8,2) DEFAULT 0,
  score_percent    NUMERIC(5,2) DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo','em_analise','aprovado','reprovado','contratado')),
  notes            TEXT,
  source           TEXT DEFAULT 'web'
                   CHECK (source IN ('web','agent','manual')),
  applied_at       TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (job_opening_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_opening_score
  ON applications(job_opening_id, score_total DESC);
CREATE INDEX IF NOT EXISTS idx_applications_candidate
  ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_org_status
  ON applications(organization_id, status);

-- ─── 6. RLS — tabelas internas (autenticado) ─────────────────────────────────
ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- job_openings: acesso total para autenticados da organização
CREATE POLICY "job_openings_org_access" ON job_openings
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- job_form_questions: acesso total para autenticados da organização
CREATE POLICY "job_form_questions_org_access" ON job_form_questions
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- candidates: autenticados da organização têm acesso total
CREATE POLICY "candidates_org_access" ON candidates
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- candidates: INSERT público (candidatos externos sem conta)
CREATE POLICY "candidates_public_insert" ON candidates
  FOR INSERT WITH CHECK (true);

-- applications: autenticados da organização têm acesso total
CREATE POLICY "applications_org_access" ON applications
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- applications: INSERT público (candidatos externos sem conta)
CREATE POLICY "applications_public_insert" ON applications
  FOR INSERT WITH CHECK (true);

-- job_openings: SELECT público para vagas abertas (página pública)
CREATE POLICY "job_openings_public_select" ON job_openings
  FOR SELECT USING (status = 'aberta');

-- job_form_questions: SELECT público para perguntas de vagas abertas
CREATE POLICY "job_form_questions_public_select" ON job_form_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM job_openings jo
      WHERE jo.id = job_opening_id AND jo.status = 'aberta'
    )
  );
