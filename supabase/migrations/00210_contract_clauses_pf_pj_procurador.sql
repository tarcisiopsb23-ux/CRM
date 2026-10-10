-- ============================================================
-- Migration 00210: Seed de alíneas para is_pf, is_pj, has_procurador
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- NOTA: Esta migration depende da 00212 que corrige a constraint
-- chk_contract_clauses_service_slug para aceitar condition_type
-- como alternativa ao service_slug quando is_fixed = false.
-- Se executada antes da 00212, falhará com violação de constraint.
--
-- Adiciona ao seed padrão as alíneas condicionais para:
--   • is_pj   — qualificação societária (só PJ)
--   • is_pf   — qualificação pessoal (só PF)
--   • has_procurador — cláusula de instrumento de procuração
--
-- Categoria usada: 'disposicoes' (disposições gerais)
-- As alíneas só são inseridas se ainda não existirem (idempotente).
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

    -- ── Alínea PJ: qualificação societária ─────────────────────────────────
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Capacidade de representação',
      $A$<p>O(A) signatário(a) do presente instrumento declara, sob as penas da lei, que possui plenos poderes para representar o <strong>CONTRATANTE</strong> e firmar este contrato, comprometendo-se a apresentar os documentos societários comprobatórios sempre que solicitado pela <strong>CONTRATADA</strong>.</p>$A$,
      85, 'is_pj'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Capacidade de representação'
    );

    -- ── Alínea PF: declaração de capacidade civil ───────────────────────────
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Capacidade civil',
      $A$<p>O <strong>CONTRATANTE</strong> declara ser civilmente capaz, ter plena capacidade para contratar e estar ciente de todos os termos e condições do presente instrumento.</p>$A$,
      86, 'is_pf'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Capacidade civil'
    );

    -- ── Alínea procurador: instrumento de procuração ────────────────────────
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'disposicoes', NULL, false, true,
      'Instrumento de procuração',
      $A$<p>O presente contrato é firmado por procurador devidamente constituído, cujo instrumento de procuração, com poderes expressos para este ato, integra o presente instrumento como <strong>Anexo</strong>, sendo considerado parte integrante deste contrato para todos os fins de direito.</p>
<p>O procurador declara que os poderes outorgados na procuração estão em pleno vigor na data da assinatura deste instrumento e que não ocorreu qualquer evento de revogação, extinção ou limitação dos referidos poderes.</p>$A$,
      87, 'has_procurador'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'disposicoes'
        AND title = 'Instrumento de procuração'
    );

  END LOOP;
END $$;

-- ── Schema migrations version ─────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('contract_clauses_pf_pj_procurador_v1')
ON CONFLICT (version) DO NOTHING;
