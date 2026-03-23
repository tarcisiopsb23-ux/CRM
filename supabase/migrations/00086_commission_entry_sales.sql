-- =============================================================================
-- Migration 00086: Tabela commission_entry_sales
-- Refs: Requirements 19.4
-- =============================================================================

CREATE TABLE IF NOT EXISTS commission_entry_sales (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_entry_id  UUID NOT NULL REFERENCES commission_entries(id) ON DELETE CASCADE,
  contract_id          UUID NOT NULL,
  client_name          TEXT NOT NULL,
  product              TEXT,
  sale_date            DATE,
  first_payment_date   DATE,
  value                DECIMAL(12,2) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE commission_entry_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_entry_sales_select" ON commission_entry_sales;
CREATE POLICY "commission_entry_sales_select" ON commission_entry_sales FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM commission_entries ce
      WHERE ce.id = commission_entry_sales.commission_entry_id
        AND (
          ce.profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM teams t
            JOIN team_members tm ON tm.team_id = t.id
            WHERE tm.profile_id = ce.profile_id
              AND t.lead_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin','owner')
              AND p.organization_id = ce.organization_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "commission_entry_sales_write" ON commission_entry_sales;
CREATE POLICY "commission_entry_sales_write" ON commission_entry_sales
  FOR ALL USING (auth.role() = 'service_role');
