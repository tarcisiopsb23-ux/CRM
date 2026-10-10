-- =============================================================================
-- MAESTR.IA - User Permissions (per-module access control)
-- =============================================================================
-- Controle de permissões por usuário e módulo
-- RLS: owner/admin podem gerenciar; usuários podem ler próprias permissões
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_module') THEN
    CREATE TYPE permission_module AS ENUM (
      'kanban', 'clients', 'financial', 'projects',
      'agenda', 'goals', 'team', 'settings'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module permission_module NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_org
  ON user_permissions(user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_user_permissions_org
  ON user_permissions(organization_id);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Admin/owner podem ver e gerenciar todas as permissões da org
CREATE POLICY user_permissions_select ON user_permissions FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_id = auth.uid()
      OR user_has_role(ARRAY['owner', 'admin']::user_role[])
    )
  );

CREATE POLICY user_permissions_insert ON user_permissions FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

CREATE POLICY user_permissions_update ON user_permissions FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

CREATE POLICY user_permissions_delete ON user_permissions FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

CREATE TRIGGER update_user_permissions_updated
  BEFORE UPDATE ON user_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
