-- Migration 138: omni_agent_sessions, RPCs de disponibilidade e campos de configuração
-- Paridade com client_agent_sessions para a agência Maestria

-- Colunas ausentes em omni_agents (não existiam na migration 104)
ALTER TABLE public.omni_agents ADD COLUMN IF NOT EXISTS is_active    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.omni_agents ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.omni_agents ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

-- Tabela de sessões separada para omni_agents (paridade com client_agent_sessions)
CREATE TABLE IF NOT EXISTS public.omni_agent_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id            UUID NOT NULL REFERENCES public.omni_agents(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'offline'
                      CHECK (status IN ('online','busy','away','offline')),
  current_load        INTEGER NOT NULL DEFAULT 0,
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_started_at  TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id)
);
CREATE INDEX IF NOT EXISTS idx_omni_sessions_org ON omni_agent_sessions(organization_id, status);

ALTER TABLE public.omni_agent_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "omni_agent_sessions_auth" ON public.omni_agent_sessions;
CREATE POLICY "omni_agent_sessions_auth" ON public.omni_agent_sessions FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_agent_sessions TO authenticated;

-- Constraint UNIQUE para garantir uma configuração por organização
-- Usa apenas IF NOT EXISTS — sem DROP para evitar janela de concorrência
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'omni_distribution_rules_org_unique'
      AND conrelid = 'public.omni_distribution_rules'::regclass
  ) THEN
    ALTER TABLE public.omni_distribution_rules
      ADD CONSTRAINT omni_distribution_rules_org_unique UNIQUE (organization_id);
  END IF;
END $$;

-- Campos de configuração de atendimento em omni_distribution_rules
ALTER TABLE public.omni_distribution_rules
  ADD COLUMN IF NOT EXISTS whatsapp_bot_active        BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS instagram_bot_active       BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS facebook_bot_active        BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS fallback_assign_after_mins INTEGER     DEFAULT 2,
  ADD COLUMN IF NOT EXISTS queue_message              TEXT        DEFAULT 'Aguarde, em breve um atendente irá assumir sua conversa.',
  ADD COLUMN IF NOT EXISTS outside_hours_message      TEXT        DEFAULT 'Nosso horário de atendimento humano terminou. Retornaremos em breve.',
  ADD COLUMN IF NOT EXISTS handoff_keywords           TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS human_hours_start          TIME,
  ADD COLUMN IF NOT EXISTS human_hours_end            TIME,
  ADD COLUMN IF NOT EXISTS human_days                 TEXT[]      DEFAULT '{"mon","tue","wed","thu","fri"}';

-- RPC: próximo agente disponível para a agência (round-robin por tempo sem conversa)
CREATE OR REPLACE FUNCTION public.get_next_available_omni_agent(
  p_organization_id UUID,
  p_channel_type    TEXT DEFAULT 'whatsapp'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent_id UUID;
BEGIN
  SELECT a.id INTO v_agent_id
  FROM public.omni_agents a
  JOIN public.omni_agent_sessions s ON s.agent_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.is_active = true
    AND s.status = 'online'
    AND s.current_load < a.max_simultaneous
    AND (
      (p_channel_type = 'whatsapp'  AND a.handles_whatsapp = true) OR
      (p_channel_type IN ('instagram_dm','instagram_comment') AND a.handles_instagram = true) OR
      (p_channel_type IN ('facebook_dm','facebook_comment')  AND a.handles_facebook  = true) OR
      p_channel_type IS NULL
    )
  ORDER BY s.current_load ASC, s.last_seen_at ASC
  LIMIT 1;
  RETURN v_agent_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_next_available_omni_agent(UUID, TEXT) TO authenticated, anon, service_role;

-- RPC: set_omni_agent_status
CREATE OR REPLACE FUNCTION public.set_omni_agent_status(
  p_agent_id UUID,
  p_status   TEXT,
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent_id UUID;
  v_org_id   UUID;
BEGIN
  SELECT a.id, a.organization_id INTO v_agent_id, v_org_id
  FROM public.omni_agents a WHERE a.id = p_agent_id;

  IF v_agent_id IS NULL THEN
    SELECT a.id, a.organization_id INTO v_agent_id, v_org_id
    FROM public.omni_agents a
    WHERE a.profile_id = p_agent_id
      AND (p_organization_id IS NULL OR a.organization_id = p_organization_id)
    LIMIT 1;
  END IF;

  IF v_agent_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agent_not_found');
  END IF;

  INSERT INTO public.omni_agent_sessions(organization_id, agent_id, status, session_started_at, last_seen_at, updated_at)
  VALUES(v_org_id, v_agent_id, p_status,
    CASE WHEN p_status = 'online' THEN now() ELSE NULL END,
    now(), now())
  ON CONFLICT (agent_id) DO UPDATE SET
    status = EXCLUDED.status,
    last_seen_at = now(),
    session_started_at = CASE WHEN EXCLUDED.status = 'online' AND omni_agent_sessions.status != 'online' THEN now() ELSE omni_agent_sessions.session_started_at END,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'agent_id', v_agent_id, 'status', p_status);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_omni_agent_status(UUID, TEXT, UUID) TO authenticated, anon, service_role;

-- RPC: ensure_omni_agent (auto-registro do atendente da agência)
CREATE OR REPLACE FUNCTION public.ensure_omni_agent(
  p_organization_id UUID,
  p_profile_id      UUID,
  p_display_name    TEXT,
  p_avatar_url      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent_id UUID;
BEGIN
  INSERT INTO public.omni_agents(organization_id, profile_id, display_name, avatar_url, is_active)
  VALUES(p_organization_id, p_profile_id, p_display_name, p_avatar_url, true)
  ON CONFLICT (organization_id, profile_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url   = COALESCE(EXCLUDED.avatar_url, omni_agents.avatar_url),
    is_active    = true,
    updated_at   = now()
  RETURNING id INTO v_agent_id;

  -- Fallback: garante retorno não-nulo mesmo quando DO UPDATE não modifica nenhuma coluna
  IF v_agent_id IS NULL THEN
    SELECT id INTO v_agent_id
    FROM public.omni_agents
    WHERE organization_id = p_organization_id AND profile_id = p_profile_id;
  END IF;

  RETURN jsonb_build_object('agent_id', v_agent_id, 'profile_id', p_profile_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_omni_agent(UUID, UUID, TEXT, TEXT) TO authenticated, anon, service_role;

-- ── Trigger: mantém omni_agent_sessions.current_load sincronizado ──────────────
-- Incrementa/decrementa current_load quando uma conversa omni é atribuída/liberada.
-- whatsapp_conversations.assigned_agent_id → profiles(id)
-- omni_agents.profile_id → profiles(id)
-- O trigger resolve o profile_id → omni_agent_id via omni_agents.

CREATE OR REPLACE FUNCTION public.sync_omni_agent_current_load()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id    UUID;
  v_old_omni  UUID;
  v_new_omni  UUID;
BEGIN
  -- Determina organization_id
  v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);

  -- Resolve profile_id → omni_agent_id para o agente anterior
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.assigned_agent_id IS NOT NULL THEN
    SELECT id INTO v_old_omni
      FROM public.omni_agents
     WHERE organization_id = v_org_id
       AND profile_id = OLD.assigned_agent_id
     LIMIT 1;
  END IF;

  -- Resolve profile_id → omni_agent_id para o novo agente
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.assigned_agent_id IS NOT NULL THEN
    SELECT id INTO v_new_omni
      FROM public.omni_agents
     WHERE organization_id = v_org_id
       AND profile_id = NEW.assigned_agent_id
     LIMIT 1;
  END IF;

  -- Decrementa o agente anterior se mudou
  IF v_old_omni IS NOT NULL AND v_old_omni IS DISTINCT FROM v_new_omni THEN
    UPDATE public.omni_agent_sessions
       SET current_load = GREATEST(0, current_load - 1),
           updated_at   = now()
     WHERE agent_id = v_old_omni;
  END IF;

  -- Incrementa o novo agente
  IF v_new_omni IS NOT NULL AND v_new_omni IS DISTINCT FROM v_old_omni THEN
    UPDATE public.omni_agent_sessions
       SET current_load = current_load + 1,
           updated_at   = now()
     WHERE agent_id = v_new_omni;
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;

-- Aplica o trigger de forma defensiva:
--   DB novo  (138 roda antes da 143): whatsapp_conversations ainda é tabela → OK
--   DB C8 já existente (143 já rodou): omni_conversations é a tabela real → usa ela
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_omni_agent_load'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'omni_conversations'
    ) THEN
      CREATE TRIGGER trg_sync_omni_agent_load
      AFTER INSERT OR UPDATE OF assigned_agent_id OR DELETE
      ON public.omni_conversations
      FOR EACH ROW EXECUTE FUNCTION public.sync_omni_agent_current_load();
    ELSIF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'whatsapp_conversations'
    ) THEN
      CREATE TRIGGER trg_sync_omni_agent_load
      AFTER INSERT OR UPDATE OF assigned_agent_id OR DELETE
      ON public.whatsapp_conversations
      FOR EACH ROW EXECUTE FUNCTION public.sync_omni_agent_current_load();
    END IF;
  END IF;
END $$;

INSERT INTO public.schema_migrations (version) VALUES ('138_omni_agent_sessions_rpc') ON CONFLICT (version) DO NOTHING;
