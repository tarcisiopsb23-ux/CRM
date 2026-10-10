-- ============================================================
-- Migration 00216: Hierarquia de alíneas em contract_clauses
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- Adiciona suporte a sub-alíneas (itens), detalhes e tópicos:
--   depth 0 = alínea raiz   ({{num_item}} automático)
--   depth 1 = sub-alínea    (1.1, 1.2…)
--   depth 2 = detalhe       (1.1.1…)
--   depth 3 = tópico        (1.1.1.1…)
--
-- marker_type define como o prefixo do nó é formatado:
--   'number' → 1, 2, 3…
--   'letter' → a), b), c)…
--   'bullet' → •
--   'none'   → sem prefixo
-- ============================================================

-- ── 1. Coluna parent_id ──────────────────────────────────────────────────────

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS parent_id UUID
    REFERENCES public.contract_clauses(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.contract_clauses.parent_id IS
  'NULL = alínea raiz (depth 0). Preenchido = filho de outra alínea.';

-- ── 2. Coluna depth ──────────────────────────────────────────────────────────

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
  '0=alínea raiz | 1=sub-alínea (item) | 2=detalhe | 3=tópico';

-- ── 3. Coluna marker_type ─────────────────────────────────────────────────────

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
  'number=1.1 | letter=a) | bullet=• | none=sem prefixo';

-- ── 4. Índice para busca eficiente de filhos ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contract_clauses_parent
  ON public.contract_clauses(parent_id, display_order)
  WHERE parent_id IS NOT NULL;

-- ── 5. Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('clause_hierarchy_v1')
ON CONFLICT (version) DO NOTHING;
