-- ============================================================
-- Migration 00203: Sistema de Cláusulas Modulares
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- A tabela contract_clauses já existe (migration 060) com:
--   id, organization_id, title, content (JSONB), display_order,
--   condition_type, condition_value, is_editable, service_id,
--   created_at, updated_at
--
-- Esta migration:
--   1. Cria contract_clause_categories (global, predefinida)
--   2. Migra contract_clauses para o novo modelo:
--        - Adiciona category_key, service_slug, is_fixed, is_active
--        - Adiciona html_content (TEXT) a partir de content (JSONB)
--        - Remove colunas antigas após migração
--   3. Cria contract_clause_categories (global)
--   4. Adiciona clause_snapshot em contracts_v2
-- ============================================================

-- ── 1. Categorias de cláusulas (predefinidas, globais) ────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_clause_categories (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT    NOT NULL UNIQUE,
  label         TEXT    NOT NULL,
  placeholder   TEXT    NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.contract_clause_categories (key, label, placeholder, display_order, description)
VALUES
  ('objeto',                'Objeto',                          '{{clausula_objeto}}',                 1, 'Define o que está sendo contratado.'),
  ('obrigacoes_contratada', 'Obrigações da Contratada',        '{{clausula_obrigacoes_contratada}}',   2, 'O que a Agência C8 se compromete a entregar/fazer.'),
  ('obrigacoes_contratante','Obrigações do Contratante',       '{{clausula_obrigacoes_contratante}}',  3, 'O que o cliente se compromete a fazer/fornecer.'),
  ('remuneracao',           'Remuneração e Forma de Pagamento','{{clausula_remuneracao}}',             4, 'Valores, cronograma e condições de pagamento.'),
  ('sigilo',                'Sigilo e Confidencialidade',      '{{clausula_sigilo}}',                  5, 'Obrigações de confidencialidade entre as partes.'),
  ('responsabilidade',      'Responsabilidade Civil',          '{{clausula_responsabilidade}}',        6, 'Limites e responsabilidades civis, trabalhistas e tributárias.'),
  ('rescisao',              'Rescisão',                        '{{clausula_rescisao}}',                7, 'Condições e procedimentos de rescisão contratual.'),
  ('disposicoes',           'Disposições Gerais',              '{{clausula_disposicoes}}',             8, 'Foro, assinaturas eletrônicas, alterações e demais disposições.')
ON CONFLICT (key) DO UPDATE SET
  label         = EXCLUDED.label,
  placeholder   = EXCLUDED.placeholder,
  display_order = EXCLUDED.display_order,
  description   = EXCLUDED.description;

-- RLS: leitura e escrita para qualquer autenticado (tabela de configuração global)
ALTER TABLE public.contract_clause_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_clause_categories_read  ON public.contract_clause_categories;
DROP POLICY IF EXISTS contract_clause_categories_write ON public.contract_clause_categories;
DROP POLICY IF EXISTS contract_clause_categories_all   ON public.contract_clause_categories;

CREATE POLICY contract_clause_categories_all ON public.contract_clause_categories
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 2a. Adiciona html_content como TEXT (sem NOT NULL ainda — será preenchido abaixo)
ALTER TABLE public.contract_clauses ADD COLUMN IF NOT EXISTS html_content TEXT;

-- 2b. Converte o conteúdo existente: JSONB → TEXT
--     O JSONB pode conter {blocks:[{text:...}]} ou simplesmente ser uma string.
--     Extrai texto bruto como fallback seguro para dados legados.
UPDATE public.contract_clauses
SET html_content = CASE
  WHEN content IS NULL THEN ''
  WHEN jsonb_typeof(content) = 'string' THEN content::TEXT
  ELSE content::TEXT   -- serializa o JSONB como texto; pode ser editado depois
END
WHERE html_content IS NULL;

-- 2c. Agora pode aplicar NOT NULL com DEFAULT
ALTER TABLE public.contract_clauses ALTER COLUMN html_content SET NOT NULL;
ALTER TABLE public.contract_clauses ALTER COLUMN html_content SET DEFAULT '';

-- 2d. Adiciona colunas novas
ALTER TABLE public.contract_clauses ADD COLUMN IF NOT EXISTS category_key  TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.contract_clauses ADD COLUMN IF NOT EXISTS service_slug  TEXT;
ALTER TABLE public.contract_clauses ADD COLUMN IF NOT EXISTS is_fixed      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.contract_clauses ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT true;

-- 2e. FK de category_key → contract_clause_categories.key (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contract_clauses_category_key_fkey'
      AND table_name = 'contract_clauses'
  ) THEN
    ALTER TABLE public.contract_clauses
      ADD CONSTRAINT contract_clauses_category_key_fkey
      FOREIGN KEY (category_key)
      REFERENCES public.contract_clause_categories(key) ON DELETE CASCADE;
  END IF;
END $$;

-- 2f. Constraint: se is_fixed=false, service_slug deve estar preenchido
ALTER TABLE public.contract_clauses
  DROP CONSTRAINT IF EXISTS chk_contract_clauses_service_slug;
ALTER TABLE public.contract_clauses
  ADD CONSTRAINT chk_contract_clauses_service_slug
  CHECK (is_fixed = true OR (is_fixed = false AND service_slug IS NOT NULL));

-- 2g. Remove colunas do modelo antigo que não são mais usadas
--     (só remove se ainda existirem)
DO $$
BEGIN
  -- Antes de remover, garante que content tenha DEFAULT para não bloquear INSERTs
  -- caso esta migration seja re-executada parcialmente
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'content'
  ) THEN
    ALTER TABLE public.contract_clauses ALTER COLUMN content SET DEFAULT '{}';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'condition_type'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN condition_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'condition_value'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN condition_value;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'is_editable'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN is_editable;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'service_id'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN service_id;
  END IF;

  -- Remove "content" (JSONB) — dados já migrados para html_content acima
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'content'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN content;
  END IF;
END $$;

-- 2h. Remove política antiga de RLS e recria no padrão atual
DROP POLICY IF EXISTS "contract_clauses_select_policy" ON public.contract_clauses;
DROP POLICY IF EXISTS "contract_clauses_insert_policy" ON public.contract_clauses;
DROP POLICY IF EXISTS "contract_clauses_update_policy" ON public.contract_clauses;
DROP POLICY IF EXISTS "contract_clauses_delete_policy" ON public.contract_clauses;

ALTER TABLE public.contract_clauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_clauses_org ON public.contract_clauses;
CREATE POLICY contract_clauses_org ON public.contract_clauses
  FOR ALL USING (organization_id = get_user_organization_id());

-- 2i. Trigger updated_at
DROP TRIGGER IF EXISTS update_contract_clauses_updated ON public.contract_clauses;
CREATE TRIGGER update_contract_clauses_updated
  BEFORE UPDATE ON public.contract_clauses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2j. Índices
CREATE INDEX IF NOT EXISTS idx_contract_clauses_org_category
  ON public.contract_clauses(organization_id, category_key, is_active, display_order);

CREATE INDEX IF NOT EXISTS idx_contract_clauses_service
  ON public.contract_clauses(organization_id, service_slug)
  WHERE service_slug IS NOT NULL;

-- ── 3. Limpa registros legados incompatíveis com o novo modelo ────────────────
-- Registros com category_key vazio foram criados antes desta migration.
-- Remove para que o seed do 00204 os recrie corretamente.
DELETE FROM public.contract_clauses WHERE category_key = '';

-- ── 4. Adiciona clause_snapshot em contracts_v2 ───────────────────────────────
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS clause_snapshot JSONB;

-- ── 5. Compatibilidade: contract_service_blocks continua existindo ────────────
COMMENT ON TABLE public.contract_service_blocks IS
  'Registro dos serviços disponíveis para contratação. '
  'O conteúdo das cláusulas agora é gerenciado em contract_clauses. '
  'Este registro guarda os dados financeiros (setup, mensalidade, carência) '
  'e metadados do serviço (nome, slug, descrição).';

COMMENT ON COLUMN public.contract_service_blocks.html_content IS
  'DEPRECATED: não mais usado na montagem do contrato. '
  'As cláusulas ficam em contract_clauses vinculadas pelo service_slug.';
