-- Migration 140: RPC get_online_agents_for_client
-- Retorna atendentes online para um cliente específico, ordenados por carga ascendente.
-- Usada pelo botão Transferir no OmnichannelInboxPage para listar atendentes disponíveis.

CREATE OR REPLACE FUNCTION public.get_online_agents_for_client(p_client_id UUID)
RETURNS TABLE(
  agent_id        UUID,
  crm_user_id     UUID,
  display_name    TEXT,
  avatar_url      TEXT,
  current_load    INTEGER,
  status          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id              AS agent_id,
    a.crm_user_id,
    a.display_name,
    a.avatar_url,
    COALESCE(s.current_load, 0)::INTEGER    AS current_load,
    COALESCE(s.status, 'offline')::TEXT     AS status
  FROM public.client_agents a
  LEFT JOIN public.client_agent_sessions s ON s.agent_id = a.id
  WHERE a.client_id = p_client_id
    AND a.is_active = true
    AND COALESCE(s.status, 'offline') = 'online'
  ORDER BY s.current_load ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_agents_for_client(UUID)
  TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
  VALUES ('140_get_online_agents_rpc')
  ON CONFLICT (version) DO NOTHING;
