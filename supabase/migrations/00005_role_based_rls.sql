-- =============================================================================
-- MAESTR.IA - Role-based RLS for leads
-- =============================================================================
-- viewer: SELECT only | member/manager/admin/owner: full CRUD
-- =============================================================================

DROP POLICY IF EXISTS leads_all ON leads;

-- viewer: read-only
CREATE POLICY leads_select ON leads FOR SELECT
  USING (organization_id = get_user_organization_id());

-- member, manager, admin, owner: full CRUD
CREATE POLICY leads_insert ON leads FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin', 'manager', 'member']::user_role[])
  );

CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin', 'manager', 'member']::user_role[])
  );

CREATE POLICY leads_delete ON leads FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin', 'manager']::user_role[])
  );
