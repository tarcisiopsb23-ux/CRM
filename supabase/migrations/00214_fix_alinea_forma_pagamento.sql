-- ============================================================
-- Migration 00214: Corrige alíneas de forma de pagamento
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- 1. Insere (ou atualiza) a alínea de forma de pagamento recorrente
--    na categoria 'remuneracao' usando variáveis dinâmicas em vez
--    de valores hardcoded (CNPJ, data, dia).
-- 2. Atualiza alíneas existentes que contenham o CNPJ da Agência C8
--    hardcoded no html_content (resquícios de dados digitados
--    manualmente no editor antes desta correção).
-- ============================================================

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- ── Inserção da alínea padrão de forma de pagamento ─────────────────────
    -- Usa condition_type = 'always' → aparece em todo contrato.
    -- Variáveis resolvidas em tempo de montagem:
    --   {{forma_pagamento}}  → label da forma recorrente (ex: PIX)
    --   {{vencimento}}       → data do 1º pagamento formatada
    --   {{dia_vencimento}}   → dia do mês recorrente (ex: 20)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, true, true,
      'Forma de pagamento',
      $A$<p>Os pagamentos serão realizados exclusivamente via <strong>{{forma_pagamento}}</strong>, vencendo-se a primeira parcela em <strong>{{vencimento}}</strong> e as demais no dia <strong>{{dia_vencimento}}</strong> de cada mês, sendo a adimplência condição indispensável para a continuidade da prestação dos serviços.</p>$A$,
      25,   -- entre multa (20) e taxa de implantação (30)
      'always'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Forma de pagamento'
    );

    -- ── Corrige alíneas existentes com dados hardcoded ───────────────────────
    -- Substitui qualquer alínea de remuneração que contenha o CNPJ da
    -- Agência C8 hardcoded (62.659.676/0001-49) pelo template com variáveis.
    -- Também cobre variações com o nome "Agência C8 LTDA".
    UPDATE public.contract_clauses
    SET
      html_content = $A$<p>Os pagamentos serão realizados exclusivamente via <strong>{{forma_pagamento}}</strong>, vencendo-se a primeira parcela em <strong>{{vencimento}}</strong> e as demais no dia <strong>{{dia_vencimento}}</strong> de cada mês, sendo a adimplência condição indispensável para a continuidade da prestação dos serviços.</p>$A$,
      condition_type = 'always',
      is_fixed = true,
      service_slug = NULL
    WHERE organization_id = org.id
      AND category_key = 'remuneracao'
      AND (
        html_content LIKE '%62.659.676/0001-49%'
        OR html_content LIKE '%Agência C8 LTDA%'
        OR html_content LIKE '%AgÃªncia C8%'   -- encoding alternativo
      );

  END LOOP;
END $$;

-- ── Schema migrations version ─────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('fix_alinea_forma_pagamento_v1')
ON CONFLICT (version) DO NOTHING;
