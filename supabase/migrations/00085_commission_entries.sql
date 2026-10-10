-- Migration 00085: commission_entries table
-- Requirements: 19.3

CREATE TABLE IF NOT EXISTS commission_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month_reference   DATE NOT NULL,
  total_sales_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  contracts_count   INTEGER NOT NULL DEFAULT 0,
  commission_rate   DECIMAL(5,2) NOT NULL DEFAULT 0,
  commission_value  DECIMAL(12,2) NOT NULL DEFAULT 0,
  goal_id           UUID REFERENCES goals(id) ON DELETE SET NULL,
  goal_target       DECIMAL(12,2),
  goal_achieved_pct DECIMAL(6,2),
  bonus_rate        DECIMAL(5,2) DEFAULT 0,
  bonus_value       DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_board_member   BOOLEAN NOT NULL DEFAULT false,
  entry_type        TEXT NOT NULL CHECK (entry_type IN ('automatic','manual')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, month_reference, entry_type)
);

-- RLS
ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_entries_select" ON commission_entries;
CREATE POLICY "commission_entries_select" ON commission_entries FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.profile_id = commission_entries.profile_id
        AND t.lead_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','owner')
        AND p.organization_id = commission_entries.organization_id
    )
  );

DROP POLICY IF EXISTS "commission_entries_write" ON commission_entries;
CREATE POLICY "commission_entries_write" ON commission_entries
  FOR ALL USING (auth.role() = 'service_role');
