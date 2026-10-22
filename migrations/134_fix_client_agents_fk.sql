-- Migration 134: Corrige FK de client_agents.crm_user_id
--
-- O crm_user_id estava referenciando client_crm_users.id, mas os usuários
-- do C8 Control são identificados pelo dashboard_users.id (não client_crm_users).
-- Remove a FK restritiva e adiciona referência ao dashboard_users.
--
-- Isso resolve o 409 no ensure_client_agent quando o usuário C8 Control
-- tenta se registrar como agente.

-- 1. Remove a FK antiga
ALTER TABLE public.client_agents
  DROP CONSTRAINT IF EXISTS client_agents_crm_user_id_fkey;

-- 2. Adiciona FK para dashboard_users (onde os usuários C8 Control realmente vivem)
--    ON DELETE SET NULL para não perder dados de histórico se o usuário for removido
ALTER TABLE public.client_agents
  ADD CONSTRAINT client_agents_crm_user_id_fkey
  FOREIGN KEY (crm_user_id)
  REFERENCES public.dashboard_users(id)
  ON DELETE SET NULL;

-- 3. Corrige ensure_client_agent — versão simplificada sem lookup desnecessário
-- (agora a FK aponta para dashboard_users, então auth.user.id pode ser inserido diretamente)
DROP FUNCTION IF EXISTS public.ensure_client_agent(UUID, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.ensure_client_agent(
  p_client_id       UUID,
  p_organization_id UUID,
  p_crm_user_id     UUID,   -- dashboard_users.id (= auth.user.id do C8 Control)
  p_display_name    TEXT,
  p_avatar_url      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  INSERT INTO public.client_agents(
    client_id, organization_id, crm_user_id, display_name, avatar_url, is_active
  )
  VALUES(
    p_client_id, p_organization_id, p_crm_user_id,
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
    'crm_user_id', p_crm_user_id
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_client_agent(UUID,UUID,UUID,TEXT,TEXT)
  TO authenticated, anon, service_role;

-- 4. set_agent_status já foi corrigida na migration 133
--    Apenas garante o GRANT para anon (necessário para C8 Control)
GRANT EXECUTE ON FUNCTION public.set_agent_status(UUID, TEXT, UUID)
  TO anon, service_role;

-- Versão
INSERT INTO public.schema_migrations (version)
VALUES ('134_fix_client_agents_fk')
ON CONFLICT (version) DO NOTHING;
