-- ============================================================
-- Migration 00213: Forma de pagamento recorrente + Chave PIX
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- 1. contracts_v2: adiciona recurring_payment_method
-- 2. organizations: adiciona chave_pix
-- ============================================================

-- ── 1. Forma de pagamento recorrente em contracts_v2 ─────────────────────────

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS recurring_payment_method TEXT
    CHECK (recurring_payment_method IN ('pix', 'boleto', 'cartao', 'transferencia'));

COMMENT ON COLUMN public.contracts_v2.recurring_payment_method IS
  'Forma de pagamento das mensalidades recorrentes.
   Valores: pix | boleto | cartao | transferencia.
   Usado para preencher {{forma_pagamento}} nas alíneas do contrato.';

-- ── 2. Chave PIX da organização ───────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS chave_pix TEXT;

COMMENT ON COLUMN public.organizations.chave_pix IS
  'Chave PIX da organização para instrução de pagamento nos contratos.
   Pode ser CNPJ, e-mail, telefone ou chave aleatória.
   Usado para preencher {{chave_pix}} nas alíneas do contrato.';

-- ── 3. Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('payment_method_and_chave_pix_v1')
ON CONFLICT (version) DO NOTHING;
