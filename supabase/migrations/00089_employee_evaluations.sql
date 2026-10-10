-- Migration 00089: tabela employee_evaluations
-- Requirements: 19.7, 12.1

CREATE TABLE IF NOT EXISTS employee_evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  collaborator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  periodo         TEXT NOT NULL,
  produtividade   DECIMAL(4,1) CHECK (produtividade BETWEEN 0 AND 10),
  qualidade       DECIMAL(4,1) CHECK (qualidade BETWEEN 0 AND 10),
  pontualidade    DECIMAL(4,1) CHECK (pontualidade BETWEEN 0 AND 10),
  comportamento   DECIMAL(4,1) CHECK (comportamento BETWEEN 0 AND 10),
  nota_final      DECIMAL(4,1),
  feedback        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE employee_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_evaluations_rw" ON employee_evaluations;

CREATE POLICY "employee_evaluations_rw" ON employee_evaluations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = employee_evaluations.organization_id
        AND (
          p.role IN ('admin','owner')
          OR EXISTS (
            SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id
            WHERE tm.profile_id = employee_evaluations.collaborator_id
              AND t.lead_id = auth.uid()
          )
        )
    )
  );
