-- =============================================================================
-- MAESTR.IA - CRM Client Plans (idempotente)
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_client_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  plan_value       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  modules          TEXT[] NOT NULL DEFAULT '{}',
  max_users        INTEGER NOT NULL DEFAULT 1,
  due_day          INTEGER NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
  subscription_status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (subscription_status IN ('ativo', 'inadimplente', 'bloqueado', 'cancelado')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_client_plans_client_id
  ON crm_client_plans(client_id);

CREATE INDEX IF NOT EXISTS idx_crm_client_plans_organization_id
  ON crm_client_plans(organization_id);

-- RLS
ALTER TABLE crm_client_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_client_plans_all ON crm_client_plans;
CREATE POLICY crm_client_plans_all
  ON crm_client_plans
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- Trigger updated_at (idempotente)
DROP TRIGGER IF EXISTS trg_crm_client_plans_updated_at ON crm_client_plans;
CREATE TRIGGER trg_crm_client_plans_updated_at
  BEFORE UPDATE ON crm_client_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
