-- Migration 157: Cria tabela contact_flow_state e RPCs do motor de fluxo
-- Banco A — isolamento por organization_id/client_id

-- ── Tabela contact_flow_state ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_flow_state (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_id      UUID        NOT NULL REFERENCES public.omni_contacts(id) ON DELETE CASCADE,
  flow_id         UUID        NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  current_node_id TEXT        NOT NULL,
  variables       JSONB       NOT NULL DEFAULT '{}',

  -- running   = motor em execução
  -- waiting   = aguardando resposta do usuário
  -- completed = fluxo terminou normalmente
  -- expired   = TTL expirou enquanto waiting
  -- error     = MAX_HOPS atingido ou erro inesperado
  status          TEXT        NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'waiting', 'completed', 'expired', 'error')),

  channel         TEXT        NOT NULL
                  CHECK (channel IN (
                    'whatsapp',
                    'instagram', 'instagram_dm', 'instagram_comment',
                    'facebook',  'facebook_dm',  'facebook_comment'
                  )),

  -- Quando este estado de espera expira.
  -- NULL é intencional para estados terminais (completed/expired/error):
  --   o motor grava NULL via upsert_flow_state ao finalizar o fluxo.
  -- NÃO torne este campo NOT NULL em migrations futuras sem ajustar o motor.
  expires_at      TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documenta que expires_at=NULL é intencional para estados terminais
COMMENT ON COLUMN public.contact_flow_state.expires_at IS
  'TTL do estado de espera. NULL para estados terminais (completed/expired/error). NÃO alterar para NOT NULL sem ajustar o motor de fluxo (engine.ts).';

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_cfs_updated_at ON public.contact_flow_state;
CREATE TRIGGER trg_cfs_updated_at
  BEFORE UPDATE ON public.contact_flow_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Constraint: um contato só pode ter UM estado ativo (running ou waiting) por canal
CREATE UNIQUE INDEX IF NOT EXISTS uq_cfs_active_state
  ON public.contact_flow_state(client_id, contact_id, channel)
  WHERE (status IN ('running', 'waiting'));

-- Índices regulares
CREATE INDEX IF NOT EXISTS idx_cfs_lookup
  ON public.contact_flow_state(client_id, contact_id, channel);

CREATE INDEX IF NOT EXISTS idx_cfs_expires
  ON public.contact_flow_state(expires_at)
  WHERE (status = 'waiting');

-- RLS
ALTER TABLE public.contact_flow_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cfs_auth" ON public.contact_flow_state;
CREATE POLICY "cfs_auth" ON public.contact_flow_state
  FOR ALL TO authenticated
  USING  (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- O motor acessa via service_role; authenticated só lê (painel de monitoramento)
GRANT SELECT ON public.contact_flow_state TO authenticated;
GRANT ALL ON public.contact_flow_state TO service_role;

-- ── RPC 1: resolve_bot_strategy ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_bot_strategy(
  p_client_id UUID,
  p_channel   TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bot_mode             TEXT;
  v_bot_mode_per_channel JSONB;
  v_effective_mode       TEXT;
  v_flow_id              UUID;
  v_definition           JSONB;
BEGIN
  SELECT bot_mode, bot_mode_per_channel
    INTO v_bot_mode, v_bot_mode_per_channel
    FROM public.agent_configs
   WHERE client_id = p_client_id
   LIMIT 1;

  -- Resolve modo efetivo: per-channel override > default > fallback n8n
  v_effective_mode := COALESCE(
    NULLIF(v_bot_mode_per_channel ->> p_channel, ''),
    v_bot_mode,
    'padrao'
  );

  IF v_effective_mode = 'padrao' OR v_effective_mode IS NULL THEN
    RETURN jsonb_build_object('mode', 'padrao');
  END IF;

  -- Busca fluxo ativo: canal-específico primeiro, depois geral
  SELECT id, definition INTO v_flow_id, v_definition
    FROM public.chatbot_flows
   WHERE client_id = p_client_id
     AND status = 'active'
     AND scope = 'channel'
     AND channel_type = p_channel
   LIMIT 1;

  IF v_flow_id IS NULL THEN
    SELECT id, definition INTO v_flow_id, v_definition
      FROM public.chatbot_flows
     WHERE client_id = p_client_id
       AND status = 'active'
       AND scope = 'general'
     LIMIT 1;
  END IF;

  IF v_flow_id IS NULL THEN
    -- Sem fluxo ativo → fallback padrao
    RETURN jsonb_build_object('mode', 'padrao');
  END IF;

  RETURN jsonb_build_object('mode', 'flow', 'flow_id', v_flow_id, 'definition', v_definition);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_bot_strategy(UUID, TEXT) TO service_role;

-- ── RPC 2: get_active_flow_state ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_active_flow_state(
  p_client_id  UUID,
  p_contact_id UUID,
  p_channel    TEXT
) RETURNS SETOF public.contact_flow_state
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT *
      FROM public.contact_flow_state
     WHERE client_id  = p_client_id
       AND contact_id = p_contact_id
       AND channel    = p_channel
       AND status IN ('running', 'waiting')
     LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_flow_state(UUID, UUID, TEXT) TO service_role;

-- ── RPC 3: upsert_flow_state ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_flow_state(
  p_id              UUID,
  p_organization_id UUID,
  p_client_id       UUID,
  p_contact_id      UUID,
  p_flow_id         UUID,
  p_current_node_id TEXT,
  p_variables       JSONB,
  p_status          TEXT,
  p_channel         TEXT,
  p_expires_at      TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO public.contact_flow_state (
      organization_id,
      client_id,
      contact_id,
      flow_id,
      current_node_id,
      variables,
      status,
      channel,
      expires_at
    ) VALUES (
      p_organization_id,
      p_client_id,
      p_contact_id,
      p_flow_id,
      p_current_node_id,
      p_variables,
      p_status,
      p_channel,
      p_expires_at
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.contact_flow_state
       SET current_node_id = p_current_node_id,
           variables       = p_variables,
           status          = p_status,
           expires_at      = p_expires_at,
           updated_at      = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_flow_state(UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- ── RPC 4: expire_flow_states ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_flow_states()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.contact_flow_state
     SET status     = 'expired',
         updated_at = now()
   WHERE status     = 'waiting'
     AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_flow_states() TO service_role, authenticated;

-- ── schema_migrations ─────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('157_contact_flow_state')
ON CONFLICT (version) DO NOTHING;
