-- Migration 00088: tabela employee_absences
-- Requirements: 19.6, 11.1

CREATE TABLE IF NOT EXISTS employee_absences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  collaborator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('ferias','atestado','falta')),
  data_inicio     DATE NOT NULL,
  data_fim        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('aprovado','pendente')),
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_datas CHECK (data_fim >= data_inicio)
);

-- RLS
ALTER TABLE employee_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_absences_rw" ON employee_absences;

CREATE POLICY "employee_absences_rw" ON employee_absences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = employee_absences.organization_id
        AND (
          p.role IN ('admin','owner')
          OR EXISTS (
            SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id
            WHERE tm.profile_id = employee_absences.collaborator_id
              AND t.lead_id = auth.uid()
          )
        )
    )
  );
