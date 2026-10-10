BEGIN;

CREATE OR REPLACE FUNCTION sync_contract_suspensions(p_org_id UUID, p_overdue_days INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_org UUID;
  v_days INT;
  v_updated INT;
BEGIN
  v_role := current_setting('request.jwt.claim.role', true);
  v_org := get_user_organization_id();
  v_days := GREATEST(0, COALESCE(p_overdue_days, 30));

  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF NOT user_has_role(ARRAY['owner','admin']::user_role[]) THEN
      RETURN 0;
    END IF;
    IF p_org_id IS NULL OR v_org IS NULL OR p_org_id <> v_org THEN
      RETURN 0;
    END IF;
  END IF;

  UPDATE contracts c
  SET
    status = 'suspenso',
    metadata = jsonb_set(
      COALESCE(c.metadata, '{}'::jsonb), 
      '{suspended_at}', 
      to_jsonb(NOW() AT TIME ZONE 'UTC'), 
      true
    ) || jsonb_build_object('suspended_reason', 'Suspensão automática por atraso > ' || v_days || ' dias')
  WHERE c.organization_id = p_org_id
    AND c.status = 'ativo'
    AND EXISTS (
      SELECT 1
      FROM payments p
      WHERE p.organization_id = c.organization_id
        AND p.contract_id = c.id
        AND p.paid_at IS NULL
        AND (p.status IS NULL OR p.status NOT IN ('pago','cancelado'))
        AND p.due_date < ((NOW() AT TIME ZONE 'UTC')::date - v_days)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION sync_contract_suspensions(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_contract_suspensions(UUID, INT) TO authenticated;

COMMIT;

