-- =============================================================================
-- Migration 00164: Sistema de Autorizações Remotas
-- Permite que ações destrutivas sejam aprovadas remotamente por manager/admin/owner
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pending_authorizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Quem solicitou
  requested_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Descrição da ação para exibição
  action_title    TEXT NOT NULL,
  action_description TEXT NOT NULL,
  -- Módulo/contexto (ex: "clients", "fiscal", "financial")
  module          TEXT NOT NULL DEFAULT 'geral',

  -- Status
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'cancelado', 'expirado')),

  -- Quem aprovou/rejeitou
  resolved_by     UUID REFERENCES public.profiles(id),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,

  -- Expiração automática (30 minutos)
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pending_auth_org_status
  ON public.pending_authorizations (organization_id, status)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_pending_auth_requested_by
  ON public.pending_authorizations (requested_by);

-- RLS
ALTER TABLE public.pending_authorizations ENABLE ROW LEVEL SECURITY;

-- Membros da org podem ver autorizações pendentes da sua org
CREATE POLICY "org_members_read_pending_auth"
  ON public.pending_authorizations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Qualquer membro autenticado da org pode criar
CREATE POLICY "org_members_create_pending_auth"
  ON public.pending_authorizations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
    AND requested_by = auth.uid()
  );

-- Quem solicitou pode cancelar; manager/admin/owner podem aprovar/rejeitar
CREATE POLICY "org_members_update_pending_auth"
  ON public.pending_authorizations FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
    AND (
      -- Solicitante pode cancelar
      requested_by = auth.uid()
      OR
      -- Gestores podem aprovar/rejeitar
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner', 'admin', 'manager')
    )
  );

-- RPC: marcar expiradas automaticamente
CREATE OR REPLACE FUNCTION public.expire_pending_authorizations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pending_authorizations
  SET status = 'expirado', updated_at = now()
  WHERE status = 'pendente'
    AND expires_at < now();
END;
$$;

-- Realtime para notificações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_authorizations;

GRANT SELECT, INSERT, UPDATE ON public.pending_authorizations TO authenticated;
