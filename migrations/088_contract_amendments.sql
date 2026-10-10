-- =============================================================================
-- Migration 088: Aditivos contratuais (contract_amendments)
--
-- Registra toda alteração feita em contratos após a assinatura (is_signed=true).
-- Também cobre renovações (amendment_type = 'renovacao').
--
-- Regras de negócio:
--   - Qualquer alteração em contrato assinado gera um aditivo
--   - Renovação: estende prazo + novos valores + gera novos lançamentos
--   - Cada aditivo pode gerar um documento para assinatura
--   - Histórico completo de alterações vinculado ao contrato original
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_amendments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id         UUID        NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Tipo do aditivo
  amendment_type      TEXT        NOT NULL CHECK (amendment_type IN (
    'renovacao',        -- estende prazo + novos valores
    'reajuste',         -- alteração de valor sem mudança de prazo
    'prazo',            -- alteração de prazo sem mudança de valor
    'escopo',           -- alteração de escopo/serviços
    'outro'             -- demais alterações
  )),

  -- Número sequencial do aditivo (1º, 2º, 3º...)
  amendment_number    INTEGER     NOT NULL DEFAULT 1,

  -- Motivo / descrição da alteração
  reason              TEXT        NOT NULL,

  -- ── Campos de renovação / extensão de prazo ─────────────────────────────
  -- Prazo adicional (em meses) — para tipo renovacao/prazo
  additional_months   INTEGER,
  -- Nova data de término após o aditivo
  new_end_date        DATE,
  -- Nova duração total do contrato
  new_duration_months INTEGER,

  -- ── Novo valor acordado ─────────────────────────────────────────────────
  -- Valor recorrente anterior (snapshot)
  previous_value      NUMERIC(15,2),
  -- Novo valor recorrente
  new_value           NUMERIC(15,2),
  -- Data de vigência do novo valor
  value_effective_date DATE,

  -- ── Documento do aditivo ────────────────────────────────────────────────
  -- Conteúdo HTML/texto do documento gerado
  document_content    TEXT,
  -- URL do PDF gerado
  pdf_url             TEXT,
  -- Status do aditivo
  status              TEXT        NOT NULL DEFAULT 'rascunho' CHECK (status IN (
    'rascunho',
    'pendente_assinatura',
    'assinado',
    'cancelado'
  )),
  signed_at           TIMESTAMPTZ,

  -- ── Metadados extras ────────────────────────────────────────────────────
  -- Snapshot dos dados anteriores do contrato (para auditoria)
  previous_snapshot   JSONB       DEFAULT '{}'::jsonb,
  -- Dados específicos do tipo (ex: novo schedule evolutivo)
  metadata            JSONB       DEFAULT '{}'::jsonb,

  created_by          UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (contract_id, amendment_number)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ca_contract_id    ON public.contract_amendments(contract_id);
CREATE INDEX IF NOT EXISTS idx_ca_organization_id ON public.contract_amendments(organization_id);
CREATE INDEX IF NOT EXISTS idx_ca_client_id       ON public.contract_amendments(client_id);
CREATE INDEX IF NOT EXISTS idx_ca_status          ON public.contract_amendments(status);

-- RLS
ALTER TABLE public.contract_amendments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_all" ON public.contract_amendments;
CREATE POLICY "ca_all" ON public.contract_amendments
  FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_amendments TO authenticated;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ca_updated_at ON public.contract_amendments;
CREATE TRIGGER trg_ca_updated_at
  BEFORE UPDATE ON public.contract_amendments
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

-- Versão
INSERT INTO public.schema_migrations (version)
VALUES ('088_contract_amendments_v1')
ON CONFLICT (version) DO NOTHING;
