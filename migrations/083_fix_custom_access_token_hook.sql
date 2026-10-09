-- =============================================================================
-- Migration 083: Corrige custom_access_token_hook para suportar client_id
--
-- Problema: usuários do C8 Control migrados para o Banco A têm client_id
-- no raw_user_meta_data em vez de tenant_id. O hook anterior só lia tenant_id,
-- causando tenant_id = null no JWT → useAuth detectava como sessão de suporte.
--
-- Solução: lê tenant_id com fallback para client_id.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id TEXT;
  v_role      TEXT;
BEGIN
  -- tenant_id: tenta 'tenant_id' primeiro, depois 'client_id' como fallback
  -- (usuários do C8 Control migrados podem ter client_id em vez de tenant_id)
  v_tenant_id := COALESCE(
    event->'claims'->'user_metadata'->>'tenant_id',
    event->'claims'->'user_metadata'->>'client_id'
  );

  v_role := COALESCE(
    event->'claims'->'user_metadata'->>'role',
    'member'
  );

  RETURN jsonb_set(
    jsonb_set(
      event,
      '{claims,tenant_id}',
      CASE WHEN v_tenant_id IS NOT NULL
        THEN to_jsonb(v_tenant_id)
        ELSE 'null'::jsonb
      END
    ),
    '{claims,role}',
    to_jsonb(v_role)
  );
END;
$$;
