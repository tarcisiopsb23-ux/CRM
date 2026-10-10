-- =============================================================================
-- MAESTR.IA - Permissões: apenas owner pode conceder can_delete
-- =============================================================================

DROP POLICY IF EXISTS user_permissions_insert ON user_permissions;
DROP POLICY IF EXISTS user_permissions_update ON user_permissions;

CREATE POLICY user_permissions_insert ON user_permissions FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND (
      (can_delete = true AND user_has_role(ARRAY['owner']::user_role[]))
      OR (can_delete = false AND user_has_role(ARRAY['owner', 'admin']::user_role[]))
    )
  );

CREATE POLICY user_permissions_update ON user_permissions FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND (
      (can_delete = true AND user_has_role(ARRAY['owner']::user_role[]))
      OR (can_delete = false AND user_has_role(ARRAY['owner', 'admin']::user_role[]))
    )
  );
