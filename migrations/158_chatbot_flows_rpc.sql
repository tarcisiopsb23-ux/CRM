-- ── Migration 158: RPCs de CRUD para chatbot_flows ───────────────────────────
-- Banco A — isolamento por client_id (todas as RPCs verificam client_id)

-- 1. list_chatbot_flows
CREATE OR REPLACE FUNCTION public.list_chatbot_flows(p_client_id UUID)
RETURNS SETOF public.chatbot_flows
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT * FROM public.chatbot_flows
    WHERE client_id = p_client_id
    ORDER BY created_at DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.list_chatbot_flows(UUID) TO authenticated, service_role;

-- 2. get_chatbot_flow
CREATE OR REPLACE FUNCTION public.get_chatbot_flow(p_flow_id UUID, p_client_id UUID)
RETURNS SETOF public.chatbot_flows
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT * FROM public.chatbot_flows
    WHERE id = p_flow_id AND client_id = p_client_id
    LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_chatbot_flow(UUID, UUID) TO authenticated, service_role;

-- 3. upsert_chatbot_flow
CREATE OR REPLACE FUNCTION public.upsert_chatbot_flow(
  p_id                    UUID,
  p_organization_id       UUID,
  p_client_id             UUID,
  p_name                  TEXT,
  p_description           TEXT DEFAULT NULL,
  p_scope                 TEXT DEFAULT 'general',
  p_channel_type          TEXT DEFAULT NULL,
  p_definition            JSONB DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  p_default_timeout_hours INT  DEFAULT 24
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO public.chatbot_flows (
      organization_id, client_id, name, description,
      scope, channel_type, definition, default_timeout_hours
    ) VALUES (
      p_organization_id, p_client_id, p_name, p_description,
      p_scope, p_channel_type, p_definition, p_default_timeout_hours
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.chatbot_flows SET
      name                  = p_name,
      description           = p_description,
      scope                 = p_scope,
      channel_type          = p_channel_type,
      definition            = p_definition,
      default_timeout_hours = p_default_timeout_hours,
      version               = version + 1
    WHERE id = p_id AND client_id = p_client_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_chatbot_flow(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,JSONB,INT) TO authenticated, service_role;

-- 4. set_flow_status
-- Ao ativar: arquiva automaticamente qualquer outro flow ativo no mesmo scope/canal
CREATE OR REPLACE FUNCTION public.set_flow_status(
  p_flow_id   UUID,
  p_client_id UUID,
  p_status    TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope   TEXT;
  v_channel TEXT;
BEGIN
  SELECT scope, channel_type INTO v_scope, v_channel
  FROM public.chatbot_flows
  WHERE id = p_flow_id AND client_id = p_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'flow_not_found'; END IF;

  IF p_status = 'active' THEN
    UPDATE public.chatbot_flows
    SET status = 'archived'
    WHERE client_id   = p_client_id
      AND status      = 'active'
      AND id         <> p_flow_id
      AND scope       = v_scope
      AND (v_scope = 'general' OR channel_type = v_channel);
  END IF;

  UPDATE public.chatbot_flows SET status = p_status
  WHERE id = p_flow_id AND client_id = p_client_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_flow_status(UUID, UUID, TEXT) TO authenticated, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('158_chatbot_flows_rpc')
ON CONFLICT (version) DO NOTHING;
