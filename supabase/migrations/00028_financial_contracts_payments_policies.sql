BEGIN;

-- Contracts: manager/member podem criar; owner/admin podem criar/editar/excluir; viewer sem acesso.
DROP POLICY IF EXISTS contracts_all ON contracts;

CREATE POLICY contracts_select_owner_admin_manager_member
ON contracts
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin','manager','member']::user_role[])
);

CREATE POLICY contracts_insert_owner_admin_manager_member
ON contracts
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin','manager','member']::user_role[])
);

CREATE POLICY contracts_update_owner_admin_only
ON contracts
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin']::user_role[])
);

CREATE POLICY contracts_delete_owner_admin_only
ON contracts
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin']::user_role[])
);

-- Payments (receitas): viewer sem acesso; manager/member podem criar/editar; delete só owner/admin.
DROP POLICY IF EXISTS payments_all ON payments;

CREATE POLICY payments_select_owner_admin_manager_member
ON payments
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin','manager','member']::user_role[])
);

CREATE POLICY payments_insert_owner_admin_manager_member
ON payments
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin','manager','member']::user_role[])
);

CREATE POLICY payments_update_owner_admin_manager_member
ON payments
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin','manager','member']::user_role[])
);

CREATE POLICY payments_delete_owner_admin_only
ON payments
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin']::user_role[])
);

COMMIT;

