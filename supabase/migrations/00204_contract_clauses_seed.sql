-- ============================================================
-- Migration 00204: Seed das cláusulas padrão por categoria
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- Cada alínea pertence a exatamente uma categoria (cláusula).
-- A sub-numeração (1.1, 1.2…) é gerada automaticamente na
-- montagem: {{num_clausula}} = número da cláusula, e cada
-- alínea recebe o próximo sub-número dentro dela.
--
-- Cláusulas FIXAS  (is_fixed=true):  entram em todo contrato.
-- Cláusulas COND.  (is_fixed=false): entram só se o serviço
--   correspondente (service_slug) for selecionado.
-- ============================================================

-- Helper idempotente
CREATE OR REPLACE FUNCTION public.seed_contract_clause(
  p_org_id       UUID,
  p_category_key TEXT,
  p_service_slug TEXT,
  p_is_fixed     BOOLEAN,
  p_title        TEXT,
  p_html         TEXT,
  p_order        INTEGER
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.contract_clauses (
    organization_id, category_key, service_slug, is_fixed,
    title, html_content, display_order
  ) VALUES (
    p_org_id, p_category_key, p_service_slug, p_is_fixed,
    p_title, p_html, p_order
  );
END; $$;

DO $$
DECLARE
  org RECORD;
  n   INTEGER;
BEGIN
FOR org IN SELECT id FROM public.organizations LOOP

  SELECT COUNT(*) INTO n FROM public.contract_clauses
  WHERE organization_id = org.id;
  IF n > 0 THEN CONTINUE; END IF;


  -- ══════════════════════════════════════════════════════════
  -- OBJETO
  -- ══════════════════════════════════════════════════════════

  -- Fixa: lista de serviços (única alínea do Objeto — a numeração
  -- dos itens internos usa {{lista_servicos}} já formatado como <ul>)
  PERFORM public.seed_contract_clause(org.id,'objeto',NULL,true,
    'Lista de serviços contratados',
    $A$<p>O presente contrato contempla a prestação dos seguintes serviços:</p>
<p>{{lista_servicos}}</p>$A$, 10);

  -- ══════════════════════════════════════════════════════════
  -- OBRIGAÇÕES DA CONTRATADA
  -- ══════════════════════════════════════════════════════════

  -- Cond. agente_ia — escopo do projeto
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','agente_ia',false,
    'Agente IA — escopo e etapas do projeto',
    $A$<p>No âmbito da implementação do Agente de IA, a CONTRATADA executará o projeto nas seguintes etapas:</p>
<ul>
  <li><strong>Curadoria:</strong> análise do briefing e configuração da base de conhecimento — prazo de até 10 dias úteis após recebimento da documentação.</li>
  <li><strong>Build / Integração:</strong> desenvolvimento dos fluxos, integração com APIs e lógica de atendimento — até 15 dias úteis após a Curadoria.</li>
  <li><strong>Homologação:</strong> ambiente de teste para validação — até 5 dias úteis.</li>
  <li><strong>Go-Live:</strong> publicação em produção imediatamente após aprovação da Homologação.</li>
</ul>$A$, 10);

  -- Cond. agente_ia — fases de vigência
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','agente_ia',false,
    'Agente IA — fases de vigência (implementação e manutenção)',
    $A$<p>A vigência do serviço de Agente de IA divide-se em duas fases:</p>
<ul>
  <li><strong>Fase I — Implementação:</strong> da assinatura até a entrega técnica, formalizada pelo Termo de Conclusão.</li>
  <li><strong>Fase II — Manutenção e Administração:</strong> inicia automaticamente no dia útil seguinte à conclusão da Fase I, por prazo indeterminado.</li>
</ul>$A$, 20);

  -- Cond. agente_ia — disponibilidade e suporte
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','agente_ia',false,
    'Agente IA — disponibilidade e canal de comunicação',
    $A$<p>A CONTRATADA se declara disponível diariamente para esclarecimento de dúvidas e atualização sobre o andamento do projeto, utilizando como canal principal o WhatsApp.</p>$A$, 30);


  -- Cond. assessoria — serviços consultivos
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','assessoria',false,
    'Assessoria — serviços consultivos',
    $A$<p>No âmbito da Assessoria de Performance, os serviços no formato <strong>consultivo</strong> compreendem:</p>
<ul>
  <li>Estratégia de Aquisição (Tráfego Pago)</li>
  <li>Arquitetura de Conversão</li>
  <li>Planejamento de Conteúdo e Autoridade</li>
  <li>Estruturação de Funis e CRM</li>
  <li>Inteligência de Dados (BI)</li>
  <li>Gestão de SEO e Presença Orgânica</li>
</ul>$A$, 40);

  -- Cond. assessoria — serviços executivos
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','assessoria',false,
    'Assessoria — serviços executivos',
    $A$<p>Os serviços no formato <strong>executivo</strong> compreendem:</p>
<ul>
  <li>Implementação de IA e Automação</li>
  <li>Gestão de Performance (Tráfego Pago)</li>
  <li>Gestão de Tráfego Orgânico e SEO</li>
  <li>Gestão de Perfis Comerciais e Social Media</li>
  <li>Desenvolvimento de Landing Pages</li>
  <li>Design Gráfico e Peças Publicitárias</li>
  <li>Copywriting Estratégico e Business Intelligence</li>
</ul>$A$, 50);

  -- Cond. assessoria — cronograma de execução
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','assessoria',false,
    'Assessoria — cronograma de execução',
    $A$<p>O cronograma de execução seguirá as etapas: Integração (2 dias úteis), Planejamento (7 dias úteis), Apresentação (8 dias úteis) e Sprints semanais de acompanhamento.</p>$A$, 60);

  -- Cond. assessoria — obrigação de meio
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','assessoria',false,
    'Assessoria — obrigação de meio (sem garantia de resultado)',
    $A$<p>As obrigações assumidas pela CONTRATADA são de <strong>meio e não de resultado</strong>, não havendo garantia de faturamento, lucro, número de vendas, geração de leads ou qualquer outro resultado específico.</p>$A$, 70);

  -- Cond. consultoria — escopo e etapas
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','consultoria',false,
    'Consultoria — escopo estratégico',
    $A$<p>No âmbito da Consultoria Estratégica, a CONTRATADA prestará diagnóstico, mapeamento de processos, arquitetura de vendas e planejamento estratégico, compreendendo:</p>
<ul>
  <li>Estratégia de Aquisição (Tráfego Pago)</li>
  <li>Arquitetura de Conversão</li>
  <li>Planejamento de Conteúdo e Autoridade</li>
  <li>Estruturação de Funis e CRM</li>
  <li>Inteligência de Dados e Gestão de SEO</li>
</ul>$A$, 10);

  -- Cond. consultoria — cronograma de execução
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','consultoria',false,
    'Consultoria — cronograma de execução',
    $A$<p>O projeto seguirá as etapas: Integração (2 dias úteis), Planejamento (7 dias úteis), Apresentação (8 dias úteis) e Sprints semanais de acompanhamento.</p>$A$, 20);

  -- Cond. consultoria — obrigação de meio
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','consultoria',false,
    'Consultoria — obrigação de meio',
    $A$<p>As obrigações assumidas pela CONTRATADA são de <strong>meio e não de resultado</strong>.</p>$A$, 30);

  -- Cond. site — escopo e etapas
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','site',false,
    'Projeto Web — escopo e etapas',
    $A$<p>No âmbito do Projeto Web, a CONTRATADA executará o projeto conforme Briefing e Levantamento de Requisitos acordado, nas seguintes etapas:</p>
<ul>
  <li><strong>Desenvolvimento:</strong> até 30 dias após a assinatura do contrato.</li>
  <li><strong>Implantação:</strong> até 10 dias após a conclusão do desenvolvimento.</li>
  <li><strong>Homologação:</strong> até 5 dias após a implantação.</li>
</ul>$A$, 10);

  -- Cond. site — entrega em caso de rescisão durante execução
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratada','site',false,
    'Projeto Web — entrega dos arquivos em caso de rescisão',
    $A$<p>Em caso de rescisão durante a execução do projeto, a CONTRATADA entregará os arquivos do website em seu estado atual de desenvolvimento no prazo máximo de 7 dias corridos.</p>$A$, 20);


  -- ══════════════════════════════════════════════════════════
  -- OBRIGAÇÕES DO CONTRATANTE
  -- ══════════════════════════════════════════════════════════

  -- Fixa — obrigações gerais
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratante',NULL,true,
    'Obrigações gerais do contratante',
    $A$<p>São obrigações da CONTRATANTE:</p>
<ul>
  <li>Fornecer todas as informações, acessos e materiais necessários para a execução dos serviços.</li>
  <li>Designar um responsável para acompanhar o andamento e aprovar entregas.</li>
  <li>Efetuar os pagamentos nas datas e condições estipuladas neste contrato.</li>
  <li>Comunicar por escrito qualquer alteração de escopo ou requisito.</li>
</ul>$A$, 10);

  -- Cond. agente_ia — pagamento de APIs e infraestrutura
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratante','agente_ia',false,
    'Agente IA — pagamento direto de APIs e infraestrutura de terceiros',
    $A$<p>A CONTRATANTE é responsável pelo pagamento direto e integral de todas as assinaturas, licenças, créditos de APIs, servidores e ferramentas de terceiros necessárias à operação do Agente de IA (ex.: OpenAI, n8n, serviços de nuvem). A CONTRATADA não se responsabiliza por interrupções decorrentes de falta de pagamento ou falhas técnicas nessas plataformas.</p>$A$, 20);

  -- Cond. assessoria — verba de mídia
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratante','assessoria',false,
    'Assessoria — verba de mídia e infraestrutura tecnológica',
    $A$<p>A verba destinada à veiculação de anúncios (Meta Ads, Google Ads etc.) e os custos de infraestrutura tecnológica serão pagos diretamente pela CONTRATANTE aos respectivos fornecedores, não constituindo responsabilidade da CONTRATADA.</p>$A$, 30);

  -- Cond. site — hospedagem, domínio e licenças
  PERFORM public.seed_contract_clause(org.id,'obrigacoes_contratante','site',false,
    'Projeto Web — hospedagem, domínio e licenças de terceiros',
    $A$<p>Os valores referentes à hospedagem, registro de domínio, certificado SSL, plugins e temas premium, ferramentas de integração, licenças de software e quaisquer outras despesas de terceiros necessárias ao funcionamento do website são de responsabilidade exclusiva da CONTRATANTE.</p>$A$, 40);

  -- ══════════════════════════════════════════════════════════
  -- REMUNERAÇÃO E FORMA DE PAGAMENTO
  -- ══════════════════════════════════════════════════════════

  -- Fixa — cronograma (a variável {{cronograma_pagamento}} é preenchida na geração)
  PERFORM public.seed_contract_clause(org.id,'remuneracao',NULL,true,
    'Cronograma de pagamento',
    $A$<p>Pela prestação dos serviços contratados, a CONTRATANTE pagará à CONTRATADA os valores conforme o cronograma abaixo:</p>
{{cronograma_pagamento}}$A$, 10);

  -- Fixa — multa por atraso e suspensão por inadimplência
  PERFORM public.seed_contract_clause(org.id,'remuneracao',NULL,true,
    'Multa por atraso no pagamento',
    $A$<p>{{clausula_multa_atraso}}</p>$A$, 20);

  PERFORM public.seed_contract_clause(org.id,'remuneracao',NULL,true,
    'Suspensão por inadimplência',
    $A$<p>{{clausula_suspensao}}</p>$A$, 30);


  -- ══════════════════════════════════════════════════════════
  -- SIGILO E CONFIDENCIALIDADE
  -- ══════════════════════════════════════════════════════════

  PERFORM public.seed_contract_clause(org.id,'sigilo',NULL,true,
    'Definição de informação confidencial e obrigações de sigilo',
    $A$<p>As partes se obrigam a manter em sigilo as informações confidenciais relativas ao negócio, políticas, segredos comerciais, organização e demais informações envolvendo a execução deste contrato.</p>
<p>Considera-se "informação confidencial" toda informação escrita ou verbal que, revelada à outra parte, contenha a expressão "confidencial" e que por sua natureza não deva ser de conhecimento público.</p>$A$, 10);

  PERFORM public.seed_contract_clause(org.id,'sigilo',NULL,true,
    'Tratamento de dúvidas sobre confidencialidade',
    $A$<p>Em caso de dúvida acerca da confidencialidade de determinada informação, as partes deverão tratá-la como confidencial até que seja autorizado por escrito a tratá-la de maneira diferente.</p>$A$, 20);

  PERFORM public.seed_contract_clause(org.id,'sigilo',NULL,true,
    'Consequências da violação ao sigilo',
    $A$<p>A violação a este compromisso de confidencialidade obrigará a parte infratora ao pagamento de perdas e danos, inclusive extrapatrimoniais.</p>$A$, 30);

  -- ══════════════════════════════════════════════════════════
  -- RESPONSABILIDADE CIVIL
  -- ══════════════════════════════════════════════════════════

  PERFORM public.seed_contract_clause(org.id,'responsabilidade',NULL,true,
    'Ausência de vínculo empregatício e responsabilidades próprias',
    $A$<p>As partes reconhecem expressamente não haver qualquer vínculo societário ou empregatício entre elas, seus representantes legais, prepostos, empregados ou terceiros utilizados no cumprimento das obrigações, responsabilizando-se cada parte por todas as obrigações fiscais, legais, trabalhistas e civis.</p>$A$, 10);

  PERFORM public.seed_contract_clause(org.id,'responsabilidade',NULL,true,
    'Responsabilidade exclusiva pelos próprios atos',
    $A$<p>Cada parte responderá exclusivamente pelos atos ou omissões praticadas pelos profissionais que contratar, não havendo responsabilidade da outra parte por eventual imprudência, negligência, imperícia ou danos causados a terceiros.</p>$A$, 20);

  PERFORM public.seed_contract_clause(org.id,'responsabilidade',NULL,true,
    'Ressarcimento por autuação ou condenação de responsabilidade alheia',
    $A$<p>Caso uma das partes venha a ser autuada, notificada ou condenada em razão do não cumprimento de obrigação da outra parte, a parte responsável obriga-se a ressarcir a outra de todas as despesas necessárias à sua defesa, incluindo honorários advocatícios, custas e taxas judiciais e administrativas.</p>$A$, 30);

  PERFORM public.seed_contract_clause(org.id,'responsabilidade',NULL,true,
    'Obrigação de meio — sem garantia de resultado',
    $A$<p>As obrigações assumidas pela CONTRATADA neste contrato são de <strong>meio e não de resultado</strong>, não havendo garantia de faturamento, lucro, número de vendas, geração de leads ou qualquer outro resultado específico decorrente dos serviços prestados.</p>$A$, 40);

  -- ══════════════════════════════════════════════════════════
  -- RESCISÃO
  -- ══════════════════════════════════════════════════════════

  PERFORM public.seed_contract_clause(org.id,'rescisao',NULL,true,
    'Rescisão por dissolução ou insolvência',
    $A$<p>A presente relação contratual poderá ser rescindida sem ônus para qualquer das partes em caso de dissolução, insolvência, falência ou recuperação judicial de qualquer delas.</p>$A$, 10);

  PERFORM public.seed_contract_clause(org.id,'rescisao',NULL,true,
    'Rescisão por aviso prévio de 30 dias',
    $A$<p>Qualquer das partes poderá rescindir este contrato mediante aviso prévio por escrito de 30 (trinta) dias, respeitadas as condições financeiras vigentes.</p>$A$, 20);

  PERFORM public.seed_contract_clause(org.id,'rescisao',NULL,true,
    'Forma das notificações',
    $A$<p>Todas as notificações previstas nesta cláusula deverão ser realizadas por escrito, mediante e-mail com confirmação de leitura ou carta registrada com aviso de recebimento.</p>$A$, 30);

  -- Cond. assessoria — multa por rescisão sem aviso prévio de 60 dias
  PERFORM public.seed_contract_clause(org.id,'rescisao','assessoria',false,
    'Assessoria — aviso prévio de 60 dias e multa rescisória',
    $A$<p>No âmbito da Assessoria de Performance, a CONTRATANTE poderá rescindir o serviço mediante notificação formal com antecedência mínima de 60 (sessenta) dias da data do próximo vencimento. O descumprimento deste aviso prévio sujeitará a CONTRATANTE ao pagamento de multa equivalente a 2 (duas) mensalidades vigentes.</p>$A$, 40);

  -- Cond. consultoria — política de devolução pré e pós imersão
  PERFORM public.seed_contract_clause(org.id,'rescisao','consultoria',false,
    'Consultoria — política de devolução por rescisão',
    $A$<p>Em caso de rescisão antes da reunião de imersão/integração: devolução de 80% (oitenta por cento) do valor pago. Após a realização da reunião de imersão, não haverá devolução de valores, uma vez que o diagnóstico do negócio já terá sido iniciado.</p>$A$, 40);


  -- ══════════════════════════════════════════════════════════
  -- DISPOSIÇÕES GERAIS
  -- ══════════════════════════════════════════════════════════

  PERFORM public.seed_contract_clause(org.id,'disposicoes',NULL,true,
    'Independência das partes e responsabilidades tributárias',
    $A$<p>Este contrato não implica em qualquer associação ou compromisso societário entre as partes, que são responsáveis por suas respectivas responsabilidades civis, criminais, trabalhistas, previdenciárias e tributárias.</p>$A$, 10);

  PERFORM public.seed_contract_clause(org.id,'disposicoes',NULL,true,
    'Não configuração de renúncia por tolerância',
    $A$<p>O não exercício pelas partes de qualquer direito que lhes assegure este contrato ou lei, assim como sua tolerância quanto a eventuais infrações, não implicará reconhecimento de renúncia a qualquer direito, nem novação ou modificação deste contrato.</p>$A$, 20);

  PERFORM public.seed_contract_clause(org.id,'disposicoes',NULL,true,
    'Validade das assinaturas eletrônicas',
    $A$<p>O contrato será assinado em plataforma digital indicada pela CONTRATADA. As partes reconhecem e declaram que as assinaturas eletrônicas realizadas por meio do serviço Autentique (https://www.autentique.com.br/) ou Gov.br (https://www.gov.br/) são, para os fins do Art. 4°, II, da Lei n. 14.063/2020, plenamente vinculantes e eficazes, constituindo título executivo extrajudicial.</p>$A$, 30);

  PERFORM public.seed_contract_clause(org.id,'disposicoes',NULL,true,
    'Alterações somente por aditivo contratual',
    $A$<p>As alterações nos termos deste instrumento somente terão validade se realizadas por aditivo contratual.</p>$A$, 40);

  PERFORM public.seed_contract_clause(org.id,'disposicoes',NULL,true,
    'Irrevogabilidade e força executiva',
    $A$<p>As partes atribuem ao instrumento caráter irrevogável e irretratável, ao qual é atribuída força executiva extrajudicial.</p>$A$, 50);

  PERFORM public.seed_contract_clause(org.id,'disposicoes',NULL,true,
    'Lei aplicável',
    $A$<p>O presente contrato é regido pelas leis da República Federativa do Brasil.</p>$A$, 60);

  PERFORM public.seed_contract_clause(org.id,'disposicoes',NULL,true,
    'Foro eleito',
    $A$<p>As partes elegem o foro da Comarca de {{foro_cidade}} para dirimir quaisquer questões oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>$A$, 70);

END LOOP;
END $$;

-- Remove helper temporário
DROP FUNCTION IF EXISTS public.seed_contract_clause(UUID,TEXT,TEXT,BOOLEAN,TEXT,TEXT,INTEGER);

-- ── Atualiza template base para usar variáveis de categoria ──────────────────
-- Migra templates que ainda usam o formato antigo ({{blocos_servico}})

DO $$
DECLARE
  org  RECORD;
  html TEXT;
BEGIN
  html := $T$
<div class="contract-document">
<div class="contract-header-space"></div>
<h1 class="contract-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<section class="contract-parties">
  <p><strong>CONTRATANTE:</strong></p>
  <p>{{contratante_razao_social}}, inscrita sob o CNPJ n° {{contratante_cnpj}}, com sede na {{contratante_endereco}}, neste ato representada por {{representante_nome}}, inscrito no CPF nº {{representante_cpf}}, doravante denominado <strong>CONTRATANTE</strong>.</p>
  <p style="margin-top:16px"><strong>CONTRATADA:</strong></p>
  <p>Agência C8 LTDA, inscrita sob o CNPJ n° 62.659.676/0001-49, com sede na Rua Ademir Pereira de Jesus, 46 Apto 102, Matinha, Teófilo Otoni (MG), neste ato representada por seu sócio-administrador Tarcísio Pereira da Silva Brito, inscrito no CPF nº 089.712.156-23, doravante denominada <strong>CONTRATADA</strong>.</p>
  <p style="margin-top:16px">As partes acima qualificadas firmam o presente contrato regulamentado pelas seguintes cláusulas e condições:</p>
</section>
{{clausula_objeto}}
{{clausula_obrigacoes_contratada}}
{{clausula_obrigacoes_contratante}}
{{clausula_remuneracao}}
{{clausula_sigilo}}
{{clausula_responsabilidade}}
{{clausula_rescisao}}
{{clausula_disposicoes}}
<p>Estando justos e contratados, as partes assinam o presente contrato.</p>
{{bloco_assinaturas}}
<div class="contract-footer-space"></div>
</div>$T$;

  FOR org IN SELECT id FROM public.organizations LOOP
    UPDATE public.contract_templates
    SET html_content = html
    WHERE organization_id = org.id
      AND is_default = true
      AND html_content LIKE '%{{blocos_servico}}%';
  END LOOP;
END $$;
