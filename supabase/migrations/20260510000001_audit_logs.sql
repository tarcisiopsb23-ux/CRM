-- Migration: audit_logs
-- Tabela de auditoria para registrar acoes dos usuarios no C8 Control.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  user_id     UUID        NOT NULL,
  user_email  TEXT,
  user_role   TEXT        NOT NULL DEFAULT 'member',
  action      TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'geral',
  entity_type TEXT,
  entity_id   TEXT,
  details     JSONB,
  ip_hint     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id  ON public.audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category   ON public.audit_logs (category);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON public.audit_logs;
CREATE POLICY "audit_logs_tenant_isolation" ON public.audit_logs
  FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') IN ('agency', 'support')
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') IN ('agency', 'support')
  );
