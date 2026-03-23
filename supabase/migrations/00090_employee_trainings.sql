-- Migration 00090: tabela employee_trainings
-- Requirements: 19.8, 13.1

CREATE TABLE IF NOT EXISTS employee_trainings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  collaborator_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome_treinamento TEXT NOT NULL,
  data             DATE,
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('concluido','pendente')),
  resultado        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE employee_trainings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_trainings_rw" ON employee_trainings;

CREATE POLICY "employee_trainings_rw" ON employee_trainings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = employee_trainings.organization_id
        AND p.role IN ('admin','owner')
    )
  );
