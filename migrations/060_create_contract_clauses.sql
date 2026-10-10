-- Migration: 059_create_contract_clauses.sql
-- Creates the contract_clauses table with RLS policies
-- Requirements: 2.1, 10.1, 10.4

CREATE TABLE contract_clauses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  content         JSONB NOT NULL,
  display_order   INTEGER NOT NULL DEFAULT 0,
  condition_type  TEXT NOT NULL DEFAULT 'always'
                  CHECK (condition_type IN (
                    'always',
                    'has_setup',
                    'has_min_duration',
                    'has_service',
                    'has_setup_installments'
                  )),
  condition_value TEXT,
  is_editable     BOOLEAN NOT NULL DEFAULT false,
  service_id      UUID REFERENCES service_catalog(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE contract_clauses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT — organization members can read their own clauses
CREATE POLICY "contract_clauses_select_policy"
  ON contract_clauses
  FOR SELECT
  USING (organization_id = get_user_organization_id());

-- RLS Policy: INSERT — organization members can create clauses for their organization
CREATE POLICY "contract_clauses_insert_policy"
  ON contract_clauses
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

-- RLS Policy: UPDATE — organization members can update their own clauses
CREATE POLICY "contract_clauses_update_policy"
  ON contract_clauses
  FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- RLS Policy: DELETE — organization members can delete their own clauses
CREATE POLICY "contract_clauses_delete_policy"
  ON contract_clauses
  FOR DELETE
  USING (organization_id = get_user_organization_id());
