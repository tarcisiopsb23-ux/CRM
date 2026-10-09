-- ============================================================
-- Migration 00207: Representantes legais expandidos + vigência diferida
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- 1. Expande client_representatives: telefone, email, qualificacao,
--    is_legal_representative (separado de is_signing_responsible)
-- 2. Adiciona campos de vigência diferida e prazo mínimo em contracts_v2
-- 3. Adiciona setup_amount manual em contracts_v2
-- ============================================================

-- ── 1. Expande client_representatives ────────────────────────────────────────

ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS telefone    TEXT,
  ADD COLUMN IF NOT EXISTS email       TEXT,
  ADD COLUMN IF NOT EXISTS qualificacao TEXT
    CHECK (qualificacao IN (
      'proprietario', 'socio', 'socio_administrador',
      'administrativo', 'financeiro', 'criativo'
    )),
  ADD COLUMN IF NOT EXISTS is_legal_representative BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_representatives.qualificacao IS
  'proprietario | socio | socio_administrador | administrativo | financeiro | criativo';

COMMENT ON COLUMN public.client_representatives.is_legal_representative IS
  'Indica que este representante tem poder legal de assinatura no contrato.
   Diferente de is_signing_responsible (quem assina neste contrato específico).';

-- Migra is_signing_responsible → is_legal_representative para registros existentes
UPDATE public.client_representatives
SET is_legal_representative = is_signing_responsible
WHERE is_legal_representative = false AND is_signing_responsible = true;

-- ── 2. Vigência diferida e prazo mínimo em contracts_v2 ──────────────────────

-- Data de início da vigência (pode ser posterior à data de contratação)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS vigencia_inicio DATE;

-- Data de fim da vigência (calculada: vigencia_inicio + prazo)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS vigencia_fim DATE;

-- Prazo mínimo de permanência em meses (fidelidade — pode ser ≠ prazo total)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS prazo_minimo_meses INTEGER;

-- Setup manual informado no cadastro do contrato
-- (complementa o calculado automaticamente pelos blocos financeiros)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS setup_amount_manual NUMERIC(12,2);

COMMENT ON COLUMN public.contracts_v2.vigencia_inicio IS
  'Data de início da vigência do contrato. Pode ser posterior à data de contratação
   (start_date). Ex: contrato assinado em junho mas vigência inicia em agosto.';

COMMENT ON COLUMN public.contracts_v2.vigencia_fim IS
  'Data calculada de fim da vigência: vigencia_inicio + prazo_vigencia_meses.
   Nulo quando o prazo não é fixo.';

COMMENT ON COLUMN public.contracts_v2.prazo_minimo_meses IS
  'Prazo mínimo de permanência (fidelidade) em meses.
   Pode ser diferente do prazo total de vigência.';

COMMENT ON COLUMN public.contracts_v2.setup_amount_manual IS
  'Valor de setup informado manualmente no cadastro do contrato.
   Quando preenchido, sobrepõe o calculado pelos blocos financeiros.';

-- ── 3. Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('representatives_and_contract_dates_v1')
ON CONFLICT (version) DO NOTHING;
