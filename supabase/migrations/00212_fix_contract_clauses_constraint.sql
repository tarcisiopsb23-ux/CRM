-- ============================================================
-- Migration 00212: Corrige constraint chk_contract_clauses_service_slug
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- A constraint original (migration 00203) exigia:
--   is_fixed = true OU (is_fixed = false AND service_slug IS NOT NULL)
--
-- Isso não contempla alíneas condicionais por condition_type
-- (is_pf, is_pj, has_procurador, has_setup, etc.) que não têm
-- service_slug mas também não são fixas.
--
-- Nova regra:
--   is_fixed = true
--   OU service_slug IS NOT NULL          (condicional por serviço)
--   OU condition_type IS NOT NULL        (condicional por atributo do contrato)
-- ============================================================

-- Remove a constraint antiga e recria com a lógica corrigida
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
  'Uma alínea deve ser fixa (is_fixed=true), vinculada a um serviço
   (service_slug NOT NULL) ou condicional por atributo do contrato
   (condition_type NOT NULL). Pelo menos uma das três condições deve
   ser verdadeira.';

-- ── Ré-executa o seed da 00210 que falhou ────────────────────────────────────
-- (idempotente — WHERE NOT EXISTS garante não duplicar)

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- Capacidade de representação (is_pj)
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

    -- Capacidade civil (is_pf)
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

    -- Instrumento de procuração (has_procurador)
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

    -- ── Alíneas de remuneração (00211) ──────────────────────────────────────

    -- Taxa de Implantação (has_setup)
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

    -- Parcelamento da Taxa de Implantação (has_setup_installments)
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

    -- Prazo Mínimo de Permanência (has_min_duration)
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

    -- Período de Carência (has_grace_period)
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

    -- Início de Vigência Diferido (has_deferred_start)
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
VALUES ('fix_contract_clauses_constraint_v1')
ON CONFLICT (version) DO NOTHING;
