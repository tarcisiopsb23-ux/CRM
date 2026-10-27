-- ── Migration 154: Tabela agent_channel_configs ───────────────────────────────
-- Configuração completa e independente do agente por canal/subtipo.
-- Cada linha representa um canal específico de um cliente.
-- A tabela agent_configs (Geral) NÃO é mais fallback — cada canal é autônomo.
--
-- Canais suportados:
--   whatsapp | instagram_dm | instagram_comment | facebook_dm | facebook_comment

CREATE TABLE IF NOT EXISTS public.agent_channel_configs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Canal/subtipo
  channel_type        TEXT        NOT NULL
                      CHECK (channel_type IN (
                        'whatsapp',
                        'instagram_dm', 'instagram_comment',
                        'facebook_dm',  'facebook_comment'
                      )),

  -- Toggle: este canal está ativo para o bot?
  is_enabled          BOOLEAN     NOT NULL DEFAULT true,

  -- ── Identidade ──────────────────────────────────────────────────────────────
  agent_name          TEXT        NOT NULL DEFAULT 'Assistente',
  agent_role          TEXT        NOT NULL DEFAULT 'Atendimento ao cliente',
  agent_description   TEXT,

  -- ── Personalidade ───────────────────────────────────────────────────────────
  tone                TEXT        NOT NULL DEFAULT 'amigavel'
                      CHECK (tone IN ('amigavel','profissional','descontraido','tecnico')),
  formality           INTEGER     NOT NULL DEFAULT 3 CHECK (formality BETWEEN 1 AND 5),
  use_emojis          BOOLEAN     NOT NULL DEFAULT false,
  response_length     TEXT        NOT NULL DEFAULT 'medio'
                      CHECK (response_length IN ('curto','medio','longo')),

  -- ── Objetivo e instruções ────────────────────────────────────────────────────
  objective           TEXT        NOT NULL DEFAULT 'atendimento'
                      CHECK (objective IN (
                        'atendimento','qualificacao','vendas',
                        'agendamento','suporte','personalizado'
                      )),
  instructions        TEXT,       -- instruções livres / system prompt adicional

  -- ── Behaviors por canal ──────────────────────────────────────────────────────
  behavior_use_knowledge    BOOLEAN NOT NULL DEFAULT true,   -- consultar base de conhecimento
  behavior_collect_data     BOOLEAN NOT NULL DEFAULT true,   -- coletar dados do contato
  behavior_create_opportunity BOOLEAN NOT NULL DEFAULT false, -- criar oportunidade no CRM
  behavior_handoff          BOOLEAN NOT NULL DEFAULT true,   -- transferir para humano

  -- ── Handoff ──────────────────────────────────────────────────────────────────
  handoff_keywords    TEXT[]      DEFAULT '{}',
  handoff_after_mins  INTEGER     DEFAULT NULL,

  -- ── Fora do horário ──────────────────────────────────────────────────────────
  respond_outside_hours BOOLEAN   NOT NULL DEFAULT false,
  outside_hours_message TEXT,

  -- ── Timestamps ───────────────────────────────────────────────────────────────
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (client_id, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_acc_client       ON public.agent_channel_configs(client_id);
CREATE INDEX IF NOT EXISTS idx_acc_client_chan  ON public.agent_channel_configs(client_id, channel_type);

DROP TRIGGER IF EXISTS trg_acc_updated_at ON public.agent_channel_configs;
CREATE TRIGGER trg_acc_updated_at
  BEFORE UPDATE ON public.agent_channel_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.agent_channel_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acc_auth" ON public.agent_channel_configs;
CREATE POLICY "acc_auth" ON public.agent_channel_configs
  FOR ALL TO authenticated
  USING  (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_channel_configs TO authenticated;
GRANT ALL ON public.agent_channel_configs TO service_role;

-- ── RPC: upsert_agent_channel_config ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_agent_channel_config(
  p_client_id           UUID,
  p_organization_id     UUID,
  p_channel_type        TEXT,
  p_is_enabled          BOOLEAN DEFAULT true,
  p_agent_name          TEXT    DEFAULT 'Assistente',
  p_agent_role          TEXT    DEFAULT 'Atendimento ao cliente',
  p_agent_description   TEXT    DEFAULT NULL,
  p_tone                TEXT    DEFAULT 'amigavel',
  p_formality           INTEGER DEFAULT 3,
  p_use_emojis          BOOLEAN DEFAULT false,
  p_response_length     TEXT    DEFAULT 'medio',
  p_objective           TEXT    DEFAULT 'atendimento',
  p_instructions        TEXT    DEFAULT NULL,
  p_behavior_use_knowledge    BOOLEAN DEFAULT true,
  p_behavior_collect_data     BOOLEAN DEFAULT true,
  p_behavior_create_opportunity BOOLEAN DEFAULT false,
  p_behavior_handoff          BOOLEAN DEFAULT true,
  p_handoff_keywords    TEXT[]  DEFAULT '{}',
  p_handoff_after_mins  INTEGER DEFAULT NULL,
  p_respond_outside_hours BOOLEAN DEFAULT false,
  p_outside_hours_message TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.agent_channel_configs (
    client_id, organization_id, channel_type, is_enabled,
    agent_name, agent_role, agent_description,
    tone, formality, use_emojis, response_length,
    objective, instructions,
    behavior_use_knowledge, behavior_collect_data,
    behavior_create_opportunity, behavior_handoff,
    handoff_keywords, handoff_after_mins,
    respond_outside_hours, outside_hours_message
  ) VALUES (
    p_client_id, p_organization_id, p_channel_type, p_is_enabled,
    p_agent_name, p_agent_role, p_agent_description,
    p_tone, p_formality, p_use_emojis, p_response_length,
    p_objective, p_instructions,
    p_behavior_use_knowledge, p_behavior_collect_data,
    p_behavior_create_opportunity, p_behavior_handoff,
    COALESCE(p_handoff_keywords, '{}'), p_handoff_after_mins,
    p_respond_outside_hours, p_outside_hours_message
  )
  ON CONFLICT (client_id, channel_type) DO UPDATE SET
    is_enabled                  = p_is_enabled,
    agent_name                  = p_agent_name,
    agent_role                  = p_agent_role,
    agent_description           = p_agent_description,
    tone                        = p_tone,
    formality                   = p_formality,
    use_emojis                  = p_use_emojis,
    response_length             = p_response_length,
    objective                   = p_objective,
    instructions                = p_instructions,
    behavior_use_knowledge      = p_behavior_use_knowledge,
    behavior_collect_data       = p_behavior_collect_data,
    behavior_create_opportunity = p_behavior_create_opportunity,
    behavior_handoff            = p_behavior_handoff,
    handoff_keywords            = COALESCE(p_handoff_keywords, '{}'),
    handoff_after_mins          = p_handoff_after_mins,
    respond_outside_hours       = p_respond_outside_hours,
    outside_hours_message       = p_outside_hours_message,
    updated_at                  = now();

  RETURN jsonb_build_object('success', true, 'channel_type', p_channel_type);
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_agent_channel_config(
  UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,
  BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT[],INTEGER,BOOLEAN,TEXT
) TO authenticated, anon, service_role;

-- ── RPC: get_agent_channel_configs ───────────────────────────────────────────
-- Retorna todas as configurações de canal de um cliente (para a UI)
CREATE OR REPLACE FUNCTION public.get_agent_channel_configs(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(
    channel_type,
    jsonb_build_object(
      'is_enabled',                 is_enabled,
      'agent_name',                 agent_name,
      'agent_role',                 agent_role,
      'agent_description',          agent_description,
      'tone',                       tone,
      'formality',                  formality,
      'use_emojis',                 use_emojis,
      'response_length',            response_length,
      'objective',                  objective,
      'instructions',               instructions,
      'behavior_use_knowledge',     behavior_use_knowledge,
      'behavior_collect_data',      behavior_collect_data,
      'behavior_create_opportunity', behavior_create_opportunity,
      'behavior_handoff',           behavior_handoff,
      'handoff_keywords',           handoff_keywords,
      'handoff_after_mins',         handoff_after_mins,
      'respond_outside_hours',      respond_outside_hours,
      'outside_hours_message',      outside_hours_message
    )
  )
  INTO v_result
  FROM public.agent_channel_configs
  WHERE client_id = p_client_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_agent_channel_configs(UUID)
  TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('154_agent_channel_configs')
ON CONFLICT (version) DO NOTHING;
