-- Migration 155: Adiciona campos de toggle bot_mode em agent_configs
-- Banco A — isolamento por organization_id/client_id

ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS bot_mode TEXT NOT NULL DEFAULT 'n8n'
    CONSTRAINT chk_agent_bot_mode CHECK (bot_mode IN ('n8n', 'flow')),
  ADD COLUMN IF NOT EXISTS bot_mode_per_channel JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.agent_configs.bot_mode IS
  'Modo padrão do bot: n8n (fluxo IA via n8n) ou flow (fluxo visual do C8 Control)';
COMMENT ON COLUMN public.agent_configs.bot_mode_per_channel IS
  'Override de bot_mode por canal. Ex: {"whatsapp":"flow","instagram_dm":"n8n"}';

INSERT INTO public.schema_migrations (version)
VALUES ('155_bot_mode_toggle')
ON CONFLICT (version) DO NOTHING;
