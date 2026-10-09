-- Migration: 001_plans_and_subscriptions.sql
-- Cria tabelas de planos e assinaturas de tenants no SaaS_DB

-- Tabela de planos disponíveis
CREATE TABLE IF NOT EXISTS plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  max_users   INTEGER NOT NULL,
  price_brl   NUMERIC(10,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de assinaturas de tenants
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL UNIQUE,
  plan_id     UUID NOT NULL REFERENCES plans(id),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id ON tenant_subscriptions (tenant_id);

-- Garantir unicidade do nome do plano para que ON CONFLICT funcione corretamente
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_name_unique' AND conrelid = 'plans'::regclass
  ) THEN
    ALTER TABLE plans ADD CONSTRAINT plans_name_unique UNIQUE (name);
  END IF;
END $;

-- Inserir planos iniciais (idempotente)
INSERT INTO plans (name, max_users, price_brl)
VALUES
  ('Starter',    3,   0.00),
  ('Pro',        10,  197.00),
  ('Enterprise', 50,  497.00)
ON CONFLICT (name) DO NOTHING;
