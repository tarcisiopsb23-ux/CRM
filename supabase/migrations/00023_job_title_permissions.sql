BEGIN;

CREATE TABLE IF NOT EXISTS job_title_role_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  mapped_role user_role,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, job_title)
);

CREATE INDEX IF NOT EXISTS idx_job_title_role_mappings_org ON job_title_role_mappings(organization_id);

CREATE TABLE IF NOT EXISTS job_title_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  module permission_module NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, job_title, module)
);

CREATE INDEX IF NOT EXISTS idx_job_title_permissions_org ON job_title_permissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_title_permissions_org_title ON job_title_permissions(organization_id, job_title);

ALTER TABLE job_title_role_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_title_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_title_role_mappings_select ON job_title_role_mappings;
CREATE POLICY job_title_role_mappings_select ON job_title_role_mappings FOR SELECT
  USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS job_title_role_mappings_insert ON job_title_role_mappings;
CREATE POLICY job_title_role_mappings_insert ON job_title_role_mappings FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_role_mappings_update ON job_title_role_mappings;
CREATE POLICY job_title_role_mappings_update ON job_title_role_mappings FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_role_mappings_delete ON job_title_role_mappings;
CREATE POLICY job_title_role_mappings_delete ON job_title_role_mappings FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_permissions_select ON job_title_permissions;
CREATE POLICY job_title_permissions_select ON job_title_permissions FOR SELECT
  USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS job_title_permissions_insert ON job_title_permissions;
CREATE POLICY job_title_permissions_insert ON job_title_permissions FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_permissions_update ON job_title_permissions;
CREATE POLICY job_title_permissions_update ON job_title_permissions FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_permissions_delete ON job_title_permissions;
CREATE POLICY job_title_permissions_delete ON job_title_permissions FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

CREATE TRIGGER update_job_title_role_mappings_updated
  BEFORE UPDATE ON job_title_role_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_title_permissions_updated
  BEFORE UPDATE ON job_title_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS audit_job_title_role_mappings ON job_title_role_mappings;
CREATE TRIGGER audit_job_title_role_mappings
  AFTER INSERT OR UPDATE OR DELETE ON job_title_role_mappings
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_job_title_permissions ON job_title_permissions;
CREATE TRIGGER audit_job_title_permissions
  AFTER INSERT OR UPDATE OR DELETE ON job_title_permissions
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

COMMIT;
