CREATE TABLE contract_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Template Padrão',
  content         TEXT NOT NULL DEFAULT '',
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contract_templates_default
  ON contract_templates(organization_id) WHERE is_default = true;

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contract_templates_org" ON contract_templates
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE TRIGGER update_contract_templates_updated
  BEFORE UPDATE ON contract_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
