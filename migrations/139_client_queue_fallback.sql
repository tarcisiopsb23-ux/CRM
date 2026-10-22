-- Migration 139: campos de fallback automático em client_queue_rules
ALTER TABLE public.client_queue_rules ADD COLUMN IF NOT EXISTS fallback_assign_after_mins INTEGER DEFAULT 2;
ALTER TABLE public.client_queue_rules ADD COLUMN IF NOT EXISTS outside_hours_message TEXT;
ALTER TABLE public.client_queue_rules ADD COLUMN IF NOT EXISTS human_hours_start TIME;
ALTER TABLE public.client_queue_rules ADD COLUMN IF NOT EXISTS human_hours_end TIME;
ALTER TABLE public.client_queue_rules ADD COLUMN IF NOT EXISTS human_days TEXT[] DEFAULT ARRAY['seg','ter','qua','qui','sex'];
ALTER TABLE public.client_queue_rules ADD COLUMN IF NOT EXISTS handoff_keywords TEXT[] DEFAULT '{}';

-- Adiciona UNIQUE(client_id) se não existir (necessário para ON CONFLICT abaixo)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_queue_rules_client_id_unique'
      AND conrelid = 'public.client_queue_rules'::regclass
  ) THEN
    ALTER TABLE public.client_queue_rules ADD CONSTRAINT client_queue_rules_client_id_unique UNIQUE (client_id);
  END IF;
END $$;

-- RPC para ler config completa de atendimento do cliente
CREATE OR REPLACE FUNCTION public.get_client_attendance_config(p_client_id UUID)
RETURNS TABLE(
  whatsapp_bot_active BOOLEAN,
  instagram_bot_active BOOLEAN,
  facebook_bot_active BOOLEAN,
  auto_assign BOOLEAN,
  fallback_assign_after_mins INTEGER,
  queue_message TEXT,
  outside_hours_message TEXT,
  human_hours_start TEXT,
  human_hours_end TEXT,
  human_days TEXT[],
  handoff_keywords TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(ac.handles_whatsapp, true),
    COALESCE(ac.handles_instagram, true),
    COALESCE(ac.handles_facebook, true),
    COALESCE(qr.auto_assign, false),
    COALESCE(qr.fallback_assign_after_mins, 2),
    qr.queue_message,
    qr.outside_hours_message,
    qr.human_hours_start::TEXT,
    qr.human_hours_end::TEXT,
    COALESCE(qr.human_days, ARRAY['seg','ter','qua','qui','sex']),
    COALESCE(qr.handoff_keywords, '{}')
  FROM (SELECT p_client_id AS cid) base
  LEFT JOIN public.agent_configs ac ON ac.client_id = base.cid
  LEFT JOIN public.client_queue_rules qr ON qr.client_id = base.cid;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_client_attendance_config(UUID) TO authenticated, anon, service_role;

-- RPC para salvar config completa de atendimento
CREATE OR REPLACE FUNCTION public.upsert_client_attendance_config(
  p_client_id UUID, p_organization_id UUID,
  p_whatsapp_bot_active BOOLEAN, p_instagram_bot_active BOOLEAN, p_facebook_bot_active BOOLEAN,
  p_auto_assign BOOLEAN, p_fallback_assign_after_mins INTEGER,
  p_queue_message TEXT, p_outside_hours_message TEXT,
  p_human_hours_start TEXT, p_human_hours_end TEXT,
  p_human_days TEXT[], p_handoff_keywords TEXT[]
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Upsert agent_configs (bot ativo por canal)
  INSERT INTO public.agent_configs(client_id, organization_id, handles_whatsapp, handles_instagram, handles_facebook, is_active)
  VALUES(p_client_id, p_organization_id, p_whatsapp_bot_active, p_instagram_bot_active, p_facebook_bot_active, true)
  ON CONFLICT (client_id) DO UPDATE SET
    handles_whatsapp  = p_whatsapp_bot_active,
    handles_instagram = p_instagram_bot_active,
    handles_facebook  = p_facebook_bot_active,
    updated_at        = now();

  -- Upsert client_queue_rules (usa UNIQUE(client_id) adicionado acima)
  INSERT INTO public.client_queue_rules(
    client_id, organization_id, auto_assign, rule_type,
    fallback_assign_after_mins, queue_message, outside_hours_message,
    human_hours_start, human_hours_end, human_days, handoff_keywords
  ) VALUES(
    p_client_id, p_organization_id, p_auto_assign, 'round_robin',
    GREATEST(1, LEAST(60, COALESCE(p_fallback_assign_after_mins, 2))),
    NULLIF(p_queue_message, ''), NULLIF(p_outside_hours_message, ''),
    p_human_hours_start::TIME, p_human_hours_end::TIME,
    COALESCE(p_human_days, ARRAY['seg','ter','qua','qui','sex']),
    COALESCE(p_handoff_keywords, '{}')
  )
  ON CONFLICT (client_id) DO UPDATE SET
    auto_assign                = p_auto_assign,
    fallback_assign_after_mins = GREATEST(1, LEAST(60, COALESCE(p_fallback_assign_after_mins, 2))),
    queue_message              = NULLIF(p_queue_message, ''),
    outside_hours_message      = NULLIF(p_outside_hours_message, ''),
    human_hours_start          = p_human_hours_start::TIME,
    human_hours_end            = p_human_hours_end::TIME,
    human_days                 = COALESCE(p_human_days, ARRAY['seg','ter','qua','qui','sex']),
    handoff_keywords           = COALESCE(p_handoff_keywords, '{}'),
    updated_at                 = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_client_attendance_config(UUID,UUID,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT[]) TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version) VALUES ('139_client_queue_fallback') ON CONFLICT (version) DO NOTHING;
