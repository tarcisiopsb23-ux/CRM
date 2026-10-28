-- Migration 155: Adiciona campos de toggle bot_mode em agent_configs
-- Banco A — isolamento por organization_id/client_id

ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS bot_mode TEXT NOT NULL DEFAULT 'padrao'
    CONSTRAINT chk_agent_bot_mode CHECK (bot_mode IN ('padrao', 'flow')),
  ADD COLUMN IF NOT EXISTS bot_mode_per_channel JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.agent_configs.bot_mode IS
  'Modo padrão do bot: padrao (fluxo IA via n8n) ou flow (fluxo visual do C8 Control)';
COMMENT ON COLUMN public.agent_configs.bot_mode_per_channel IS
  'Override de bot_mode por canal. Ex: {"whatsapp":"flow","instagram_dm":"padrao"}';

-- ── RPC set_bot_mode ──────────────────────────────────────────────────────────
-- Permite que o usuário do Maestr.IA atualize apenas o bot_mode e overrides
-- sem precisar de acesso direto à tabela agent_configs.
CREATE OR REPLACE FUNCTION public.set_bot_mode(
  p_client_id          UUID,
  p_bot_mode           TEXT,
  p_bot_mode_per_channel JSONB DEFAULT '{}'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.agent_configs
  SET
    bot_mode            = p_bot_mode,
    bot_mode_per_channel = p_bot_mode_per_channel
  WHERE client_id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent_config não encontrado para client_id=%', p_client_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_bot_mode(UUID, TEXT, JSONB)
  TO authenticated, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('155_bot_mode_toggle')
ON CONFLICT (version) DO NOTHING;
