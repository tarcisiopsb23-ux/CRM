-- Migration 00095: tabela audit_log_360
-- Requirements: 6.3, 10.1, 10.2, 10.3

CREATE TABLE IF NOT EXISTS audit_log_360 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  previous_data   JSONB,
  new_data        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_360_org ON audit_log_360(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_360_entity ON audit_log_360(entity_type, entity_id);

ALTER TABLE audit_log_360 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON audit_log_360;
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log_360;

-- SELECT: apenas admin/owner
CREATE POLICY "audit_log_select" ON audit_log_360 FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = audit_log_360.organization_id
        AND p.role IN ('admin','owner')
    )
  );

-- INSERT: service_role ou qualquer usuário autenticado (operações do sistema)
CREATE POLICY "audit_log_insert" ON audit_log_360 FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);
