-- Migration 156: Cria tabela chatbot_flows
-- Banco A — isolamento por organization_id/client_id

CREATE TABLE IF NOT EXISTS public.chatbot_flows (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,

  -- Escopo: 'general' se aplica a todos os canais; 'channel' se aplica a canal específico
  scope           TEXT        NOT NULL DEFAULT 'general'
                  CHECK (scope IN ('general', 'channel')),

  -- Somente preenchido quando scope = 'channel'
  channel_type    TEXT
                  CHECK (channel_type IS NULL OR channel_type IN (
                    'whatsapp',
                    'instagram', 'instagram_dm', 'instagram_comment',
                    'facebook',  'facebook_dm',  'facebook_comment'
                  )),

  -- Definição React Flow-compatible (nós + arestas)
  definition      JSONB       NOT NULL DEFAULT '{"nodes":[],"edges":[]}',

  -- Versão interna para controle de concorrência otimista
  version         INTEGER     NOT NULL DEFAULT 1,

  -- Ciclo de vida
  status          TEXT        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'active', 'archived')),

  -- TTL padrão para estados de espera deste fluxo (em horas)
  default_timeout_hours INTEGER NOT NULL DEFAULT 24,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Garante que scope='general' não tem channel_type, e scope='channel' tem
  CONSTRAINT chk_scope_channel CHECK (
    (scope = 'general' AND channel_type IS NULL) OR
    (scope = 'channel' AND channel_type IS NOT NULL)
  )
);

-- Trigger updated_at (reutiliza função existente update_updated_at_column)
DROP TRIGGER IF EXISTS trg_chatbot_flows_updated_at ON public.chatbot_flows;
CREATE TRIGGER trg_chatbot_flows_updated_at
  BEFORE UPDATE ON public.chatbot_flows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índice parcial: no máximo 1 fluxo ativo geral por client_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_cf_active_general
  ON public.chatbot_flows(client_id)
  WHERE (scope = 'general' AND status = 'active');

-- Índice parcial: no máximo 1 fluxo ativo por canal por client_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_cf_active_channel
  ON public.chatbot_flows(client_id, channel_type)
  WHERE (scope = 'channel' AND status = 'active');

-- Índices regulares
CREATE INDEX IF NOT EXISTS idx_cf_client_status
  ON public.chatbot_flows(client_id, status);

CREATE INDEX IF NOT EXISTS idx_cf_client_scope_channel
  ON public.chatbot_flows(client_id, scope, channel_type);

-- RLS
ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cf_auth" ON public.chatbot_flows;
CREATE POLICY "cf_auth" ON public.chatbot_flows
  FOR ALL TO authenticated
  USING  (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_flows TO authenticated;
GRANT ALL ON public.chatbot_flows TO service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('156_chatbot_flows')
ON CONFLICT (version) DO NOTHING;
