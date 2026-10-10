-- ============================================================
-- Migration 00205: Contract System Improvements
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- 1. Tabela contract_signature_blocks (blocos de assinatura configuráveis)
-- 2. Coluna signing_type em clients
-- 3. Tabela client_representatives (múltiplos representantes legais)
-- 4. Colunas condition_type / condition_value em contract_clauses
-- 5. Seed dos 3 blocos de assinatura padrão por organização
-- ============================================================

-- ── 1. Blocos de assinatura configuráveis ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_signature_blocks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  html_content    TEXT        NOT NULL DEFAULT '',
  display_order   INTEGER     NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_contract_signature_blocks_org
  ON public.contract_signature_blocks(organization_id, is_active, display_order);

ALTER TABLE public.contract_signature_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_signature_blocks_org ON public.contract_signature_blocks;
CREATE POLICY contract_signature_blocks_org ON public.contract_signature_blocks
  FOR ALL USING (organization_id = get_user_organization_id());

DROP TRIGGER IF EXISTS update_contract_signature_blocks_updated ON public.contract_signature_blocks;
CREATE TRIGGER update_contract_signature_blocks_updated
  BEFORE UPDATE ON public.contract_signature_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 2. Tipo de assinatura no cadastro do cliente ─────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS signing_type TEXT NOT NULL DEFAULT 'individual'
  CHECK (signing_type IN ('individual', 'joint'));

-- ── 3. Representantes legais do cliente ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_representatives (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id        UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome                   TEXT        NOT NULL,
  cpf                    TEXT        NOT NULL,
  cargo                  TEXT,
  is_signing_responsible BOOLEAN     NOT NULL DEFAULT false,
  display_order          INTEGER     NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_representatives_client
  ON public.client_representatives(client_id, display_order);

CREATE INDEX IF NOT EXISTS idx_client_representatives_org
  ON public.client_representatives(organization_id);

ALTER TABLE public.client_representatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_representatives_org ON public.client_representatives;
CREATE POLICY client_representatives_org ON public.client_representatives
  FOR ALL USING (organization_id = get_user_organization_id());

DROP TRIGGER IF EXISTS update_client_representatives_updated ON public.client_representatives;
CREATE TRIGGER update_client_representatives_updated
  BEFORE UPDATE ON public.client_representatives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. Condições de cláusulas por atributo do contrato ───────────────────────
-- Adiciona condition_type e condition_value como alternativa ao service_slug.
-- Retrocompatibilidade: registros com condition_type NULL continuam funcionando
-- pela lógica de service_slug / is_fixed já existente.

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS condition_type  TEXT;

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS condition_value JSONB;

COMMENT ON COLUMN public.contract_clauses.condition_type IS
  'Tipo de condição de inclusão da alínea. Valores: always, service, has_setup,
   has_min_duration, has_multiple_representatives, signing_type, has_schedule,
   service_count. NULL = retrocompatibilidade (usa is_fixed / service_slug).';

COMMENT ON COLUMN public.contract_clauses.condition_value IS
  'Parâmetros da condição em JSON. Exemplos:
   service: {"slugs": ["agente_ia", "assessoria"]}
   has_min_duration: {"min_months": 12}
   signing_type: {"type": "joint"}
   service_count: {"min": 2}';

-- ── 5. Seed dos blocos de assinatura padrão ──────────────────────────────────

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- Bloco único de assinaturas com layout de colunas lado a lado
    -- Linha 1: CONTRATADA (esq) | CONTRATANTE (dir)
    -- Linha 2: representante_2 (dir) — se houver assinatura conjunta
    -- Linha 3: TESTEMUNHAS lado a lado
    INSERT INTO public.contract_signature_blocks
      (organization_id, name, slug, html_content, display_order)
    VALUES (
      org.id,
      'Bloco de Assinaturas',
      'bloco_assinaturas',
      $A$<div class="sig-row-table">
  <div class="sig-col">
    <p><strong>CONTRATADA</strong></p>
    <p class="sig-line">&nbsp;</p>
    <p><strong>AGÊNCIA C8 LTDA</strong></p>
    <p>Tarcísio Pereira da Silva Brito</p>
    <p>Sócio-Administrador</p>
  </div>
  <div class="sig-col">
    <p><strong>CONTRATANTE</strong></p>
    <p class="sig-line">&nbsp;</p>
    <p><strong>{{contratante_razao_social}}</strong></p>
    <p>{{representante_nome}}</p>
  </div>
</div>
<div class="sig-row-table">
  <div class="sig-col">
    <p><strong>TESTEMUNHAS</strong></p>
    <p class="sig-line">&nbsp;</p>
    <p>Nome:</p>
  </div>
  <div class="sig-col">
    <p class="sig-line">&nbsp;</p>
    <p>Nome:</p>
  </div>
</div>$A$,
      1
    )
    ON CONFLICT (organization_id, slug) DO NOTHING;

  END LOOP;
END $$;

-- ── 6. Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('contract_improvements_v1')
ON CONFLICT (version) DO NOTHING;
