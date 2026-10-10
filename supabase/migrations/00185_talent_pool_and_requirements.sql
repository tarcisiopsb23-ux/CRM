-- =============================================================================
-- Migration 00185: Banco de Talentos + Requisitos pontuados por vaga
-- =============================================================================

-- ── 1. Coluna requirements_list em job_openings ───────────────────────────────
-- Armazena requisitos estruturados: [{label, weight, is_required}]
ALTER TABLE job_openings
  ADD COLUMN IF NOT EXISTS requirements_list JSONB DEFAULT '[]'::jsonb;

-- ── 2. Tabela talent_pool ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS talent_pool (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  linkedin_url        TEXT,
  portfolio_url       TEXT,
  resume_drive_url    TEXT,
  desired_role        TEXT,          -- cargo desejado (texto livre)
  cover_letter        TEXT,
  -- Requisitos marcados pelo candidato: [{label, weight, checked}]
  requirements_match  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Respostas ao questionário geral (se houver)
  answers             JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Scoring
  score_requirements  NUMERIC(8,2) DEFAULT 0,  -- pontos dos requisitos marcados
  score_answers       NUMERIC(8,2) DEFAULT 0,  -- pontos das respostas
  score_total         NUMERIC(8,2) DEFAULT 0,
  score_max           NUMERIC(8,2) DEFAULT 0,
  score_percent       NUMERIC(5,2)  DEFAULT 0,
  -- Status
  status              TEXT NOT NULL DEFAULT 'novo'
                      CHECK (status IN ('novo','em_analise','aprovado','reprovado','contratado')),
  notes               TEXT,
  source              TEXT DEFAULT 'web' CHECK (source IN ('web','manual')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_talent_pool_org_score
  ON talent_pool(organization_id, score_percent DESC);

-- ── 3. Coluna requirements_match em applications ──────────────────────────────
-- Armazena quais requisitos o candidato marcou ao se candidatar
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS requirements_match JSONB DEFAULT '[]'::jsonb;
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS score_requirements NUMERIC(8,2) DEFAULT 0;

-- ── 4. RLS talent_pool ────────────────────────────────────────────────────────
ALTER TABLE talent_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_public_insert" ON talent_pool
  FOR INSERT WITH CHECK (true);

CREATE POLICY "tp_auth_all" ON talent_pool
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── 5. RPC pública: busca requirements_list de uma vaga ──────────────────────
CREATE OR REPLACE FUNCTION public.get_job_requirements(p_job_opening_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_list JSONB;
BEGIN
  SELECT COALESCE(requirements_list, '[]'::jsonb)
  INTO v_list
  FROM job_openings
  WHERE id = p_job_opening_id AND status = 'aberta';
  RETURN COALESCE(v_list, '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_job_requirements(UUID) TO anon, authenticated;

-- ── 6. RPC pública: submete candidatura ao banco de talentos ─────────────────
CREATE OR REPLACE FUNCTION public.submit_talent_pool(
  p_organization_id     UUID,
  p_full_name           TEXT,
  p_email               TEXT,
  p_phone               TEXT,
  p_linkedin_url        TEXT,
  p_portfolio_url       TEXT,
  p_desired_role        TEXT,
  p_cover_letter        TEXT,
  p_requirements_match  JSONB,
  p_answers             JSONB,
  p_score_requirements  NUMERIC,
  p_score_answers       NUMERIC,
  p_score_total         NUMERIC,
  p_score_max           NUMERIC,
  p_score_percent       NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO talent_pool (
    organization_id, full_name, email, phone, linkedin_url, portfolio_url,
    desired_role, cover_letter, requirements_match, answers,
    score_requirements, score_answers, score_total, score_max, score_percent
  ) VALUES (
    p_organization_id, p_full_name, p_email, p_phone, p_linkedin_url, p_portfolio_url,
    p_desired_role, p_cover_letter, p_requirements_match, p_answers,
    p_score_requirements, p_score_answers, p_score_total, p_score_max, p_score_percent
  )
  ON CONFLICT (organization_id, email) DO UPDATE SET
    full_name           = EXCLUDED.full_name,
    phone               = EXCLUDED.phone,
    linkedin_url        = EXCLUDED.linkedin_url,
    portfolio_url       = EXCLUDED.portfolio_url,
    desired_role        = EXCLUDED.desired_role,
    cover_letter        = EXCLUDED.cover_letter,
    requirements_match  = EXCLUDED.requirements_match,
    answers             = EXCLUDED.answers,
    score_requirements  = EXCLUDED.score_requirements,
    score_answers       = EXCLUDED.score_answers,
    score_total         = EXCLUDED.score_total,
    score_max           = EXCLUDED.score_max,
    score_percent       = EXCLUDED.score_percent,
    updated_at          = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_talent_pool(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
