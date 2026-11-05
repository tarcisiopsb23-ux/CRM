-- ── Migration 166: Tabela agency_channel_configs ─────────────────────────────
-- Configuração do bot por canal para contas da agência (meta_connections com
-- client_id IS NULL). Espelhada de agent_channel_configs (migration 154), mas
-- vinculada a meta_connection_id em vez de client_id.
--
-- Banco A only. Sem impacto no Banco B.
--
-- Canais suportados:
--   whatsapp | instagram_dm | instagram_comment | facebook_dm | facebook_comment

CREATE TABLE IF NOT EXISTS public.agency_channel_configs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meta_connection_id  UUID        REFERENCES public.meta_connections(id) ON DELETE CASCADE,

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
  instructions        TEXT,

  -- ── Behaviors por canal ──────────────────────────────────────────────────────
  behavior_use_knowledge      BOOLEAN NOT NULL DEFAULT true,
  behavior_collect_data       BOOLEAN NOT NULL DEFAULT true,
  behavior_create_opportunity BOOLEAN NOT NULL DEFAULT false,
  behavior_handoff            BOOLEAN NOT NULL DEFAULT true,

  -- ── Handoff ──────────────────────────────────────────────────────────────────
  handoff_keywords    TEXT[]      DEFAULT '{}',
  handoff_after_mins  INTEGER     DEFAULT NULL,

  -- ── Fora do horário ──────────────────────────────────────────────────────────
  respond_outside_hours   BOOLEAN NOT NULL DEFAULT false,
  outside_hours_message   TEXT,

  -- ── Timestamps ───────────────────────────────────────────────────────────────
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Se a tabela já existia (migration 162), adiciona meta_connection_id ───────
ALTER TABLE public.agency_channel_configs
  ADD COLUMN IF NOT EXISTS meta_connection_id UUID
    REFERENCES public.meta_connections(id) ON DELETE CASCADE;

-- Remove UNIQUE antiga (organization_id, channel_type) se existir
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_channel_configs_organization_id_channel_type_key'
      AND conrelid = 'public.agency_channel_configs'::regclass
  ) THEN
    ALTER TABLE public.agency_channel_configs
      DROP CONSTRAINT agency_channel_configs_organization_id_channel_type_key;
  END IF;
END $$;

-- Adiciona UNIQUE nova (meta_connection_id, channel_type) se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_channel_configs_meta_connection_id_channel_type_key'
      AND conrelid = 'public.agency_channel_configs'::regclass
  ) THEN
    ALTER TABLE public.agency_channel_configs
      ADD CONSTRAINT agency_channel_configs_meta_connection_id_channel_type_key
      UNIQUE (meta_connection_id, channel_type);
  END IF;
END $$;

-- Campos que podem estar faltando das migrations anteriores (162/163/164/165)
ALTER TABLE public.agency_channel_configs
  ADD COLUMN IF NOT EXISTS behavior_create_opportunity BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS respond_outside_hours       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outside_hours_message       TEXT,
  ADD COLUMN IF NOT EXISTS agent_description           TEXT;

-- Índices
CREATE INDEX IF NOT EXISTS idx_acc_meta_conn
  ON public.agency_channel_configs(meta_connection_id);

CREATE INDEX IF NOT EXISTS idx_acc_org
  ON public.agency_channel_configs(organization_id);

CREATE INDEX IF NOT EXISTS idx_acc_meta_conn_chan
  ON public.agency_channel_configs(meta_connection_id, channel_type);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_acc_updated_at ON public.agency_channel_configs;
CREATE TRIGGER trg_acc_updated_at
  BEFORE UPDATE ON public.agency_channel_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.agency_channel_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acc_agency_auth" ON public.agency_channel_configs;
CREATE POLICY "acc_agency_auth" ON public.agency_channel_configs
  FOR ALL TO authenticated
  USING  (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_channel_configs TO authenticated;
GRANT ALL ON public.agency_channel_configs TO service_role;

-- ── RPC: upsert_agency_channel_config ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_agency_channel_config(
  p_organization_id             UUID,
  p_meta_connection_id          UUID,
  p_channel_type                TEXT,
  p_is_enabled                  BOOLEAN DEFAULT true,
  p_agent_name                  TEXT    DEFAULT 'Assistente',
  p_agent_role                  TEXT    DEFAULT 'Atendimento ao cliente',
  p_agent_description           TEXT    DEFAULT NULL,
  p_tone                        TEXT    DEFAULT 'amigavel',
  p_formality                   INTEGER DEFAULT 3,
  p_use_emojis                  BOOLEAN DEFAULT false,
  p_response_length             TEXT    DEFAULT 'medio',
  p_objective                   TEXT    DEFAULT 'atendimento',
  p_instructions                TEXT    DEFAULT NULL,
  p_behavior_use_knowledge      BOOLEAN DEFAULT true,
  p_behavior_collect_data       BOOLEAN DEFAULT true,
  p_behavior_create_opportunity BOOLEAN DEFAULT false,
  p_behavior_handoff            BOOLEAN DEFAULT true,
  p_handoff_keywords            TEXT[]  DEFAULT '{}',
  p_handoff_after_mins          INTEGER DEFAULT NULL,
  p_respond_outside_hours       BOOLEAN DEFAULT false,
  p_outside_hours_message       TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.agency_channel_configs (
    organization_id, meta_connection_id, channel_type, is_enabled,
    agent_name, agent_role, agent_description,
    tone, formality, use_emojis, response_length,
    objective, instructions,
    behavior_use_knowledge, behavior_collect_data,
    behavior_create_opportunity, behavior_handoff,
    handoff_keywords, handoff_after_mins,
    respond_outside_hours, outside_hours_message
  ) VALUES (
    p_organization_id, p_meta_connection_id, p_channel_type, p_is_enabled,
    p_agent_name, p_agent_role, p_agent_description,
    p_tone, p_formality, p_use_emojis, p_response_length,
    p_objective, p_instructions,
    p_behavior_use_knowledge, p_behavior_collect_data,
    p_behavior_create_opportunity, p_behavior_handoff,
    COALESCE(p_handoff_keywords, '{}'), p_handoff_after_mins,
    p_respond_outside_hours, p_outside_hours_message
  )
  ON CONFLICT (meta_connection_id, channel_type) DO UPDATE SET
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

  RETURN jsonb_build_object(
    'success',             true,
    'meta_connection_id',  p_meta_connection_id,
    'channel_type',        p_channel_type
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_agency_channel_config(
  UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,
  BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT[],INTEGER,BOOLEAN,TEXT
) TO authenticated, anon, service_role;

-- ── RPC: get_agency_channel_configs ──────────────────────────────────────────
-- Retorna todas as configurações de canal de uma meta_connection (para a UI)
CREATE OR REPLACE FUNCTION public.get_agency_channel_configs(p_meta_connection_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(
    channel_type,
    jsonb_build_object(
      'id',                         id,
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
  FROM public.agency_channel_configs
  WHERE meta_connection_id = p_meta_connection_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_agency_channel_configs(UUID)
  TO authenticated, anon, service_role;

-- ── Version marker ────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('166_agency_channel_configs')
ON CONFLICT (version) DO NOTHING;
