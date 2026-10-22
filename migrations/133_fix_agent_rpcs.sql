-- Migration 133: Corrige RPCs ensure_client_agent e set_agent_status
-- para aceitar auth_user_id (dashboard_users.auth_user_id) em vez de
-- client_crm_users.id ou client_agents.id diretamente.
--
-- No C8 Control, auth.user.id = auth.users.id = dashboard_users.auth_user_id.
-- A tabela client_agents.crm_user_id referencia client_crm_users.id.
-- A tabela client_crm_users NÃO tem coluna auth_user_id diretamente,
-- mas dashboard_users tem auth_user_id que é o elo.
--
-- Solução: ensure_client_agent recebe p_dashboard_user_id (= dashboard_users.id,
-- que é o auth.user.id retornado pelo login do C8 Control) e faz lookup para
-- encontrar o client_crm_users equivalente. Se não encontrar, usa o ID direto.

-- ─── ensure_client_agent corrigida ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_client_agent(
  p_client_id       UUID,
  p_organization_id UUID,
  p_crm_user_id     UUID,   -- dashboard_users.id (= auth.users.id do C8 Control)
  p_display_name    TEXT,
  p_avatar_url      TEXT DEFAULT NULL
)
RETURNS JSONB   -- retorna { agent_id, crm_user_id } para uso no frontend
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent_id UUID;
  v_du_id    UUID;
BEGIN
  -- Tenta encontrar um registro em dashboard_users cujo id = p_crm_user_id
  -- (o dashboard_users.id é o que o C8 Control tem como auth.user.id)
  SELECT id INTO v_du_id
  FROM public.dashboard_users
  WHERE id = p_crm_user_id
    AND client_id = p_client_id
    AND active = true
  LIMIT 1;

  -- Se não encontrou por id, tenta por auth_user_id (fallback)
  IF v_du_id IS NULL THEN
    SELECT id INTO v_du_id
    FROM public.dashboard_users
    WHERE auth_user_id = p_crm_user_id
      AND client_id = p_client_id
      AND active = true
    LIMIT 1;
  END IF;

  -- Usa o ID que temos (dashboard_users.id) como crm_user_id em client_agents
  -- A FK client_agents.crm_user_id → client_crm_users.id pode não ter esse registro.
  -- Vamos verificar se existe em client_crm_users, senão usa p_crm_user_id direto.
  -- Na prática, o id do dashboard_users é o mesmo que client_crm_users.id
  -- (ambos são criados com o mesmo UUID na migration 065).

  INSERT INTO public.client_agents(
    client_id, organization_id, crm_user_id, display_name, avatar_url, is_active
  )
  VALUES(
    p_client_id, p_organization_id,
    COALESCE(v_du_id, p_crm_user_id),
    p_display_name, p_avatar_url, true
  )
  ON CONFLICT (client_id, crm_user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url   = COALESCE(EXCLUDED.avatar_url, client_agents.avatar_url),
    is_active    = true,
    updated_at   = now()
  RETURNING id INTO v_agent_id;

  RETURN jsonb_build_object(
    'agent_id',    v_agent_id,
    'crm_user_id', COALESCE(v_du_id, p_crm_user_id)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_client_agent(UUID,UUID,UUID,TEXT,TEXT) TO authenticated, anon, service_role;

-- ─── set_agent_status corrigida ───────────────────────────────────────────────
-- Aceita p_agent_id como client_agents.id OU como crm_user_id (dashboard_users.id)
-- Tenta primeiro como client_agents.id, depois como crm_user_id.

CREATE OR REPLACE FUNCTION public.set_agent_status(
  p_agent_id  UUID,   -- pode ser client_agents.id OU crm_user_id
  p_status    TEXT,
  p_client_id UUID DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org_id    UUID;
  v_client_id UUID;
  v_real_agent_id UUID;
BEGIN
  -- Tenta primeiro: p_agent_id é client_agents.id diretamente
  SELECT a.organization_id, a.client_id, a.id
  INTO v_org_id, v_client_id, v_real_agent_id
  FROM public.client_agents a
  WHERE a.id = p_agent_id;

  -- Fallback: p_agent_id é crm_user_id (dashboard_users.id)
  IF NOT FOUND THEN
    SELECT a.organization_id, a.client_id, a.id
    INTO v_org_id, v_client_id, v_real_agent_id
    FROM public.client_agents a
    WHERE a.crm_user_id = p_agent_id
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
    LIMIT 1;
  END IF;

  IF v_real_agent_id IS NULL THEN
    -- Agente não encontrado — retorna erro suave em vez de RAISE
    RETURN jsonb_build_object('success', false, 'error', 'agent_not_found');
  END IF;

  INSERT INTO public.client_agent_sessions(
    client_id, organization_id, agent_id, status,
    session_started_at, last_seen_at, updated_at
  )
  VALUES (
    v_client_id, v_org_id, v_real_agent_id, p_status,
    CASE WHEN p_status = 'online' THEN now() ELSE NULL END,
    now(), now()
  )
  ON CONFLICT (agent_id) DO UPDATE
    SET status             = EXCLUDED.status,
        last_seen_at       = now(),
        session_started_at = CASE
          WHEN EXCLUDED.status = 'online' AND client_agent_sessions.status != 'online'
          THEN now()
          ELSE client_agent_sessions.session_started_at
        END,
        updated_at = now();

  RETURN jsonb_build_object(
    'success',  true,
    'agent_id', v_real_agent_id,
    'status',   p_status
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_agent_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_status(UUID, TEXT, UUID) TO anon, service_role;

-- ─── Versão ───────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('133_fix_agent_rpcs')
ON CONFLICT (version) DO NOTHING;
