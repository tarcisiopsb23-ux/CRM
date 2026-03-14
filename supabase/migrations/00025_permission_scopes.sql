BEGIN;

CREATE TABLE IF NOT EXISTS user_permission_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module permission_module NOT NULL,
  scope TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_id, module, scope)
);

CREATE INDEX IF NOT EXISTS idx_user_permission_scopes_user_org
  ON user_permission_scopes(user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_user_permission_scopes_org
  ON user_permission_scopes(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_permission_scopes_org_mod
  ON user_permission_scopes(organization_id, module);

CREATE TABLE IF NOT EXISTS job_title_permission_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  module permission_module NOT NULL,
  scope TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, job_title, module, scope)
);

CREATE INDEX IF NOT EXISTS idx_job_title_permission_scopes_org
  ON job_title_permission_scopes(organization_id);

CREATE INDEX IF NOT EXISTS idx_job_title_permission_scopes_org_title
  ON job_title_permission_scopes(organization_id, job_title);

CREATE INDEX IF NOT EXISTS idx_job_title_permission_scopes_org_mod
  ON job_title_permission_scopes(organization_id, module);

ALTER TABLE user_permission_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_title_permission_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_permission_scopes_select ON user_permission_scopes;
CREATE POLICY user_permission_scopes_select ON user_permission_scopes FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_id = auth.uid()
      OR user_has_role(ARRAY['owner', 'admin']::user_role[])
    )
  );

DROP POLICY IF EXISTS user_permission_scopes_insert ON user_permission_scopes;
CREATE POLICY user_permission_scopes_insert ON user_permission_scopes FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS user_permission_scopes_update ON user_permission_scopes;
CREATE POLICY user_permission_scopes_update ON user_permission_scopes FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS user_permission_scopes_delete ON user_permission_scopes;
CREATE POLICY user_permission_scopes_delete ON user_permission_scopes FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_permission_scopes_select ON job_title_permission_scopes;
CREATE POLICY job_title_permission_scopes_select ON job_title_permission_scopes FOR SELECT
  USING (
    organization_id = get_user_organization_id()
  );

DROP POLICY IF EXISTS job_title_permission_scopes_insert ON job_title_permission_scopes;
CREATE POLICY job_title_permission_scopes_insert ON job_title_permission_scopes FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_permission_scopes_update ON job_title_permission_scopes;
CREATE POLICY job_title_permission_scopes_update ON job_title_permission_scopes FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_permission_scopes_delete ON job_title_permission_scopes;
CREATE POLICY job_title_permission_scopes_delete ON job_title_permission_scopes FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

CREATE TRIGGER update_user_permission_scopes_updated
  BEFORE UPDATE ON user_permission_scopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_title_permission_scopes_updated
  BEFORE UPDATE ON job_title_permission_scopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS audit_user_permission_scopes ON user_permission_scopes;
CREATE TRIGGER audit_user_permission_scopes
  AFTER INSERT OR UPDATE OR DELETE ON user_permission_scopes
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_job_title_permission_scopes ON job_title_permission_scopes;
CREATE TRIGGER audit_job_title_permission_scopes
  AFTER INSERT OR UPDATE OR DELETE ON job_title_permission_scopes
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

COMMIT;
