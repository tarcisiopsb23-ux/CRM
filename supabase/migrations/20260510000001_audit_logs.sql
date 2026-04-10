-- Migration: audit_logs
-- Tabela de auditoria para registrar ações dos usuários no C8 Control.
-- Acessível apenas para o admin do tenant e usuários de suporte.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  user_id     UUID        NOT NULL,
  user_email  TEXT,
  user_role   TEXT        NOT NULL DEFAULT 'member',
  action      TEXT        NOT NULL,
  -- Categorias: login, lead, config, user, crm, support
  category    TEXT        NOT NULL DEFAULT 'geral',
  entity_type TEXT,       -- 'lead', 'client', 'tenant_user', etc.
  entity_id   TEXT,       -- ID do objeto afetado
  details     JSONB,      -- dados extras (ex: campos alterados)
  ip_hint     TEXT,       -- não armazenamos IP real, apenas hint (ex: "browser")
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant_id  ON public.audit_logs (tenant_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_category   ON public.audit_logs (category);

-- RLS: admin do tenant vê apenas seus logs; suporte vê todos
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_tenant_isolation" ON public.audit_logs
  FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') IN ('agency', 'support')
  );

-- Qualquer usuário autenticado pode inserir logs do seu próprio tenant
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') IN ('agency', 'support')
  );
