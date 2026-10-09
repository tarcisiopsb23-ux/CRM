-- ===========================================================
-- ARQUIVO: 00205_contract_improvements.sql
-- ===========================================================
-- ============================================================
-- Migration 00205: Contract System Improvements
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- 1. Tabela contract_signature_blocks (blocos de assinatura configurÃ¡veis)
-- 2. Coluna signing_type em clients
-- 3. Tabela client_representatives (mÃºltiplos representantes legais)
-- 4. Colunas condition_type / condition_value em contract_clauses
-- 5. Seed dos 3 blocos de assinatura padrÃ£o por organizaÃ§Ã£o
-- ============================================================

-- â”€â”€ 1. Blocos de assinatura configurÃ¡veis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

-- â”€â”€ 2. Tipo de assinatura no cadastro do cliente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS signing_type TEXT NOT NULL DEFAULT 'individual'
  CHECK (signing_type IN ('individual', 'joint'));

-- â”€â”€ 3. Representantes legais do cliente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

-- â”€â”€ 4. CondiÃ§Ãµes de clÃ¡usulas por atributo do contrato â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Adiciona condition_type e condition_value como alternativa ao service_slug.
-- Retrocompatibilidade: registros com condition_type NULL continuam funcionando
-- pela lÃ³gica de service_slug / is_fixed jÃ¡ existente.

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS condition_type  TEXT;

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS condition_value JSONB;

COMMENT ON COLUMN public.contract_clauses.condition_type IS
  'Tipo de condiÃ§Ã£o de inclusÃ£o da alÃ­nea. Valores: always, service, has_setup,
   has_min_duration, has_multiple_representatives, signing_type, has_schedule,
   service_count. NULL = retrocompatibilidade (usa is_fixed / service_slug).';

COMMENT ON COLUMN public.contract_clauses.condition_value IS
  'ParÃ¢metros da condiÃ§Ã£o em JSON. Exemplos:
   service: {"slugs": ["agente_ia", "assessoria"]}
   has_min_duration: {"min_months": 12}
   signing_type: {"type": "joint"}
   service_count: {"min": 2}';

-- â”€â”€ 5. Seed dos blocos de assinatura padrÃ£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- Bloco Ãºnico de assinaturas com layout de colunas lado a lado
    -- Linha 1: CONTRATADA (esq) | CONTRATANTE (dir)
    -- Linha 2: representante_2 (dir) â€” se houver assinatura conjunta
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
    <p><strong>AGÃŠNCIA C8 LTDA</strong></p>
    <p>TarcÃ­sio Pereira da Silva Brito</p>
    <p>SÃ³cio-Administrador</p>
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

-- â”€â”€ 6. Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('contract_improvements_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00205_contract_primary_service.sql
-- ===========================================================
-- ============================================================
-- Migration 00205: ServiÃ§o principal do contrato
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- Adiciona primary_service_slug em contracts_v2:
--   - Identifica qual serviÃ§o Ã© o objeto principal do contrato
--   - Usado nas variÃ¡veis {{servico_principal}} e {{servico_principal_slug}}
--   - Influencia o tÃ­tulo padrÃ£o do contrato
-- ============================================================

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS primary_service_slug TEXT;

COMMENT ON COLUMN public.contracts_v2.primary_service_slug IS
  'Slug do serviÃ§o principal do contrato (objeto). '
  'Deve estar presente em service_slugs. '
  'Gera as variÃ¡veis {{servico_principal}} e {{servico_principal_slug}} no documento.';


-- ===========================================================
-- ARQUIVO: 00206_service_catalog_slug.sql
-- ===========================================================
-- ============================================================
-- Migration 00206: Adiciona slug ao service_catalog
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- O slug identifica o serviÃ§o para vinculaÃ§Ã£o com clÃ¡usulas
-- condicionais e seleÃ§Ã£o no ContractGenerator.
-- Gerado automaticamente a partir do name ao criar/atualizar.
-- ============================================================

-- 1. Adiciona coluna slug
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Preenche slugs existentes a partir do name
--    Converte para minÃºsculas, substitui espaÃ§os e caracteres
--    especiais por underscore, remove acentos via unaccent se disponÃ­vel
DO $$
BEGIN
  -- Tenta usar unaccent (extensÃ£o opcional)
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent') THEN
    UPDATE public.service_catalog
    SET slug = regexp_replace(
      lower(unaccent(name)), '[^a-z0-9]+', '_', 'g'
    )
    WHERE slug IS NULL OR slug = '';
  ELSE
    -- Sem unaccent: normaliza manualmente as letras acentuadas mais comuns
    UPDATE public.service_catalog
    SET slug = regexp_replace(
      lower(
        translate(name,
          'Ã€ÃÃ‚ÃƒÃ„Ã…Ã Ã¡Ã¢Ã£Ã¤Ã¥ÃˆÃ‰ÃŠÃ‹Ã¨Ã©ÃªÃ«ÃŒÃÃŽÃÃ¬Ã­Ã®Ã¯Ã’Ã“Ã”Ã•Ã–Ã²Ã³Ã´ÃµÃ¶Ã™ÃšÃ›ÃœÃ¹ÃºÃ»Ã¼Ã‡Ã§Ã‘Ã±',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
        )
      ), '[^a-z0-9]+', '_', 'g'
    )
    WHERE slug IS NULL OR slug = '';
  END IF;
END $$;

-- Limpa underscores iniciais/finais
UPDATE public.service_catalog
SET slug = trim(both '_' from slug)
WHERE slug IS NOT NULL;

-- 3. Em caso de slugs duplicados na mesma org, sufixar com nÃºmero
DO $$
DECLARE
  r RECORD;
  cnt INTEGER;
BEGIN
  FOR r IN
    SELECT organization_id, slug, COUNT(*) as n
    FROM public.service_catalog
    WHERE slug IS NOT NULL
    GROUP BY organization_id, slug
    HAVING COUNT(*) > 1
  LOOP
    cnt := 1;
    UPDATE public.service_catalog
    SET slug = slug || '_' || cnt
    WHERE ctid IN (
      SELECT ctid FROM public.service_catalog
      WHERE organization_id = r.organization_id AND slug = r.slug
      ORDER BY created_at
      OFFSET 1
    );
    cnt := cnt + 1;
  END LOOP;
END $$;

-- 4. Define NOT NULL e UNIQUE apÃ³s preenchimento
ALTER TABLE public.service_catalog
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.service_catalog
  ALTER COLUMN slug SET DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_catalog_org_slug_unique'
      AND table_name = 'service_catalog'
  ) THEN
    ALTER TABLE public.service_catalog
      ADD CONSTRAINT service_catalog_org_slug_unique
      UNIQUE (organization_id, slug);
  END IF;
END $$;

-- 5. Schema migrations version
INSERT INTO public.schema_migrations (version)
VALUES ('service_catalog_slug_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00207_representatives_and_contract_dates.sql
-- ===========================================================
-- ============================================================
-- Migration 00207: Representantes legais expandidos + vigÃªncia diferida
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- 1. Expande client_representatives: telefone, email, qualificacao,
--    is_legal_representative (separado de is_signing_responsible)
-- 2. Adiciona campos de vigÃªncia diferida e prazo mÃ­nimo em contracts_v2
-- 3. Adiciona setup_amount manual em contracts_v2
-- ============================================================

-- â”€â”€ 1. Expande client_representatives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
   Diferente de is_signing_responsible (quem assina neste contrato especÃ­fico).';

-- Migra is_signing_responsible â†’ is_legal_representative para registros existentes
UPDATE public.client_representatives
SET is_legal_representative = is_signing_responsible
WHERE is_legal_representative = false AND is_signing_responsible = true;

-- â”€â”€ 2. VigÃªncia diferida e prazo mÃ­nimo em contracts_v2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- Data de inÃ­cio da vigÃªncia (pode ser posterior Ã  data de contrataÃ§Ã£o)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS vigencia_inicio DATE;

-- Data de fim da vigÃªncia (calculada: vigencia_inicio + prazo)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS vigencia_fim DATE;

-- Prazo mÃ­nimo de permanÃªncia em meses (fidelidade â€” pode ser â‰  prazo total)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS prazo_minimo_meses INTEGER;

-- Setup manual informado no cadastro do contrato
-- (complementa o calculado automaticamente pelos blocos financeiros)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS setup_amount_manual NUMERIC(12,2);

COMMENT ON COLUMN public.contracts_v2.vigencia_inicio IS
  'Data de inÃ­cio da vigÃªncia do contrato. Pode ser posterior Ã  data de contrataÃ§Ã£o
   (start_date). Ex: contrato assinado em junho mas vigÃªncia inicia em agosto.';

COMMENT ON COLUMN public.contracts_v2.vigencia_fim IS
  'Data calculada de fim da vigÃªncia: vigencia_inicio + prazo_vigencia_meses.
   Nulo quando o prazo nÃ£o Ã© fixo.';

COMMENT ON COLUMN public.contracts_v2.prazo_minimo_meses IS
  'Prazo mÃ­nimo de permanÃªncia (fidelidade) em meses.
   Pode ser diferente do prazo total de vigÃªncia.';

COMMENT ON COLUMN public.contracts_v2.setup_amount_manual IS
  'Valor de setup informado manualmente no cadastro do contrato.
   Quando preenchido, sobrepÃµe o calculado pelos blocos financeiros.';

-- â”€â”€ 3. Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('representatives_and_contract_dates_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00208_procuradores_pf_fields.sql
-- ===========================================================
-- ============================================================
-- Migration 00208: Procuradores em client_representatives
--                  + campos PF (estado_civil, nacionalidade) em clients
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- 1. Expande client_representatives com campos de procuraÃ§Ã£o:
--      tipo_representacao, procuracao_tipo, procuracao_data,
--      procuracao_validade, procuracao_indeterminada,
--      procuracao_notas, representa_ids
-- 2. Adiciona funÃ§Ã£o is_procuracao_vencida() para uso em queries
-- 3. Adiciona coluna computada procuracao_vencida (GENERATED) via view
-- 4. Adiciona estado_civil e nacionalidade em clients (campos PF)
-- ============================================================

-- â”€â”€ 1. Novos campos em client_representatives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- Tipo de representaÃ§Ã£o: direto (sÃ³cio/proprietÃ¡rio) ou via procuraÃ§Ã£o
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS tipo_representacao TEXT NOT NULL DEFAULT 'legal'
    CHECK (tipo_representacao IN ('legal', 'procurador'));

-- Tipo do instrumento de procuraÃ§Ã£o
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_tipo TEXT
    CHECK (procuracao_tipo IN ('publica', 'particular'));

-- Data de lavratura da procuraÃ§Ã£o
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_data DATE;

-- Data de validade da procuraÃ§Ã£o (NULL quando indeterminada)
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_validade DATE;

-- Flag explÃ­cita: prazo indeterminado (true) ou determinado (false/null)
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_indeterminada BOOLEAN NOT NULL DEFAULT false;

-- Notas da procuraÃ§Ã£o: cartÃ³rio, livro, folha, matrÃ­cula, etc.
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_notas TEXT;

-- IDs dos representantes legais que este procurador representa.
-- NULL = representa a prÃ³pria parte (contratante PJ ou PF diretamente).
-- Array de UUIDs referenciando outros registros de client_representatives.
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS representa_ids UUID[];

COMMENT ON COLUMN public.client_representatives.tipo_representacao IS
  'legal = representante legal direto (sÃ³cio, proprietÃ¡rio, etc.)
   procurador = age por procuraÃ§Ã£o em nome de outro representante ou da parte';

COMMENT ON COLUMN public.client_representatives.procuracao_tipo IS
  'publica = lavrada em cartÃ³rio (escritura pÃºblica)
   particular = instrumento particular assinado';

COMMENT ON COLUMN public.client_representatives.procuracao_data IS
  'Data em que a procuraÃ§Ã£o foi lavrada/assinada.';

COMMENT ON COLUMN public.client_representatives.procuracao_validade IS
  'Data de vencimento da procuraÃ§Ã£o. NULL quando procuracao_indeterminada = true.
   Usado exclusivamente para controle interno do CRM â€” nÃ£o aparece no contrato.';

COMMENT ON COLUMN public.client_representatives.procuracao_indeterminada IS
  'true = procuraÃ§Ã£o sem prazo de vencimento definido.
   Quando true, procuracao_validade deve ser NULL.';

COMMENT ON COLUMN public.client_representatives.procuracao_notas IS
  'InformaÃ§Ãµes adicionais: cartÃ³rio, nÃºmero do livro, folha, matrÃ­cula, etc.
   Campo livre para controle interno do CRM.';

COMMENT ON COLUMN public.client_representatives.representa_ids IS
  'Array de IDs (client_representatives.id) dos representantes legais que este
   procurador representa. NULL = representa a prÃ³pria parte (PJ ou PF).
   Ãštil em assinaturas conjuntas onde cada sÃ³cio pode ter procurador distinto.';

-- Constraint: campos de procuraÃ§Ã£o sÃ³ fazem sentido quando tipo_representacao = 'procurador'
-- (validaÃ§Ã£o soft â€” nÃ£o bloqueante para nÃ£o quebrar seeds existentes)
-- A regra de negÃ³cio Ã© reforÃ§ada na camada de aplicaÃ§Ã£o.

-- â”€â”€ 2. FunÃ§Ã£o utilitÃ¡ria: is_procuracao_vencida â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.is_procuracao_vencida(
  p_validade          DATE,
  p_indeterminada     BOOLEAN
) RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    CASE
      WHEN p_indeterminada = true  THEN false          -- prazo indeterminado â†’ nunca vence
      WHEN p_validade IS NULL      THEN false          -- sem data informada â†’ nÃ£o considera vencido
      ELSE p_validade < CURRENT_DATE
    END;
$$;

COMMENT ON FUNCTION public.is_procuracao_vencida(DATE, BOOLEAN) IS
  'Retorna true se a procuraÃ§Ã£o estÃ¡ vencida (validade < hoje) e nÃ£o Ã© indeterminada.
   Uso: SELECT is_procuracao_vencida(procuracao_validade, procuracao_indeterminada)
          FROM client_representatives WHERE tipo_representacao = ''procurador'';';

GRANT EXECUTE ON FUNCTION public.is_procuracao_vencida(DATE, BOOLEAN) TO authenticated;

-- â”€â”€ 3. View: client_representatives_vw (acrescenta procuracao_vencida) â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE VIEW public.client_representatives_vw AS
SELECT
  r.*,
  public.is_procuracao_vencida(r.procuracao_validade, r.procuracao_indeterminada)
    AS procuracao_vencida
FROM public.client_representatives r;

COMMENT ON VIEW public.client_representatives_vw IS
  'VisÃ£o de client_representatives com a coluna calculada procuracao_vencida.
   Use esta view para listar representantes e filtrar procuraÃ§Ãµes vencidas no CRM.';

-- â”€â”€ 4. Campos PF em clients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- Estado civil â€” relevante apenas para pessoa fÃ­sica (document com 11 dÃ­gitos)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS estado_civil TEXT
    CHECK (estado_civil IN (
      'solteiro', 'casado', 'viuvo', 'divorciado', 'uniao_estavel'
    ));

-- Nacionalidade â€” usada na qualificaÃ§Ã£o do contratante PF
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS nacionalidade TEXT DEFAULT 'brasileiro(a)';

COMMENT ON COLUMN public.clients.estado_civil IS
  'Estado civil do contratante pessoa fÃ­sica.
   Valores: solteiro, casado, viuvo, divorciado, uniao_estavel.
   NULL para pessoa jurÃ­dica (CNPJ).';

COMMENT ON COLUMN public.clients.nacionalidade IS
  'Nacionalidade do contratante pessoa fÃ­sica para qualificaÃ§Ã£o no contrato.
   PadrÃ£o: brasileiro(a). NULL para pessoa jurÃ­dica (CNPJ).';

-- â”€â”€ 5. Ãndice auxiliar para busca por procuraÃ§Ãµes vencidas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE INDEX IF NOT EXISTS idx_client_representatives_procuracao
  ON public.client_representatives(client_id, tipo_representacao, procuracao_validade)
  WHERE tipo_representacao = 'procurador';

-- â”€â”€ 6. Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('procuradores_pf_fields_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00209_template_qualificacao_contratante.sql
-- ===========================================================
-- ============================================================
-- Migration 00209: Atualiza parties_block do template padrÃ£o
--                  para usar {{qualificacao_contratante}}
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- Substitui o bloco fixo de qualificaÃ§Ã£o do contratante
-- (que tinha CNPJ hardcoded e representante fixo) pela variÃ¡vel
-- dinÃ¢mica {{qualificacao_contratante}}, resolvida em tempo de
-- montagem por buildQualificacaoContratante() conforme PF/PJ,
-- representantes legais e procuradores.
--
-- O html_content dos templates Ã© re-gerado por DO $$ ... $$
-- apenas se ainda contiver o padrÃ£o antigo (idempotente).
-- ============================================================

-- â”€â”€ 1. Atualiza html_content dos templates que usam o padrÃ£o antigo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

DO $$
DECLARE
  tpl RECORD;
BEGIN
  FOR tpl IN
    SELECT id, html_content
    FROM public.contract_templates
    WHERE html_content LIKE '%{{contratante_razao_social}}%'
      AND html_content LIKE '%{{contratante_cnpj}}%'
      AND html_content NOT LIKE '%{{qualificacao_contratante}}%'
  LOOP
    -- Substitui o parÃ¡grafo fixo do contratante pela variÃ¡vel dinÃ¢mica.
    -- O padrÃ£o regex cobre variaÃ§Ãµes com ou sem atributos inline de estilo.
    UPDATE public.contract_templates
    SET html_content = regexp_replace(
      html_content,
      -- Captura o <p> inteiro que comeÃ§a com {{contratante_razao_social}}
      -- e vai atÃ© o </p> (incluindo newlines via flag 's' nÃ£o disponÃ­vel
      -- no Postgres â€” usamos [^<]* para cobrir o padrÃ£o tÃ­pico)
      '<p>\s*\{\{contratante_razao_social\}\}[^<]*inscrita[^<]*CNPJ[^<]*\{\{contratante_cnpj\}\}[^<]*\{\{representante_nome\}\}[^<]*</p>',
      '<p>{{qualificacao_contratante}}</p>',
      'g'
    )
    WHERE id = tpl.id;
  END LOOP;
END $$;

-- â”€â”€ 2. Abordagem complementar: substitui via replace() simples â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Caso o regexp acima nÃ£o encontre variaÃ§Ãµes do padrÃ£o (ex: formataÃ§Ã£o diferente),
-- usa replace direto na linha exata gerada pela migration 00204.

UPDATE public.contract_templates
SET html_content = replace(
  html_content,
  -- Linha exata semeada em 00204
  '  <p>{{contratante_razao_social}}, inscrita sob o CNPJ nÂ° {{contratante_cnpj}}, com sede na {{contratante_endereco}}, neste ato representada por {{representante_nome}}, inscrito no CPF nÂº {{representante_cpf}}, doravante denominado <strong>CONTRATANTE</strong>.</p>',
  '  <p>{{qualificacao_contratante}}</p>'
)
WHERE html_content LIKE '%{{contratante_razao_social}}%'
  AND html_content LIKE '%{{representante_nome}}%'
  AND html_content NOT LIKE '%{{qualificacao_contratante}}%';

-- â”€â”€ 3. Template padrÃ£o: garante que organizations sem template
--      recebam o novo modelo quando provisionadas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
--
-- O seed do template padrÃ£o (migration 00204) Ã© re-executado apenas para
-- orgs que ainda nÃ£o tÃªm nenhum template. O novo html do template padrÃ£o
-- jÃ¡ usa {{qualificacao_contratante}} desde esta migration.
--
-- ReferÃªncia: o seed completo estÃ¡ em 00204 â€” aqui apenas corrigimos o
-- parties_block para novas orgs provisionadas apÃ³s esta migration, via
-- atualizaÃ§Ã£o do valor default usado no seed helper.

-- â”€â”€ 4. Compatibilidade retrÃ³grada â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- As variÃ¡veis antigas ({{representante_nome}}, {{representante_cpf}},
-- {{contratante_razao_social}}, {{contratante_cnpj}}, {{contratante_endereco}})
-- PERMANECEM no varMap de assembleContract.ts para nÃ£o quebrar templates
-- personalizados que ainda as usem diretamente.

-- â”€â”€ 5. Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('template_qualificacao_contratante_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00210_contract_clauses_pf_pj_procurador.sql
-- ===========================================================
-- ============================================================
-- Migration 00210: Seed de alÃ­neas para is_pf, is_pj, has_procurador
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- NOTA: Esta migration depende da 00212 que corrige a constraint
-- chk_contract_clauses_service_slug para aceitar condition_type
-- como alternativa ao service_slug quando is_fixed = false.
-- Se executada antes da 00212, falharÃ¡ com violaÃ§Ã£o de constraint.
--
-- Adiciona ao seed padrÃ£o as alÃ­neas condicionais para:
--   â€¢ is_pj   â€” qualificaÃ§Ã£o societÃ¡ria (sÃ³ PJ)
--   â€¢ is_pf   â€” qualificaÃ§Ã£o pessoal (sÃ³ PF)
--   â€¢ has_procurador â€” clÃ¡usula de instrumento de procuraÃ§Ã£o
--
-- Categoria usada: 'disposicoes' (disposiÃ§Ãµes gerais)
-- As alÃ­neas sÃ³ sÃ£o inseridas se ainda nÃ£o existirem (idempotente).
-- ============================================================

-- Garante que a constraint permite condition_type sem service_slug
ALTER TABLE public.contract_clauses
  DROP CONSTRAINT IF EXISTS chk_contract_clauses_service_slug;

ALTER TABLE public.contract_clauses
  ADD CONSTRAINT chk_contract_clauses_service_slug
  CHECK (
    is_fixed = true
    OR service_slug IS NOT NULL
    OR condition_type IS NOT NULL
  );

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- â”€â”€ AlÃ­nea PJ: qualificaÃ§Ã£o societÃ¡ria â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Capacidade de representaÃ§Ã£o',
      $A$<p>O(A) signatÃ¡rio(a) do presente instrumento declara, sob as penas da lei, que possui plenos poderes para representar o <strong>CONTRATANTE</strong> e firmar este contrato, comprometendo-se a apresentar os documentos societÃ¡rios comprobatÃ³rios sempre que solicitado pela <strong>CONTRATADA</strong>.</p>$A$,
      85, 'is_pj'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Capacidade de representaÃ§Ã£o'
    );

    -- â”€â”€ AlÃ­nea PF: declaraÃ§Ã£o de capacidade civil â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Capacidade civil',
      $A$<p>O <strong>CONTRATANTE</strong> declara ser civilmente capaz, ter plena capacidade para contratar e estar ciente de todos os termos e condiÃ§Ãµes do presente instrumento.</p>$A$,
      86, 'is_pf'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Capacidade civil'
    );

    -- â”€â”€ AlÃ­nea procurador: instrumento de procuraÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Instrumento de procuraÃ§Ã£o',
      $A$<p>O presente contrato Ã© firmado por procurador devidamente constituÃ­do, cujo instrumento de procuraÃ§Ã£o, com poderes expressos para este ato, integra o presente instrumento como <strong>Anexo</strong>, sendo considerado parte integrante deste contrato para todos os fins de direito.</p>
<p>O procurador declara que os poderes outorgados na procuraÃ§Ã£o estÃ£o em pleno vigor na data da assinatura deste instrumento e que nÃ£o ocorreu qualquer evento de revogaÃ§Ã£o, extinÃ§Ã£o ou limitaÃ§Ã£o dos referidos poderes.</p>$A$,
      87, 'has_procurador'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Instrumento de procuraÃ§Ã£o'
    );

  END LOOP;
END $$;

-- â”€â”€ Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('contract_clauses_pf_pj_procurador_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00211_contract_clauses_remuneracao_condicionais.sql
-- ===========================================================
-- ============================================================
-- Migration 00211: Seed de alÃ­neas condicionais na categoria remuneraÃ§Ã£o
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- NOTA: Depende da constraint corrigida em 00210/00212.
-- Requer condition_type preenchido quando service_slug Ã© NULL e is_fixed=false.
--
-- Adiciona alÃ­neas condicionais para:
--   â€¢ has_setup          â€” taxa de implantaÃ§Ã£o (parcela Ãºnica ou parcelada)
--   â€¢ has_setup_installments â€” setup parcelado (detalhamento das parcelas)
--   â€¢ has_min_duration   â€” prazo mÃ­nimo de permanÃªncia / fidelidade
--   â€¢ has_grace_period   â€” carÃªncia (isenÃ§Ã£o nos primeiros meses)
--
-- Todas na category_key = 'remuneracao', is_fixed = false.
-- InserÃ§Ã£o idempotente via WHERE NOT EXISTS.
-- ============================================================

-- Garante constraint correta (idempotente â€” DROP IF EXISTS)
ALTER TABLE public.contract_clauses
  DROP CONSTRAINT IF EXISTS chk_contract_clauses_service_slug;

ALTER TABLE public.contract_clauses
  ADD CONSTRAINT chk_contract_clauses_service_slug
  CHECK (
    is_fixed = true
    OR service_slug IS NOT NULL
    OR condition_type IS NOT NULL
  );

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- â”€â”€ Setup: taxa de implantaÃ§Ã£o (parcela Ãºnica) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- CondiÃ§Ã£o: has_setup â€” contrato tem setup (valor > 0)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Taxa de ImplantaÃ§Ã£o',
      $A$<p>AlÃ©m da remuneraÃ§Ã£o mensal, o <strong>CONTRATANTE</strong> pagarÃ¡ Ã  <strong>CONTRATADA</strong> uma taxa de implantaÃ§Ã£o no valor de <strong>{{valor_setup}}</strong>, correspondente Ã  configuraÃ§Ã£o inicial, onboarding e estruturaÃ§Ã£o do projeto.</p>
<p>O pagamento da taxa de implantaÃ§Ã£o deverÃ¡ ser realizado atÃ© a data de <strong>{{vencimento_setup}}</strong>, mediante <strong>{{forma_pagamento_setup}}</strong>.</p>$A$,
      30, 'has_setup'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Taxa de ImplantaÃ§Ã£o'
    );

    -- â”€â”€ Setup parcelado: detalhamento das parcelas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- CondiÃ§Ã£o: has_setup_installments â€” setup com mais de 1 parcela
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Parcelamento da Taxa de ImplantaÃ§Ã£o',
      $A$<p>A taxa de implantaÃ§Ã£o de <strong>{{valor_setup}}</strong> serÃ¡ parcelada em <strong>{{parcelas_setup}}</strong> parcelas de <strong>{{parcela_setup}}</strong> cada, com vencimento da primeira parcela em <strong>{{vencimento_setup}}</strong> e as demais nos meses subsequentes, na mesma data.</p>
<p>O nÃ£o pagamento de qualquer parcela da taxa de implantaÃ§Ã£o na data de vencimento implicarÃ¡ a incidÃªncia de multa de 2% (dois por cento) sobre o valor em atraso, acrescida de juros moratÃ³rios de 1% (um por cento) ao mÃªs, calculados pro rata die.</p>$A$,
      35, 'has_setup_installments'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Parcelamento da Taxa de ImplantaÃ§Ã£o'
    );

    -- â”€â”€ Prazo mÃ­nimo de permanÃªncia (fidelidade) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- CondiÃ§Ã£o: has_min_duration â€” contrato com prazo mÃ­nimo definido
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Prazo MÃ­nimo de PermanÃªncia',
      $A$<p>O presente contrato possui prazo mÃ­nimo de permanÃªncia de <strong>{{prazo_minimo_extenso}}</strong>, contado a partir da data de inÃ­cio da vigÃªncia (<strong>{{vigencia_inicio}}</strong>).</p>
<p>A rescisÃ£o antecipada pelo <strong>CONTRATANTE</strong> antes do tÃ©rmino do prazo mÃ­nimo implicarÃ¡ o pagamento de multa rescisÃ³ria equivalente ao valor das mensalidades restantes atÃ© o fim do prazo mÃ­nimo, sem prejuÃ­zo de outras penalidades previstas neste instrumento.</p>$A$,
      40, 'has_min_duration'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Prazo MÃ­nimo de PermanÃªncia'
    );

    -- â”€â”€ CarÃªncia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- CondiÃ§Ã£o: has_grace_period â€” contrato com meses de carÃªncia > 0
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'PerÃ­odo de CarÃªncia',
      $A$<p>Fica acordado entre as partes um perÃ­odo de carÃªncia de <strong>{{carencia_extenso}}</strong> a contar da data de inÃ­cio da vigÃªncia, durante o qual o <strong>CONTRATANTE</strong> ficarÃ¡ isento do pagamento da remuneraÃ§Ã£o mensal prevista neste instrumento.</p>
<p>ApÃ³s o tÃ©rmino do perÃ­odo de carÃªncia, a cobranÃ§a da mensalidade terÃ¡ inÃ­cio automaticamente, sendo o primeiro vencimento no dia <strong>{{vencimento}}</strong> do mÃªs imediatamente seguinte ao encerramento da carÃªncia.</p>
<p>O perÃ­odo de carÃªncia nÃ£o isenta o <strong>CONTRATANTE</strong> do pagamento da taxa de implantaÃ§Ã£o, quando aplicÃ¡vel, nem afeta o prazo mÃ­nimo de permanÃªncia estabelecido neste contrato.</p>$A$,
      45, 'has_grace_period'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'PerÃ­odo de CarÃªncia'
    );

    -- â”€â”€ VigÃªncia diferida (inÃ­cio posterior Ã  contrataÃ§Ã£o) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- CondiÃ§Ã£o: has_deferred_start â€” vigencia_inicio diferente de start_date
    -- Ãštil quando o contrato Ã© assinado mas comeÃ§a a valer numa data futura
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'InÃ­cio de VigÃªncia Diferido',
      $A$<p>Embora a assinatura do presente instrumento ocorra na data indicada no preÃ¢mbulo, as obrigaÃ§Ãµes de prestaÃ§Ã£o de serviÃ§os e a contagem dos prazos previstos neste contrato terÃ£o inÃ­cio apenas em <strong>{{vigencia_inicio}}</strong>, data convencionada pelas partes como inÃ­cio efetivo da vigÃªncia.</p>$A$,
      50, 'has_deferred_start'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'InÃ­cio de VigÃªncia Diferido'
    );

  END LOOP;
END $$;

-- â”€â”€ Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('contract_clauses_remuneracao_condicionais_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00212_fix_contract_clauses_constraint.sql
-- ===========================================================
-- ============================================================
-- Migration 00212: Corrige constraint chk_contract_clauses_service_slug
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- A constraint original (migration 00203) exigia:
--   is_fixed = true OU (is_fixed = false AND service_slug IS NOT NULL)
--
-- Isso nÃ£o contempla alÃ­neas condicionais por condition_type
-- (is_pf, is_pj, has_procurador, has_setup, etc.) que nÃ£o tÃªm
-- service_slug mas tambÃ©m nÃ£o sÃ£o fixas.
--
-- Nova regra:
--   is_fixed = true
--   OU service_slug IS NOT NULL          (condicional por serviÃ§o)
--   OU condition_type IS NOT NULL        (condicional por atributo do contrato)
-- ============================================================

-- Remove a constraint antiga e recria com a lÃ³gica corrigida
ALTER TABLE public.contract_clauses
  DROP CONSTRAINT IF EXISTS chk_contract_clauses_service_slug;

ALTER TABLE public.contract_clauses
  ADD CONSTRAINT chk_contract_clauses_service_slug
  CHECK (
    is_fixed = true
    OR service_slug IS NOT NULL
    OR condition_type IS NOT NULL
  );

COMMENT ON CONSTRAINT chk_contract_clauses_service_slug
  ON public.contract_clauses IS
  'Uma alÃ­nea deve ser fixa (is_fixed=true), vinculada a um serviÃ§o
   (service_slug NOT NULL) ou condicional por atributo do contrato
   (condition_type NOT NULL). Pelo menos uma das trÃªs condiÃ§Ãµes deve
   ser verdadeira.';

-- â”€â”€ RÃ©-executa o seed da 00210 que falhou â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- (idempotente â€” WHERE NOT EXISTS garante nÃ£o duplicar)

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- Capacidade de representaÃ§Ã£o (is_pj)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Capacidade de representaÃ§Ã£o',
      $A$<p>O(A) signatÃ¡rio(a) do presente instrumento declara, sob as penas da lei, que possui plenos poderes para representar o <strong>CONTRATANTE</strong> e firmar este contrato, comprometendo-se a apresentar os documentos societÃ¡rios comprobatÃ³rios sempre que solicitado pela <strong>CONTRATADA</strong>.</p>$A$,
      85, 'is_pj'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Capacidade de representaÃ§Ã£o'
    );

    -- Capacidade civil (is_pf)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Capacidade civil',
      $A$<p>O <strong>CONTRATANTE</strong> declara ser civilmente capaz, ter plena capacidade para contratar e estar ciente de todos os termos e condiÃ§Ãµes do presente instrumento.</p>$A$,
      86, 'is_pf'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Capacidade civil'
    );

    -- Instrumento de procuraÃ§Ã£o (has_procurador)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Instrumento de procuraÃ§Ã£o',
      $A$<p>O presente contrato Ã© firmado por procurador devidamente constituÃ­do, cujo instrumento de procuraÃ§Ã£o, com poderes expressos para este ato, integra o presente instrumento como <strong>Anexo</strong>, sendo considerado parte integrante deste contrato para todos os fins de direito.</p>
<p>O procurador declara que os poderes outorgados na procuraÃ§Ã£o estÃ£o em pleno vigor na data da assinatura deste instrumento e que nÃ£o ocorreu qualquer evento de revogaÃ§Ã£o, extinÃ§Ã£o ou limitaÃ§Ã£o dos referidos poderes.</p>$A$,
      87, 'has_procurador'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Instrumento de procuraÃ§Ã£o'
    );

    -- â”€â”€ AlÃ­neas de remuneraÃ§Ã£o (00211) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    -- Taxa de ImplantaÃ§Ã£o (has_setup)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Taxa de ImplantaÃ§Ã£o',
      $A$<p>AlÃ©m da remuneraÃ§Ã£o mensal, o <strong>CONTRATANTE</strong> pagarÃ¡ Ã  <strong>CONTRATADA</strong> uma taxa de implantaÃ§Ã£o no valor de <strong>{{valor_setup}}</strong>, correspondente Ã  configuraÃ§Ã£o inicial, onboarding e estruturaÃ§Ã£o do projeto.</p>
<p>O pagamento da taxa de implantaÃ§Ã£o deverÃ¡ ser realizado atÃ© a data de <strong>{{vencimento_setup}}</strong>, mediante <strong>{{forma_pagamento_setup}}</strong>.</p>$A$,
      30, 'has_setup'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Taxa de ImplantaÃ§Ã£o'
    );

    -- Parcelamento da Taxa de ImplantaÃ§Ã£o (has_setup_installments)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Parcelamento da Taxa de ImplantaÃ§Ã£o',
      $A$<p>A taxa de implantaÃ§Ã£o de <strong>{{valor_setup}}</strong> serÃ¡ parcelada em <strong>{{parcelas_setup}}</strong> parcelas de <strong>{{parcela_setup}}</strong> cada, com vencimento da primeira parcela em <strong>{{vencimento_setup}}</strong> e as demais nos meses subsequentes, na mesma data.</p>
<p>O nÃ£o pagamento de qualquer parcela da taxa de implantaÃ§Ã£o na data de vencimento implicarÃ¡ a incidÃªncia de multa de 2% (dois por cento) sobre o valor em atraso, acrescida de juros moratÃ³rios de 1% (um por cento) ao mÃªs, calculados pro rata die.</p>$A$,
      35, 'has_setup_installments'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Parcelamento da Taxa de ImplantaÃ§Ã£o'
    );

    -- Prazo MÃ­nimo de PermanÃªncia (has_min_duration)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Prazo MÃ­nimo de PermanÃªncia',
      $A$<p>O presente contrato possui prazo mÃ­nimo de permanÃªncia de <strong>{{prazo_minimo_extenso}}</strong>, contado a partir da data de inÃ­cio da vigÃªncia (<strong>{{vigencia_inicio}}</strong>).</p>
<p>A rescisÃ£o antecipada pelo <strong>CONTRATANTE</strong> antes do tÃ©rmino do prazo mÃ­nimo implicarÃ¡ o pagamento de multa rescisÃ³ria equivalente ao valor das mensalidades restantes atÃ© o fim do prazo mÃ­nimo, sem prejuÃ­zo de outras penalidades previstas neste instrumento.</p>$A$,
      40, 'has_min_duration'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Prazo MÃ­nimo de PermanÃªncia'
    );

    -- PerÃ­odo de CarÃªncia (has_grace_period)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'PerÃ­odo de CarÃªncia',
      $A$<p>Fica acordado entre as partes um perÃ­odo de carÃªncia de <strong>{{carencia_extenso}}</strong> a contar da data de inÃ­cio da vigÃªncia, durante o qual o <strong>CONTRATANTE</strong> ficarÃ¡ isento do pagamento da remuneraÃ§Ã£o mensal prevista neste instrumento.</p>
<p>ApÃ³s o tÃ©rmino do perÃ­odo de carÃªncia, a cobranÃ§a da mensalidade terÃ¡ inÃ­cio automaticamente, sendo o primeiro vencimento no dia <strong>{{vencimento}}</strong> do mÃªs imediatamente seguinte ao encerramento da carÃªncia.</p>
<p>O perÃ­odo de carÃªncia nÃ£o isenta o <strong>CONTRATANTE</strong> do pagamento da taxa de implantaÃ§Ã£o, quando aplicÃ¡vel, nem afeta o prazo mÃ­nimo de permanÃªncia estabelecido neste contrato.</p>$A$,
      45, 'has_grace_period'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'PerÃ­odo de CarÃªncia'
    );

    -- InÃ­cio de VigÃªncia Diferido (has_deferred_start)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'InÃ­cio de VigÃªncia Diferido',
      $A$<p>Embora a assinatura do presente instrumento ocorra na data indicada no preÃ¢mbulo, as obrigaÃ§Ãµes de prestaÃ§Ã£o de serviÃ§os e a contagem dos prazos previstos neste contrato terÃ£o inÃ­cio apenas em <strong>{{vigencia_inicio}}</strong>, data convencionada pelas partes como inÃ­cio efetivo da vigÃªncia.</p>$A$,
      50, 'has_deferred_start'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'InÃ­cio de VigÃªncia Diferido'
    );

  END LOOP;
END $$;

-- â”€â”€ Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('fix_contract_clauses_constraint_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00213_payment_method_and_chave_pix.sql
-- ===========================================================
-- ============================================================
-- Migration 00213: Forma de pagamento recorrente + Chave PIX
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- 1. contracts_v2: adiciona recurring_payment_method
-- 2. organizations: adiciona chave_pix
-- ============================================================

-- â”€â”€ 1. Forma de pagamento recorrente em contracts_v2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS recurring_payment_method TEXT
    CHECK (recurring_payment_method IN ('pix', 'boleto', 'cartao', 'transferencia'));

COMMENT ON COLUMN public.contracts_v2.recurring_payment_method IS
  'Forma de pagamento das mensalidades recorrentes.
   Valores: pix | boleto | cartao | transferencia.
   Usado para preencher {{forma_pagamento}} nas alÃ­neas do contrato.';

-- â”€â”€ 2. Chave PIX da organizaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS chave_pix TEXT;

COMMENT ON COLUMN public.organizations.chave_pix IS
  'Chave PIX da organizaÃ§Ã£o para instruÃ§Ã£o de pagamento nos contratos.
   Pode ser CNPJ, e-mail, telefone ou chave aleatÃ³ria.
   Usado para preencher {{chave_pix}} nas alÃ­neas do contrato.';

-- â”€â”€ 3. Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('payment_method_and_chave_pix_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00214_fix_alinea_forma_pagamento.sql
-- ===========================================================
-- ============================================================
-- Migration 00214: Corrige alÃ­neas de forma de pagamento
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- 1. Insere (ou atualiza) a alÃ­nea de forma de pagamento recorrente
--    na categoria 'remuneracao' usando variÃ¡veis dinÃ¢micas em vez
--    de valores hardcoded (CNPJ, data, dia).
-- 2. Atualiza alÃ­neas existentes que contenham o CNPJ da AgÃªncia C8
--    hardcoded no html_content (resquÃ­cios de dados digitados
--    manualmente no editor antes desta correÃ§Ã£o).
-- ============================================================

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- â”€â”€ InserÃ§Ã£o da alÃ­nea padrÃ£o de forma de pagamento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Usa condition_type = 'always' â†’ aparece em todo contrato.
    -- VariÃ¡veis resolvidas em tempo de montagem:
    --   {{forma_pagamento}}  â†’ label da forma recorrente (ex: PIX)
    --   {{vencimento}}       â†’ data do 1Âº pagamento formatada
    --   {{dia_vencimento}}   â†’ dia do mÃªs recorrente (ex: 20)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, true, true,
      'Forma de pagamento',
      $A$<p>Os pagamentos serÃ£o realizados exclusivamente via <strong>{{forma_pagamento}}</strong>, vencendo-se a primeira parcela em <strong>{{vencimento}}</strong> e as demais no dia <strong>{{dia_vencimento}}</strong> de cada mÃªs, sendo a adimplÃªncia condiÃ§Ã£o indispensÃ¡vel para a continuidade da prestaÃ§Ã£o dos serviÃ§os.</p>$A$,
      25,   -- entre multa (20) e taxa de implantaÃ§Ã£o (30)
      'always'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Forma de pagamento'
    );

    -- â”€â”€ Corrige alÃ­neas existentes com dados hardcoded â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Substitui qualquer alÃ­nea de remuneraÃ§Ã£o que contenha o CNPJ da
    -- AgÃªncia C8 hardcoded (62.659.676/0001-49) pelo template com variÃ¡veis.
    -- TambÃ©m cobre variaÃ§Ãµes com o nome "AgÃªncia C8 LTDA".
    UPDATE public.contract_clauses
    SET
      html_content = $A$<p>Os pagamentos serÃ£o realizados exclusivamente via <strong>{{forma_pagamento}}</strong>, vencendo-se a primeira parcela em <strong>{{vencimento}}</strong> e as demais no dia <strong>{{dia_vencimento}}</strong> de cada mÃªs, sendo a adimplÃªncia condiÃ§Ã£o indispensÃ¡vel para a continuidade da prestaÃ§Ã£o dos serviÃ§os.</p>$A$,
      condition_type = 'always',
      is_fixed = true,
      service_slug = NULL
    WHERE organization_id = org.id
      AND category_key = 'remuneracao'
      AND (
        html_content LIKE '%62.659.676/0001-49%'
        OR html_content LIKE '%AgÃªncia C8 LTDA%'
        OR html_content LIKE '%AgÃƒÂªncia C8%'   -- encoding alternativo
      );

  END LOOP;
END $$;

-- â”€â”€ Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('fix_alinea_forma_pagamento_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00215_fix_qualificacao_check.sql
-- ===========================================================
-- ============================================================
-- Migration 00210: Corrige CHECK constraint de qualificacao
--                  em client_representatives
--                  + GRANT na view client_representatives_vw
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- Problema 1: a constraint criada em 00207 lista apenas os valores antigos
--   ('proprietario', 'socio', 'socio_administrador', 'administrativo',
--    'financeiro', 'criativo')
-- mas o cÃ³digo usa tambÃ©m 'procurador' e 'representante_legal',
-- causando erro 400 ao salvar representantes com essas qualificaÃ§Ãµes.
--
-- Problema 2: a view client_representatives_vw criada em 00208 nÃ£o tinha
-- GRANT SELECT para o role authenticated, podendo causar 400 no SELECT.
--
-- SoluÃ§Ã£o:
--   1. Drop da constraint gerada automaticamente + recriaÃ§Ã£o com os
--      4 valores ativos no tipo RepresentativeQualificacao do front-end.
--   2. GRANT SELECT na view para authenticated e anon.
-- ============================================================

-- â”€â”€ 1. Remove a constraint atual (nome gerado pelo Postgres) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Usa bloco DO para dropar pelo nome dinÃ¢mico sem falhar caso jÃ¡ nÃ£o exista.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.client_representatives'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%qualificacao%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.client_representatives DROP CONSTRAINT %I',
      v_constraint
    );
  END IF;
END $$;

-- â”€â”€ 2. Recria a constraint com todos os valores vÃ¡lidos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.client_representatives
  ADD CONSTRAINT client_representatives_qualificacao_check
  CHECK (qualificacao IN (
    'socio_administrador',
    'socio',
    'procurador',
    'representante_legal'
  ));

COMMENT ON COLUMN public.client_representatives.qualificacao IS
  'socio_administrador | socio | procurador | representante_legal';

-- â”€â”€ 3. GRANT na view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

GRANT SELECT ON public.client_representatives_vw TO authenticated;
GRANT SELECT ON public.client_representatives_vw TO anon;

-- â”€â”€ 4. Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('fix_qualificacao_check_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00216_clause_hierarchy.sql
-- ===========================================================
-- ============================================================
-- Migration 00216: Hierarquia de alÃ­neas em contract_clauses
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- Adiciona suporte a sub-alÃ­neas (itens), detalhes e tÃ³picos:
--   depth 0 = alÃ­nea raiz   ({{num_item}} automÃ¡tico)
--   depth 1 = sub-alÃ­nea    (1.1, 1.2â€¦)
--   depth 2 = detalhe       (1.1.1â€¦)
--   depth 3 = tÃ³pico        (1.1.1.1â€¦)
--
-- marker_type define como o prefixo do nÃ³ Ã© formatado:
--   'number' â†’ 1, 2, 3â€¦
--   'letter' â†’ a), b), c)â€¦
--   'bullet' â†’ â€¢
--   'none'   â†’ sem prefixo
-- ============================================================

-- â”€â”€ 1. Coluna parent_id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS parent_id UUID
    REFERENCES public.contract_clauses(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.contract_clauses.parent_id IS
  'NULL = alÃ­nea raiz (depth 0). Preenchido = filho de outra alÃ­nea.';

-- â”€â”€ 2. Coluna depth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS depth SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contract_clauses'::regclass
      AND conname   = 'contract_clauses_depth_check'
  ) THEN
    ALTER TABLE public.contract_clauses
      ADD CONSTRAINT contract_clauses_depth_check
      CHECK (depth BETWEEN 0 AND 3);
  END IF;
END $$;

COMMENT ON COLUMN public.contract_clauses.depth IS
  '0=alÃ­nea raiz | 1=sub-alÃ­nea (item) | 2=detalhe | 3=tÃ³pico';

-- â”€â”€ 3. Coluna marker_type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS marker_type TEXT NOT NULL DEFAULT 'number';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contract_clauses'::regclass
      AND conname   = 'contract_clauses_marker_type_check'
  ) THEN
    ALTER TABLE public.contract_clauses
      ADD CONSTRAINT contract_clauses_marker_type_check
      CHECK (marker_type IN ('number', 'letter', 'bullet', 'none'));
  END IF;
END $$;

COMMENT ON COLUMN public.contract_clauses.marker_type IS
  'number=1.1 | letter=a) | bullet=â€¢ | none=sem prefixo';

-- â”€â”€ 4. Ãndice para busca eficiente de filhos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE INDEX IF NOT EXISTS idx_contract_clauses_parent
  ON public.contract_clauses(parent_id, display_order)
  WHERE parent_id IS NOT NULL;

-- â”€â”€ 5. Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('clause_hierarchy_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00217_contract_guarantees.sql
-- ===========================================================
-- ============================================================
-- Migration 00217: Garantias de contrato baseadas em KPIs
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- 1. Tabela contract_guarantees â€” uma por KPI vinculada ao contrato
-- 2. Coluna has_guarantees em contracts_v2 â€” flag para condition_type
-- ============================================================

-- â”€â”€ 1. Tabela contract_guarantees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE TABLE IF NOT EXISTS public.contract_guarantees (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID        NOT NULL REFERENCES public.contracts_v2(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- KPI vinculada (existente ou criada no momento da garantia)
  kpi_id           UUID        REFERENCES public.client_kpis(id) ON DELETE SET NULL,
  -- Nome da KPI (snapshot â€” preservado mesmo se kpi_id for removido)
  kpi_name         TEXT        NOT NULL,
  -- Unidade da KPI (snapshot): currency | percentage | number
  kpi_unit         TEXT        NOT NULL DEFAULT 'number'
    CHECK (kpi_unit IN ('currency', 'percentage', 'number')),

  -- Meta de crescimento percentual comprometida no contrato
  growth_percent   NUMERIC(6,2) NOT NULL,          -- ex: 30.00 = 30%

  -- Valor de referÃªncia inicial (base para calcular o crescimento)
  -- NULL = serÃ¡ definido com base no valor atual da KPI no inÃ­cio do contrato
  base_value       NUMERIC(18,2),

  -- Prazo final para atingir a meta (data ISO)
  deadline         DATE        NOT NULL,

  -- Notas internas (nÃ£o aparecem no contrato)
  notes            TEXT,

  display_order    INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_contract
  ON public.contract_guarantees(contract_id, display_order);

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_kpi
  ON public.contract_guarantees(kpi_id)
  WHERE kpi_id IS NOT NULL;

ALTER TABLE public.contract_guarantees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_guarantees_org ON public.contract_guarantees;
CREATE POLICY contract_guarantees_org ON public.contract_guarantees
  FOR ALL USING (organization_id = get_user_organization_id());

DROP TRIGGER IF EXISTS update_contract_guarantees_updated ON public.contract_guarantees;
CREATE TRIGGER update_contract_guarantees_updated
  BEFORE UPDATE ON public.contract_guarantees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.contract_guarantees IS
  'Garantias de resultado comprometidas no contrato, cada uma vinculada a
   uma KPI do cliente com meta percentual de crescimento e prazo.';

COMMENT ON COLUMN public.contract_guarantees.growth_percent IS
  'Percentual de crescimento comprometido. Ex: 30 = crescimento de 30% sobre base_value.';

COMMENT ON COLUMN public.contract_guarantees.base_value IS
  'Valor de referÃªncia inicial da KPI. NULL = serÃ¡ determinado no inÃ­cio da vigÃªncia.';

COMMENT ON COLUMN public.contract_guarantees.deadline IS
  'Data limite para atingir a meta. Usada na clÃ¡usula de garantia do contrato.';

-- â”€â”€ 2. Flag has_guarantees em contracts_v2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Coluna derivada: atualizada por trigger ao inserir/remover garantias.
-- Permite uso como condition_type no sistema de clÃ¡usulas condicionais.

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS has_guarantees BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contracts_v2.has_guarantees IS
  'true quando o contrato possui ao menos uma garantia cadastrada.
   Usado pelo condition_type ''has_guarantees'' nas clÃ¡usulas condicionais.';

-- â”€â”€ 3. Trigger: mantÃ©m has_guarantees sincronizado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION public.sync_contract_has_guarantees()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contracts_v2
      SET has_guarantees = true
      WHERE id = NEW.contract_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.contracts_v2
      SET has_guarantees = EXISTS (
        SELECT 1 FROM public.contract_guarantees
        WHERE contract_id = OLD.contract_id
      )
      WHERE id = OLD.contract_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contract_has_guarantees ON public.contract_guarantees;
CREATE TRIGGER trg_sync_contract_has_guarantees
  AFTER INSERT OR DELETE ON public.contract_guarantees
  FOR EACH ROW EXECUTE FUNCTION public.sync_contract_has_guarantees();

-- â”€â”€ 4. Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('contract_guarantees_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00218_clause_condition_negate.sql
-- ===========================================================
-- ============================================================
-- Migration 00218: InversÃ£o de condiÃ§Ã£o em contract_clauses
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- Adiciona condition_negate BOOLEAN:
--   false (default) â†’ inclui a alÃ­nea quando a condiÃ§Ã£o Ã© VERDADEIRA
--   true            â†’ inclui a alÃ­nea quando a condiÃ§Ã£o Ã© FALSA
--                     (equivalente a "ocultar quando condiÃ§Ã£o for verdadeira")
--
-- Exemplo: condition_type='has_guarantees' + condition_negate=true
--   â†’ inclui a alÃ­nea apenas quando NÃƒO hÃ¡ garantias no contrato.
-- ============================================================

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS condition_negate BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contract_clauses.condition_negate IS
  'false = inclui quando condiÃ§Ã£o Ã© verdadeira (padrÃ£o).
   true  = inclui quando condiÃ§Ã£o Ã© falsa (ocultar quando verdadeiro).';

-- â”€â”€ Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('clause_condition_negate_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00220_rollback_signature_block_witnesses.sql
-- ===========================================================
-- ============================================================
-- Migration 00220: Rollback da 00219 â€” bloco de testemunhas
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- Desfaz as alteraÃ§Ãµes da 00219:
--   1. Remove o bloco bloco_testemunhas inserido
--   2. Restaura o html_content original do bloco_assinaturas
--      (com TESTEMUNHAS integradas, layout em sig-table com colunas)
-- ============================================================

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- 1. Remove o bloco de testemunhas criado pela 00219
    DELETE FROM public.contract_signature_blocks
    WHERE organization_id = org.id
      AND slug = 'bloco_testemunhas';

    -- 2. Restaura o bloco_assinaturas original com TESTEMUNHAS integradas
    --    SÃ³ atualiza se o conteÃºdo atual nÃ£o tiver TESTEMUNHAS
    --    (ou seja, foi modificado pela 00219)
    UPDATE public.contract_signature_blocks
    SET html_content = $A$<table class="sig-table" style="width:100%;margin-top:36pt">
  <tbody>
    <tr>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:bottom">
        <p class="sig-line">&nbsp;</p>
        <p><strong>CONTRATADA</strong></p>
        <p><strong>AGÃŠNCIA C8 LTDA</strong></p>
        <p>TarcÃ­sio Pereira da Silva Brito</p>
        <p>SÃ³cio-Administrador</p>
      </td>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:bottom">
        <p class="sig-line">&nbsp;</p>
        <p><strong>CONTRATANTE</strong></p>
        <p><strong>{{contratante_razao_social}}</strong></p>
        <p>{{representante_nome}}</p>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding-top:24pt">
        <p style="text-align:center"><strong>TESTEMUNHAS</strong></p>
      </td>
    </tr>
    <tr>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:bottom">
        <p class="sig-line">&nbsp;</p>
        <p>Nome:</p>
        <p>CPF:</p>
      </td>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:bottom">
        <p class="sig-line">&nbsp;</p>
        <p>Nome:</p>
        <p>CPF:</p>
      </td>
    </tr>
  </tbody>
</table>$A$
    WHERE organization_id = org.id
      AND slug = 'bloco_assinaturas'
      AND html_content NOT LIKE '%TESTEMUNHAS%';

  END LOOP;
END $$;

-- Remove registro da 00219 do histÃ³rico de migrations
DELETE FROM public.schema_migrations
WHERE version = 'signature_block_witnesses_v1';

-- â”€â”€ Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('rollback_signature_block_witnesses_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00221_template_dynamic_signatures.sql
-- ===========================================================
-- ============================================================
-- Migration 00221: Atualiza templates para usar {{bloco_assinaturas}} dinÃ¢mico
-- Banco A (Maestr.ia) â€” Totalmente idempotente
--
-- O bloco de assinaturas agora Ã© gerado dinamicamente pelo ContractGenerator
-- com base nos representantes reais do contratante. Isso elimina as variÃ¡veis
-- fixas {{representante_2_nome}} etc. que deixavam linhas vazias quando nÃ£o
-- havia representante cadastrado.
--
-- Esta migration substitui qualquer bloco de assinatura estÃ¡tico nas
-- estruturas dos templates (campo structure->signature_block) pelo
-- marcador {{bloco_assinaturas}}, que Ã© resolvido dinamicamente.
-- ============================================================

-- Atualiza o signature_block da estrutura dos templates que ainda usam
-- variÃ¡veis fixas de representante (nÃ£o usa {{bloco_assinaturas}})
UPDATE public.contract_templates
SET structure = jsonb_set(
  structure,
  '{signature_block}',
  to_jsonb($$<div style="margin-top:28pt">{{bloco_assinaturas}}</div>$$::text)
)
WHERE structure IS NOT NULL
  AND (structure->>'signature_block') IS NOT NULL
  AND (structure->>'signature_block') NOT LIKE '%bloco_assinaturas%';

-- â”€â”€ Schema migrations version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

INSERT INTO public.schema_migrations (version)
VALUES ('template_dynamic_signatures_v1')
ON CONFLICT (version) DO NOTHING;


-- ===========================================================
-- ARQUIVO: 00222_leads_etapa_contato_realizado.sql
-- ===========================================================
-- =============================================================================
-- Migration 00222: Nova etapa 'contato_realizado' no kanban de leads
-- PosiÃ§Ã£o no funil: leads_recebidos â†’ qualificados â†’ contato_realizado â†’ reuniao_agendada
--
-- A coluna etapa_kanban Ã© VARCHAR(100) sem CHECK constraint, portanto nenhuma
-- alteraÃ§Ã£o de DDL Ã© necessÃ¡ria â€” o novo valor jÃ¡ Ã© aceito pelo banco.
--
-- Esta migration:
--   1. Documenta a nova etapa nos comentÃ¡rios
--   2. Atualiza o label no lead_stage_history para exibiÃ§Ã£o (nenhuma linha
--      existente precisa ser alterada â€” valores histÃ³ricos continuam vÃ¡lidos)
--   3. Garante que o Ã­ndice idx_leads_etapa_kanban cubra o novo valor
--      (jÃ¡ existe e cobre todos os valores de VARCHAR)
-- =============================================================================

-- Nenhum DDL necessÃ¡rio: etapa_kanban Ã© VARCHAR(100) sem CHECK constraint.
-- O valor 'contato_realizado' Ã© aceito automaticamente.

-- ComentÃ¡rio de documentaÃ§Ã£o na coluna
COMMENT ON COLUMN public.leads.etapa_kanban IS
  'Etapas vÃ¡lidas: leads_recebidos, qualificados, contato_realizado, reuniao_agendada, emissao_contrato, efetivados, desqualificado, reuniao_sem_sucesso';


-- ===========================================================
-- ARQUIVO: 00223_lead_ads_level_conta_nao_encontrada.sql
-- ===========================================================
-- =============================================================================
-- Migration 00223: Adiciona 'conta_nao_encontrada' ao enum lead_ads_level
-- O enum lead_ads_level existe no banco mas nÃ£o havia migration local para ele.
-- ALTER TYPE ADD VALUE Ã© irreversÃ­vel e idempotente via bloco DO.
-- =============================================================================

DO $$
BEGIN
  -- Adiciona o valor somente se ainda nÃ£o existir
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'lead_ads_level'
      AND e.enumlabel = 'conta_nao_encontrada'
  ) THEN
    ALTER TYPE lead_ads_level ADD VALUE 'conta_nao_encontrada';
  END IF;
END $$;


