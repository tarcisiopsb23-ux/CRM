-- ============================================================
-- Migration 00202: Seed dos blocos de serviço e template base
-- Banco A (Maestr.ia)
--
-- Cria os blocos padrão para cada tipo de serviço baseados nos
-- contratos reais da Agência C8. Usados como ponto de partida
-- editável no módulo de Configurações → Contratos.
--
-- IMPORTANTE: Insere apenas se não existirem (idempotente).
-- As variáveis usam o formato {{variavel}}.
-- ============================================================

-- ── Função helper para seed idempotente ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_contract_block(
  p_org_id    UUID,
  p_slug      TEXT,
  p_name      TEXT,
  p_desc      TEXT,
  p_html      TEXT,
  p_has_setup         BOOLEAN,
  p_setup_amount      NUMERIC,
  p_has_monthly       BOOLEAN,
  p_monthly_amount    NUMERIC,
  p_grace_months      INTEGER,
  p_is_one_time       BOOLEAN,
  p_one_time_amount   NUMERIC,
  p_order     INTEGER
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.contract_service_blocks (
    organization_id, slug, name, description, html_content,
    has_setup, setup_amount, has_monthly, monthly_amount,
    grace_months, is_one_time, one_time_amount, display_order
  ) VALUES (
    p_org_id, p_slug, p_name, p_desc, p_html,
    p_has_setup, p_setup_amount, p_has_monthly, p_monthly_amount,
    p_grace_months, p_is_one_time, p_one_time_amount, p_order
  )
  ON CONFLICT (organization_id, slug) DO NOTHING;
END; $$;

-- ── Template base do contrato ─────────────────────────────────────────────────
-- Cláusulas comuns a todos os contratos. Os blocos de serviço são
-- inseridos onde aparece {{blocos_servico}}.
-- O cronograma é inserido onde aparece {{cronograma_pagamento}}.

DO $$
DECLARE
  org RECORD;
  base_html TEXT;
BEGIN
  base_html := $HTML$
<div class="contract-document">

<div class="contract-header-space"></div>

<h1 class="contract-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>

<section class="contract-parties">
  <p><strong>CONTRATANTE:</strong></p>
  <p>{{contratante_razao_social}}, inscrita sob o CNPJ n° {{contratante_cnpj}}, com sede na {{contratante_endereco}}, neste ato representada por {{representante_nome}}, inscrito no CPF nº {{representante_cpf}}, doravante denominado <strong>CONTRATANTE</strong>.</p>

  <p style="margin-top:16px"><strong>CONTRATADA:</strong></p>
  <p>Agência C8 LTDA, inscrita sob o CNPJ n° 62.659.676/0001-49, com sede na Rua Ademir Pereira de Jesus, 46 Apto 102, Matinha, Teófilo Otoni (MG), neste ato representada por seu sócio-administrador Tarcísio Pereira da Silva Brito, inscrito no CPF nº 089.712.156-23, doravante denominada <strong>CONTRATADA</strong>.</p>

  <p style="margin-top:16px">As partes acima qualificadas firmam o presente contrato de prestação de serviços regulamentado pelas seguintes cláusulas e condições:</p>
</section>

<section class="contract-clause">
  <h2>Cláusula 1ª — OBJETO</h2>
  <p>1.1. O presente contrato contempla a prestação dos seguintes serviços:</p>
  <p>{{lista_servicos}}</p>
</section>

{{blocos_servico}}

<section class="contract-clause">
  <h2>Cláusula {{num_remuneracao}}ª — REMUNERAÇÃO E FORMA DE PAGAMENTO</h2>
  {{cronograma_pagamento}}
  <p>{{clausula_multa_atraso}}</p>
  <p>{{clausula_suspensao_inadimplencia}}</p>
</section>

<section class="contract-clause">
  <h2>Cláusula {{num_sigilo}}ª — SIGILO E CONFIDENCIALIDADE</h2>
  <p>{{num_sigilo}}.1 As partes se obrigam a manter em sigilo as informações confidenciais relativas ao negócio, políticas, segredos comerciais, organização, criação e demais informações envolvendo a execução deste contrato.</p>
  <p>{{num_sigilo}}.2 Para efeito deste instrumento, considera-se como "informação confidencial" toda informação escrita ou verbal que revelada à outra parte contenha a expressão "confidencial" e que por sua natureza não deva ser de conhecimento público.</p>
  <p>{{num_sigilo}}.3 Em caso de dúvida acerca da confidencialidade de determinada informação, as partes deverão tratá-la como confidencial até que seja autorizado por escrito a tratá-la de maneira diferente.</p>
  <p>{{num_sigilo}}.4 A violação a este compromisso de confidencialidade obrigará a parte infratora ao pagamento de perdas e danos, inclusive extrapatrimoniais.</p>
</section>

<section class="contract-clause">
  <h2>Cláusula {{num_responsabilidade}}ª — RESPONSABILIDADE CIVIL</h2>
  <p>{{num_responsabilidade}}.1 As partes reconhecem expressamente não haver qualquer vínculo societário ou empregatício entre as partes contratantes, seus representantes legais, prepostos, empregados, empregados de empresas subcontratadas ou terceiros utilizados no cumprimento das obrigações contratadas à outra parte, responsabilizando-se cada uma das partes por todas as obrigações fiscais, legais, trabalhistas e civis.</p>
  <p>{{num_responsabilidade}}.2 Igualmente, cada parte responderá exclusivamente pelos atos ou omissões praticadas pelos profissionais que contratar, de sorte que não há para a outra parte nenhuma responsabilidade por eventual imprudência, negligência, imperícia ou danos que venham a ser cometidos, inclusive a terceiros.</p>
  <p>{{num_responsabilidade}}.3 Caso uma das partes venha a ser autuada, notificada, intimada ou condenada em razão do não cumprimento de qualquer obrigação prevista neste contrato como de responsabilidade da outra parte, a parte responsável obriga-se a ressarcir a outra de todas as despesas necessárias à realização de sua defesa, incluindo honorários advocatícios, custas e taxas judiciais e administrativas.</p>
</section>

<section class="contract-clause">
  <h2>Cláusula {{num_rescisao}}ª — RESCISÃO</h2>
  {{clausula_rescisao}}
  <p>{{num_rescisao}}.{{sub_rescisao_notificacao}} Todas as notificações previstas nesta cláusula deverão ser realizadas por escrito, mediante e-mail com confirmação de leitura ou carta registrada com aviso de recebimento.</p>
</section>

<section class="contract-clause">
  <h2>Cláusula {{num_disposicoes}}ª — DISPOSIÇÕES GERAIS</h2>
  <p>{{num_disposicoes}}.1 Este contrato não implica em qualquer associação ou compromisso societário entre as partes, que são responsáveis por suas respectivas responsabilidades civis, criminais, trabalhistas, previdenciárias e tributárias.</p>
  <p>{{num_disposicoes}}.2 O não exercício pelas partes de qualquer direito que lhes assegure este contrato ou lei, assim como sua tolerância quanto a eventuais infrações, não implicará reconhecimento de renúncia a qualquer direito, nem novação ou modificação deste contrato.</p>
  <p>{{num_disposicoes}}.3 O contrato será assinado em plataforma digital indicada pela CONTRATADA. As partes reconhecem e declaram que as assinaturas eletrônicas realizadas por meio do serviço Autentique (https://www.autentique.com.br/) ou Gov.br (https://www.gov.br/) são, para os fins do Art. 4°, II, da Lei n. 14.063/2020, plenamente vinculantes e eficazes, constituindo título executivo extrajudicial.</p>
  <p>{{num_disposicoes}}.4 As alterações nos termos deste instrumento somente terão validade se realizadas por aditivo contratual.</p>
  <p>{{num_disposicoes}}.5 As partes atribuem ao instrumento caráter irrevogável e irretratável, ao qual é atribuída força executiva extrajudicial.</p>
  <p>{{num_disposicoes}}.6 O presente contrato é regido pelas leis da República Federativa do Brasil.</p>
  <p>{{num_disposicoes}}.7 As partes elegem o foro da Comarca de {{foro_cidade}} para dirimir quaisquer questões oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
</section>

<section class="contract-signatures">
  <p>Estando justos e contratados, as partes assinam o presente contrato para que surtam todos os devidos e legais efeitos.</p>
  <p>{{cidade_estado}}, {{data_assinatura}}.</p>

  <div class="signature-block">
    <div class="signature-line">
      <p>_______________________________________________</p>
      <p><strong>CONTRATADA: AGÊNCIA C8 LTDA</strong></p>
    </div>
    <div class="signature-line">
      <p>_______________________________________________</p>
      <p><strong>CONTRATANTE: {{contratante_razao_social}}</strong></p>
    </div>
  </div>

  <div class="witnesses-block">
    <p><strong>TESTEMUNHAS:</strong></p>
    <div class="signature-line">
      <p>____________________________________</p>
      <p>Nome</p>
    </div>
    <div class="signature-line">
      <p>____________________________________</p>
      <p>Nome</p>
    </div>
  </div>
</section>

<div class="contract-footer-space"></div>

</div>
$HTML$;

  -- Insere template base para cada organização ativa
  FOR org IN SELECT id FROM public.organizations LOOP
    INSERT INTO public.contract_templates (
      organization_id, name, description, html_content, is_default
    ) VALUES (
      org.id,
      'Template Padrão',
      'Template base com cláusulas comuns a todos os contratos',
      base_html,
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ── Blocos de serviço para cada organização ───────────────────────────────────

DO $$
DECLARE org RECORD;
BEGIN
FOR org IN SELECT id FROM public.organizations LOOP

-- ── BLOCO 1: Agente de IA ────────────────────────────────────────────────────
PERFORM public.seed_contract_block(
  org.id, 'agente_ia', 'Implementação de Agente de IA',
  'Serviço de implantação e manutenção de agentes virtuais de atendimento.',
  $BLOCK$
<section class="contract-clause service-block" data-slug="agente_ia">
  <h2>Cláusula {{num}}ª — OBJETO — AGENTE DE IA</h2>
  <p>{{num}}.1 O presente contrato contempla o projeto para a implementação e/ou aperfeiçoamento de agentes virtuais de atendimento, conforme especificações técnicas, funcionais e entregáveis estipulados no Briefing e Levantamento de Requisitos acordado entre as partes.</p>
  <p>{{num}}.2 O projeto será executado em etapas sucessivas:</p>
  <ul>
    <li><strong>Etapa 1 — Estruturação e Base de Conhecimento (Curadoria):</strong> Análise do briefing, organização dos dados e configuração da base de conhecimento (RAG). Prazo estimado: até 10 (dez) dias úteis após o recebimento de toda a documentação necessária.</li>
    <li><strong>Etapa 2 — Desenvolvimento e Integração (Build):</strong> Execução técnica dos fluxos de automação, configuração de prompts, integração com APIs e estruturação da lógica de atendimento. Prazo estimado: até 15 (quinze) dias úteis após a conclusão da Etapa 1.</li>
    <li><strong>Etapa 3 — Homologação e Ajustes Finos (Beta):</strong> Disponibilização em ambiente de teste para validação. Prazo estimado: até 5 (cinco) dias úteis.</li>
    <li><strong>Etapa 4 — Implantação e Go-Live:</strong> Publicação em ambiente de produção e monitoramento inicial. Prazo estimado: imediato após aprovação da Etapa 3.</li>
  </ul>
  <p>{{num}}.3 A vigência do presente serviço divide-se em duas fases:</p>
  <ul>
    <li><strong>Fase I (Implementação):</strong> Inicia-se na data de assinatura e encerra-se com a entrega técnica, formalizada pela assinatura do Termo de Conclusão.</li>
    <li><strong>Fase II (Manutenção e Administração):</strong> Inicia-se automaticamente no dia útil seguinte à conclusão da Fase I, por prazo indeterminado.</li>
  </ul>
  <p>{{num}}.4 A CONTRATANTE é responsável pelo pagamento direto e integral de todas as assinaturas, licenças, créditos de APIs, servidores e ferramentas de terceiros necessárias (ex: OpenAI, n8n, serviços de nuvem). A CONTRATADA não se responsabiliza por interrupções decorrentes de falta de pagamento ou falhas técnicas nessas plataformas.</p>
  <p>{{num}}.5 A CONTRATADA se declara disponível diariamente para esclarecimento de dúvidas e atualização sobre o andamento do projeto, utilizando como canal principal o WhatsApp.</p>
</section>
$BLOCK$,
  true, 2500.00, true, 500.00, 2, false, null, 1
);

-- ── BLOCO 2: Assessoria de Performance ──────────────────────────────────────
PERFORM public.seed_contract_block(
  org.id, 'assessoria', 'Assessoria de Performance e Estratégia de Vendas',
  'Assessoria estratégica e executiva de marketing e vendas.',
  $BLOCK$
<section class="contract-clause service-block" data-slug="assessoria">
  <h2>Cláusula {{num}}ª — OBJETO — ASSESSORIA DE PERFORMANCE</h2>
  <p>{{num}}.1 O presente contrato tem por objeto a prestação de serviços de assessoria de performance e estratégia de vendas, focada na estruturação e otimização de processos comerciais para o crescimento sustentável e contínuo da CONTRATANTE.</p>
  <p>{{num}}.2 O prazo de vigência do presente serviço será de {{prazo_vigencia_meses}} ({{prazo_vigencia_extenso}}) meses, contados da data de início, podendo ser prorrogado por prazo igual ou superior mediante aditivo contratual.</p>
  <p>{{num}}.3 Os serviços no formato <strong>consultivo</strong> compreendem: Estratégia de Aquisição (Tráfego Pago), Arquitetura de Conversão, Planejamento de Conteúdo e Autoridade, Estruturação de Funis e CRM, Inteligência de Dados (BI) e Gestão de SEO e Presença Orgânica.</p>
  <p>{{num}}.4 Os serviços no formato <strong>executivo</strong> compreendem: Implementação de IA e Automação, Gestão de Performance (Tráfego Pago), Gestão de Tráfego Orgânico e SEO, Gestão de Perfis Comerciais e Social Media, Desenvolvimento de Landing Pages, Design Gráfico e Peças Publicitárias, Copywriting Estratégico e Business Intelligence.</p>
  <p>{{num}}.5 O cronograma para a realização dos serviços seguirá as etapas: Integração (2 dias úteis), Planejamento (7 dias úteis), Apresentação (8 dias úteis) e Sprints semanais de acompanhamento.</p>
  <p>{{num}}.6 As obrigações assumidas pela CONTRATADA são de <strong>meio e não de resultado</strong>, não havendo garantia de faturamento, lucro, número de vendas, geração de leads ou qualquer outro resultado específico.</p>
  <p>{{num}}.7 A verba destinada à veiculação de anúncios (Meta, Google Ads, etc.), bem como os custos de infraestrutura tecnológica, serão pagos diretamente pela CONTRATANTE aos respectivos fornecedores.</p>
  <p>{{num}}.8 A CONTRATANTE poderá rescindir o serviço de assessoria mediante notificação formal com antecedência mínima de 60 (sessenta) dias da data do próximo vencimento. O descumprimento deste aviso prévio sujeitará a CONTRATANTE ao pagamento de multa equivalente a 2 (duas) mensalidades vigentes.</p>
</section>
$BLOCK$,
  true, 7000.00, true, 3000.00, 0, false, null, 2
);

-- ── BLOCO 3: Consultoria ─────────────────────────────────────────────────────
PERFORM public.seed_contract_block(
  org.id, 'consultoria', 'Consultoria de Performance e Estratégia de Vendas',
  'Diagnóstico, mapeamento e planejamento estratégico de vendas.',
  $BLOCK$
<section class="contract-clause service-block" data-slug="consultoria">
  <h2>Cláusula {{num}}ª — OBJETO — CONSULTORIA ESTRATÉGICA</h2>
  <p>{{num}}.1 O presente contrato contempla a consultoria para implementação e/ou aperfeiçoamento de um processo de vendas através da internet, compreendendo diagnóstico, mapeamento de processos, arquitetura de vendas e entrega do planejamento estratégico.</p>
  <p>{{num}}.2 A vigência do presente serviço será de {{prazo_vigencia_dias}} ({{prazo_vigencia_extenso}}) dias, podendo ser prorrogada por prazo igual ou superior mediante Contrato Aditivo.</p>
  <p>{{num}}.3 O projeto seguirá as etapas: Integração (2 dias úteis), Planejamento (7 dias úteis), Apresentação (8 dias úteis) e Sprints semanais de acompanhamento.</p>
  <p>{{num}}.4 Os serviços consultivos compreendem: Estratégia de Aquisição (Tráfego Pago), Arquitetura de Conversão, Planejamento de Conteúdo e Autoridade, Estruturação de Funis e CRM, Inteligência de Dados e Gestão de SEO.</p>
  <p>{{num}}.5 As obrigações assumidas pela CONTRATADA são de <strong>meio e não de resultado</strong>.</p>
  <p>{{num}}.6 Em caso de rescisão antes da reunião de imersão/integração: devolução de 80% do valor pago. Após a realização da reunião de imersão: não haverá devolução de valores, uma vez que o diagnóstico do negócio já terá sido iniciado.</p>
</section>
$BLOCK$,
  true, 7000.00, false, null, 0, true, 7000.00, 3
);

-- ── BLOCO 4: Projeto Web / Site ──────────────────────────────────────────────
PERFORM public.seed_contract_block(
  org.id, 'site', 'Execução de Projeto Web',
  'Desenvolvimento de site, landing page ou sistema web.',
  $BLOCK$
<section class="contract-clause service-block" data-slug="site">
  <h2>Cláusula {{num}}ª — OBJETO — PROJETO WEB</h2>
  <p>{{num}}.1 O presente contrato tem por objeto a execução do projeto web conforme especificações técnicas, funcionais e entregáveis estipulados no Briefing e Levantamento de Requisitos acordado entre as partes.</p>
  <p>{{num}}.2 A vigência do presente contrato será de {{prazo_vigencia_dias}} ({{prazo_vigencia_extenso}}) dias corridos, encerrando-se automaticamente com a conclusão do projeto e assinatura do Termo de Conclusão.</p>
  <p>{{num}}.3 O projeto será executado nas seguintes etapas:</p>
  <ul>
    <li><strong>Desenvolvimento:</strong> Execução do projeto conforme briefing acordado. Prazo estimado: até 30 (trinta) dias após a assinatura do contrato.</li>
    <li><strong>Implantação:</strong> Publicação em ambiente de produção e testes finais. Prazo estimado: até 10 (dez) dias após a conclusão do desenvolvimento.</li>
    <li><strong>Homologação:</strong> Avaliação, validação e correções necessárias. Prazo estimado: até 5 (cinco) dias após a implantação.</li>
  </ul>
  <p>{{num}}.4 Os valores referentes à hospedagem, registro de domínio, certificado SSL, plugins premium, temas premium, ferramentas de integração, licenças de software e quaisquer outras despesas de terceiros necessárias ao funcionamento do website serão de responsabilidade exclusiva da CONTRATANTE.</p>
  <p>{{num}}.5 Em caso de rescisão durante a execução do projeto, a CONTRATADA entregará os arquivos do website em seu estado atual de desenvolvimento no prazo máximo de 7 (sete) dias corridos.</p>
  <p>{{num}}.6 Caso a CONTRATANTE solicite revisões ou inclusões após a aprovação do projeto, será cobrada taxa adicional a ser calculada conforme a nova solicitação, apresentada em aditivo contratual.</p>
</section>
$BLOCK$,
  false, null, true, 3000.00, 0, false, null, 4
);

END LOOP;
END $$;

-- Limpeza da função helper temporária
DROP FUNCTION IF EXISTS public.seed_contract_block(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, BOOLEAN, NUMERIC, INTEGER, BOOLEAN, NUMERIC, INTEGER);
