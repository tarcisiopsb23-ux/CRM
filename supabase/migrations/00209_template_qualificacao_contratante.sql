-- ============================================================
-- Migration 00209: Atualiza parties_block do template padrão
--                  para usar {{qualificacao_contratante}}
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- Substitui o bloco fixo de qualificação do contratante
-- (que tinha CNPJ hardcoded e representante fixo) pela variável
-- dinâmica {{qualificacao_contratante}}, resolvida em tempo de
-- montagem por buildQualificacaoContratante() conforme PF/PJ,
-- representantes legais e procuradores.
--
-- O html_content dos templates é re-gerado por DO $$ ... $$
-- apenas se ainda contiver o padrão antigo (idempotente).
-- ============================================================

-- ── 1. Atualiza html_content dos templates que usam o padrão antigo ───────────

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
    -- Substitui o parágrafo fixo do contratante pela variável dinâmica.
    -- O padrão regex cobre variações com ou sem atributos inline de estilo.
    UPDATE public.contract_templates
    SET html_content = regexp_replace(
      html_content,
      -- Captura o <p> inteiro que começa com {{contratante_razao_social}}
      -- e vai até o </p> (incluindo newlines via flag 's' não disponível
      -- no Postgres — usamos [^<]* para cobrir o padrão típico)
      '<p>\s*\{\{contratante_razao_social\}\}[^<]*inscrita[^<]*CNPJ[^<]*\{\{contratante_cnpj\}\}[^<]*\{\{representante_nome\}\}[^<]*</p>',
      '<p>{{qualificacao_contratante}}</p>',
      'g'
    )
    WHERE id = tpl.id;
  END LOOP;
END $$;

-- ── 2. Abordagem complementar: substitui via replace() simples ────────────────
-- Caso o regexp acima não encontre variações do padrão (ex: formatação diferente),
-- usa replace direto na linha exata gerada pela migration 00204.

UPDATE public.contract_templates
SET html_content = replace(
  html_content,
  -- Linha exata semeada em 00204
  '  <p>{{contratante_razao_social}}, inscrita sob o CNPJ n° {{contratante_cnpj}}, com sede na {{contratante_endereco}}, neste ato representada por {{representante_nome}}, inscrito no CPF nº {{representante_cpf}}, doravante denominado <strong>CONTRATANTE</strong>.</p>',
  '  <p>{{qualificacao_contratante}}</p>'
)
WHERE html_content LIKE '%{{contratante_razao_social}}%'
  AND html_content LIKE '%{{representante_nome}}%'
  AND html_content NOT LIKE '%{{qualificacao_contratante}}%';

-- ── 3. Template padrão: garante que organizations sem template
--      recebam o novo modelo quando provisionadas ─────────────────────────────
--
-- O seed do template padrão (migration 00204) é re-executado apenas para
-- orgs que ainda não têm nenhum template. O novo html do template padrão
-- já usa {{qualificacao_contratante}} desde esta migration.
--
-- Referência: o seed completo está em 00204 — aqui apenas corrigimos o
-- parties_block para novas orgs provisionadas após esta migration, via
-- atualização do valor default usado no seed helper.

-- ── 4. Compatibilidade retrógrada ─────────────────────────────────────────────
-- As variáveis antigas ({{representante_nome}}, {{representante_cpf}},
-- {{contratante_razao_social}}, {{contratante_cnpj}}, {{contratante_endereco}})
-- PERMANECEM no varMap de assembleContract.ts para não quebrar templates
-- personalizados que ainda as usem diretamente.

-- ── 5. Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('template_qualificacao_contratante_v1')
ON CONFLICT (version) DO NOTHING;
