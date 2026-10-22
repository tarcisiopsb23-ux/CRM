-- Migration 135: Remove FK de client_agents.crm_user_id
--
-- O crm_user_id é o auth.users.id do usuário logado no C8 Control.
-- Não existe uma tabela única que garanta todos os IDs possíveis,
-- pois o sistema usa dashboard_users (auth interno) com auth_user_id separado.
-- A FK estava causando 409 em todos os casos. Removendo-a, o campo fica
-- como referência livre — o valor ainda é significativo para joins manuais.

ALTER TABLE public.client_agents
  DROP CONSTRAINT IF EXISTS client_agents_crm_user_id_fkey;

-- Adicionar índice para lookup eficiente por crm_user_id (sem FK)
CREATE INDEX IF NOT EXISTS idx_cagent_crm_user_id
  ON public.client_agents(crm_user_id);

-- Garante que ensure_client_agent usa o auth.users.id diretamente
DROP FUNCTION IF EXISTS public.ensure_client_agent(UUID, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.ensure_client_agent(
  p_client_id       UUID,
  p_organization_id UUID,
  p_crm_user_id     UUID,   -- auth.users.id do usuário logado no C8 Control
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

INSERT INTO public.schema_migrations (version)
VALUES ('135_client_agents_drop_crm_fk')
ON CONFLICT (version) DO NOTHING;
