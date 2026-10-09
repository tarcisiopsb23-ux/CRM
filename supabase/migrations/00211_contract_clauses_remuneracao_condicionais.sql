-- ============================================================
-- Migration 00211: Seed de alíneas condicionais na categoria remuneração
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- NOTA: Depende da constraint corrigida em 00210/00212.
-- Requer condition_type preenchido quando service_slug é NULL e is_fixed=false.
--
-- Adiciona alíneas condicionais para:
--   • has_setup          — taxa de implantação (parcela única ou parcelada)
--   • has_setup_installments — setup parcelado (detalhamento das parcelas)
--   • has_min_duration   — prazo mínimo de permanência / fidelidade
--   • has_grace_period   — carência (isenção nos primeiros meses)
--
-- Todas na category_key = 'remuneracao', is_fixed = false.
-- Inserção idempotente via WHERE NOT EXISTS.
-- ============================================================

-- Garante constraint correta (idempotente — DROP IF EXISTS)
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

    -- ── Setup: taxa de implantação (parcela única) ──────────────────────────
    -- Condição: has_setup — contrato tem setup (valor > 0)
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Taxa de Implantação',
      $A$<p>Além da remuneração mensal, o <strong>CONTRATANTE</strong> pagará à <strong>CONTRATADA</strong> uma taxa de implantação no valor de <strong>{{valor_setup}}</strong>, correspondente à configuração inicial, onboarding e estruturação do projeto.</p>
<p>O pagamento da taxa de implantação deverá ser realizado até a data de <strong>{{vencimento_setup}}</strong>, mediante <strong>{{forma_pagamento_setup}}</strong>.</p>$A$,
      30, 'has_setup'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Taxa de Implantação'
    );

    -- ── Setup parcelado: detalhamento das parcelas ──────────────────────────
    -- Condição: has_setup_installments — setup com mais de 1 parcela
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Parcelamento da Taxa de Implantação',
      $A$<p>A taxa de implantação de <strong>{{valor_setup}}</strong> será parcelada em <strong>{{parcelas_setup}}</strong> parcelas de <strong>{{parcela_setup}}</strong> cada, com vencimento da primeira parcela em <strong>{{vencimento_setup}}</strong> e as demais nos meses subsequentes, na mesma data.</p>
<p>O não pagamento de qualquer parcela da taxa de implantação na data de vencimento implicará a incidência de multa de 2% (dois por cento) sobre o valor em atraso, acrescida de juros moratórios de 1% (um por cento) ao mês, calculados pro rata die.</p>$A$,
      35, 'has_setup_installments'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Parcelamento da Taxa de Implantação'
    );

    -- ── Prazo mínimo de permanência (fidelidade) ────────────────────────────
    -- Condição: has_min_duration — contrato com prazo mínimo definido
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Prazo Mínimo de Permanência',
      $A$<p>O presente contrato possui prazo mínimo de permanência de <strong>{{prazo_minimo_extenso}}</strong>, contado a partir da data de início da vigência (<strong>{{vigencia_inicio}}</strong>).</p>
<p>A rescisão antecipada pelo <strong>CONTRATANTE</strong> antes do término do prazo mínimo implicará o pagamento de multa rescisória equivalente ao valor das mensalidades restantes até o fim do prazo mínimo, sem prejuízo de outras penalidades previstas neste instrumento.</p>$A$,
      40, 'has_min_duration'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Prazo Mínimo de Permanência'
    );

    -- ── Carência ────────────────────────────────────────────────────────────
    -- Condição: has_grace_period — contrato com meses de carência > 0
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Período de Carência',
      $A$<p>Fica acordado entre as partes um período de carência de <strong>{{carencia_extenso}}</strong> a contar da data de início da vigência, durante o qual o <strong>CONTRATANTE</strong> ficará isento do pagamento da remuneração mensal prevista neste instrumento.</p>
<p>Após o término do período de carência, a cobrança da mensalidade terá início automaticamente, sendo o primeiro vencimento no dia <strong>{{vencimento}}</strong> do mês imediatamente seguinte ao encerramento da carência.</p>
<p>O período de carência não isenta o <strong>CONTRATANTE</strong> do pagamento da taxa de implantação, quando aplicável, nem afeta o prazo mínimo de permanência estabelecido neste contrato.</p>$A$,
      45, 'has_grace_period'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Período de Carência'
    );

    -- ── Vigência diferida (início posterior à contratação) ──────────────────
    -- Condição: has_deferred_start — vigencia_inicio diferente de start_date
    -- Útil quando o contrato é assinado mas começa a valer numa data futura
    INSERT INTO public.contract_clauses (
      organization_id, category_key, service_slug, is_fixed, is_active,
      title, html_content, display_order, condition_type
    )
    SELECT
      org.id, 'remuneracao', NULL, false, true,
      'Início de Vigência Diferido',
      $A$<p>Embora a assinatura do presente instrumento ocorra na data indicada no preâmbulo, as obrigações de prestação de serviços e a contagem dos prazos previstos neste contrato terão início apenas em <strong>{{vigencia_inicio}}</strong>, data convencionada pelas partes como início efetivo da vigência.</p>$A$,
      50, 'has_deferred_start'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contract_clauses
      WHERE organization_id = org.id
        AND category_key = 'remuneracao'
        AND title = 'Início de Vigência Diferido'
    );

  END LOOP;
END $$;

-- ── Schema migrations version ─────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('contract_clauses_remuneracao_condicionais_v1')
ON CONFLICT (version) DO NOTHING;
