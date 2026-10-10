-- ============================================================
-- Migration: Tabela de notificações (Banco A)
-- Sistema de alertas para leads quentes/mornos recebidos
-- pelo formulário de qualificação do site.
-- Idempotente: usa IF NOT EXISTS em todos os blocos.
-- ============================================================

-- ── Tabela principal ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL
                  REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- null = notificação para todos os membros da org com permissão
  user_id         UUID
                  REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL
                  CHECK (type IN (
                    'lead_ultra_quente',
                    'lead_quente',
                    'lead_morno',
                    'lead_frio',
                    'sistema'
                  )),
  title           TEXT        NOT NULL,
  body            TEXT,
  -- link interno para onde a notificação aponta (ex: /leads?id=xxx)
  action_url      TEXT,
  -- dados extras: lead_id, score, classificacao, segmento, utm_source, etc.
  metadata        JSONB       DEFAULT '{}',
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notifications_org_user
  ON public.notifications (organization_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications (organization_id, user_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON public.notifications (type, organization_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Cada usuário vê apenas suas próprias notificações
-- ou notificações broadcast (user_id IS NULL) da sua organização.
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Apenas service_role pode inserir (via n8n / Edge Function).
-- Usuários autenticados podem atualizar apenas o campo read_at das próprias notificações.
DROP POLICY IF EXISTS "notifications_update_read" ON public.notifications;
CREATE POLICY "notifications_update_read"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Função helper: marcar todas as notificações como lidas ───────────────────

CREATE OR REPLACE FUNCTION public.mark_notifications_read(
  p_organization_id UUID,
  p_user_id         UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE organization_id = p_organization_id
    AND (user_id IS NULL OR user_id = p_user_id)
    AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.notifications IS
  'Alertas internos do CRM. Alimentado pelo n8n quando leads chegam pelo formulário de qualificação.';

COMMENT ON COLUMN public.notifications.type IS
  'lead_ultra_quente | lead_quente | lead_morno | lead_frio | sistema';

COMMENT ON COLUMN public.notifications.metadata IS
  'Dados do lead: { lead_id, score, classificacao, segmento, faturamento, utm_source }';

COMMENT ON COLUMN public.notifications.action_url IS
  'URL relativa para navegação ao clicar na notificação. Ex: /crm?tab=formulario&lead=uuid';
