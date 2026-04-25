-- =============================================================================
-- Migration 00135: Catálogo de planos do C8 Control
-- Permite predefinir planos com nome, max_users, valor e periodicidade
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.c8_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  max_users       INTEGER NOT NULL DEFAULT 1 CHECK (max_users >= 1 AND max_users <= 100),
  monthly_value   NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_cycle   TEXT NOT NULL DEFAULT 'mensal'
    CHECK (billing_cycle IN ('mensal', 'trimestral', 'semestral', 'anual')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_c8_plans_org ON public.c8_plans (organization_id);

ALTER TABLE public.c8_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY c8_plans_org ON public.c8_plans
  FOR ALL
  USING (organization_id = get_user_organization_id());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_c8_plans_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_c8_plans_updated_at
  BEFORE UPDATE ON public.c8_plans
  FOR EACH ROW EXECUTE FUNCTION update_c8_plans_updated_at();

-- Fix: o usuário principal (primary_user_email) conta como 1 usuário no limite
-- Atualizar a query de contagem em useC8Tenants para incluir o usuário principal
-- (isso é tratado no frontend — ver useC8Tenants.ts)
