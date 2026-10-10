BEGIN;

CREATE TABLE IF NOT EXISTS job_title_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, job_title)
);

CREATE INDEX IF NOT EXISTS idx_job_title_catalog_org ON job_title_catalog(organization_id);

ALTER TABLE job_title_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_title_catalog_select ON job_title_catalog;
CREATE POLICY job_title_catalog_select ON job_title_catalog FOR SELECT
  USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS job_title_catalog_insert ON job_title_catalog;
CREATE POLICY job_title_catalog_insert ON job_title_catalog FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_catalog_update ON job_title_catalog;
CREATE POLICY job_title_catalog_update ON job_title_catalog FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS job_title_catalog_delete ON job_title_catalog;
CREATE POLICY job_title_catalog_delete ON job_title_catalog FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

CREATE TRIGGER update_job_title_catalog_updated
  BEFORE UPDATE ON job_title_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS audit_job_title_catalog ON job_title_catalog;
CREATE TRIGGER audit_job_title_catalog
  AFTER INSERT OR UPDATE OR DELETE ON job_title_catalog
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

INSERT INTO job_title_catalog (organization_id, job_title)
SELECT o.id, jt.job_title
FROM organizations o
CROSS JOIN (
  VALUES
    ('CEO'),
    ('CFO'),
    ('CMO'),
    ('COO'),
    ('VP'),
    ('Gerente'),
    ('Supervisor'),
    ('Assistente'),
    ('Analista Júnior'),
    ('Analista Pleno'),
    ('Analista Sênior'),
    ('Produtor'),
    ('Técnico'),
    ('Auxiliar Administrativo'),
    ('Estagiário'),
    ('Serviços Gerais')
) AS jt(job_title)
ON CONFLICT (organization_id, job_title) DO NOTHING;

CREATE OR REPLACE FUNCTION job_title_rename(p_old TEXT, p_new TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  org_id UUID;
  is_allowed BOOLEAN;
BEGIN
  org_id := get_user_organization_id();
  is_allowed := user_has_role(ARRAY['owner','admin']::user_role[]);
  IF NOT is_allowed THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE job_title_catalog
  SET job_title = p_new
  WHERE organization_id = org_id AND job_title = p_old;

  UPDATE job_title_role_mappings
  SET job_title = p_new
  WHERE organization_id = org_id AND job_title = p_old;

  UPDATE job_title_permissions
  SET job_title = p_new
  WHERE organization_id = org_id AND job_title = p_old;

  UPDATE profiles
  SET metadata = jsonb_set(metadata, '{job_title}', to_jsonb(p_new), true)
  WHERE organization_id = org_id AND (metadata->>'job_title') = p_old;

  UPDATE profiles
  SET metadata = jsonb_set(metadata, '{cargo}', to_jsonb(p_new), true)
  WHERE organization_id = org_id AND (metadata->>'cargo') = p_old;
END;
$$;

CREATE OR REPLACE FUNCTION job_title_delete(p_job_title TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  org_id UUID;
  is_allowed BOOLEAN;
BEGIN
  org_id := get_user_organization_id();
  is_allowed := user_has_role(ARRAY['owner','admin']::user_role[]);
  IF NOT is_allowed THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  DELETE FROM job_title_permissions
  WHERE organization_id = org_id AND job_title = p_job_title;

  DELETE FROM job_title_role_mappings
  WHERE organization_id = org_id AND job_title = p_job_title;

  DELETE FROM job_title_catalog
  WHERE organization_id = org_id AND job_title = p_job_title;
END;
$$;

GRANT EXECUTE ON FUNCTION job_title_rename(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION job_title_delete(TEXT) TO authenticated;

COMMIT;

