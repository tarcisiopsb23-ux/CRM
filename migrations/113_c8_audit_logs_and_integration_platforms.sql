-- ============================================================
-- Migration 113: Audit Log do C8 Control + novos platforms de integração
-- Execute no Supabase da AGÊNCIA (Banco A)
-- ============================================================

-- ── 1. Tabela c8_audit_logs ──────────────────────────────────────────────────
-- Registra todas as ações realizadas dentro do módulo C8 Control do Maestr.IA:
-- operações sobre tenants (bloquear, suspender, cancelar, conceder acesso gratuito,
-- resetar senha, etc.) realizadas por usuários da agência ou suporte.
-- Não se confunde com audit_logs_view (auditoria geral do CRM).

CREATE TABLE IF NOT EXISTS public.c8_audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name     TEXT,                         -- snapshot do nome no momento da ação
  user_id         UUID,                         -- auth.uid() de quem fez a ação
  user_name       TEXT,                         -- snapshot do nome do usuário
  user_role       TEXT,                         -- 'owner', 'admin', 'support'
  action          TEXT        NOT NULL,         -- identificador da ação (ex: 'block_client')
  entity          TEXT,                         -- entidade afetada (ex: 'client', 'plan')
  entity_id       UUID,                         -- ID do registro afetado
  description     TEXT,                         -- texto legível gerado automaticamente
  metadata        JSONB       DEFAULT '{}',     -- dados extras (reason, plano anterior, etc.)
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.c8_audit_logs IS
  'Registro de ações do módulo C8 Control: bloqueios, suspensões, acessos gratuitos, resets de senha, etc.';
COMMENT ON COLUMN public.c8_audit_logs.action IS
  'Identificador da ação: create_client, update_client, block_client, unblock_client, suspend_client, cancel_client, delete_client, renew_contract, grant_free_access, revoke_free_access, reset_password';

-- Índices
CREATE INDEX IF NOT EXISTS idx_c8_audit_logs_org_date
  ON public.c8_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_c8_audit_logs_client
  ON public.c8_audit_logs (client_id);

CREATE INDEX IF NOT EXISTS idx_c8_audit_logs_user
  ON public.c8_audit_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_c8_audit_logs_action
  ON public.c8_audit_logs (action);

-- RLS
ALTER TABLE public.c8_audit_logs ENABLE ROW LEVEL SECURITY;

-- Leitura: apenas usuários autenticados da mesma organização
CREATE POLICY "c8_audit_logs_select" ON public.c8_audit_logs
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Inserção: apenas usuários autenticados da mesma organização
CREATE POLICY "c8_audit_logs_insert" ON public.c8_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Service role pode tudo (para Edge Functions)
CREATE POLICY "c8_audit_logs_service_role" ON public.c8_audit_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 2. Novos valores de platform em client_integrations ──────────────────────
-- O campo platform é TEXT (sem enum), portanto não requer ALTER TYPE.
-- Esta seção documenta os valores esperados e cria índices complementares.

-- Comentário atualizado na tabela original
COMMENT ON COLUMN public.client_integrations.platform IS
  'Plataforma da integração. Valores: facebook, instagram, whatsapp, meta_ads, meta (legado), google, google_calendar';

-- Índice para facilitar queries por platform específico
CREATE INDEX IF NOT EXISTS idx_client_integrations_platform
  ON public.client_integrations (platform);

-- ── 3. Versão ────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('113_c8_audit_logs_and_integration_platforms')
ON CONFLICT (version) DO NOTHING;
