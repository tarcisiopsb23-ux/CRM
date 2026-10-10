-- =============================================================================
-- MAESTR.IA - Tabelas de Relatórios e Realtime (tasks/events)
-- =============================================================================
-- report_templates, report_snapshots (referenciadas em 00002)
-- Adiciona tasks e events ao realtime (tabelas criadas em 00011)
-- Policies para teams e team_members (suporte à página Equipe)
-- =============================================================================

-- =============================================================================
-- 0. POLICIES teams e team_members (se ainda não existirem)
-- =============================================================================
DROP POLICY IF EXISTS teams_all ON teams;
CREATE POLICY teams_all ON teams FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS team_members_all ON team_members;
CREATE POLICY team_members_all ON team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.organization_id = get_user_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.organization_id = get_user_organization_id()
    )
  );

-- =============================================================================

-- =============================================================================
-- 1. REPORT_TEMPLATES
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  report_type report_type NOT NULL DEFAULT 'custom',
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_organization_id ON report_templates(organization_id);
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_templates_all ON report_templates;
CREATE POLICY report_templates_all ON report_templates FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

DROP TRIGGER IF EXISTS update_report_templates_updated ON report_templates;
CREATE TRIGGER update_report_templates_updated
  BEFORE UPDATE ON report_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. REPORT_SNAPSHOTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL,
  report_type report_type NOT NULL DEFAULT 'custom',
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_organization_id ON report_snapshots(organization_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_template_id ON report_snapshots(template_id);
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_snapshots_all ON report_snapshots;
CREATE POLICY report_snapshots_all ON report_snapshots FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- =============================================================================
-- 3. REALTIME (tasks e events criados em 00011)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='tasks')
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='events')
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
  END IF;
END $$;
