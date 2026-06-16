-- =============================================================================
-- SEED: Template e Cláusulas padrão — Agência C8
-- =============================================================================
-- INSTRUÇÕES:
--   1. Substitua 'SEU_ORGANIZATION_ID_AQUI' pelo UUID da sua organização.
--      Para encontrá-lo: SELECT id FROM organizations LIMIT 5;
--   2. Execute no SQL Editor do Supabase (ou via psql).
--   3. Tudo pode ser editado/excluído normalmente pelo sistema após importar.
-- =============================================================================

DO $$
DECLARE
  v_org_id UUID := 'SEU_ORGANIZATION_ID_AQUI';
  v_tpl_id UUID := gen_random_uuid();
BEGIN

-- =============================================================================
-- 1. TEMPLATE DE CONTRATO
-- =============================================================================
INSERT INTO contract_templates (
  id,
  organization_id,
  name,
  content,
  is_default,
  structure,
  created_at,
  updated_at
) VALUES (
  v_tpl_id,
  v_org_id,
  'Contrato Padrão — Agência C8',
  '',
  true,
  jsonb_build_object(
    'header', $HTML$<div style="font-family: ''Segoe UI'', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 50px;">
  <div style="display: flex; align-items: center; margin-bottom: 10px;">
    <div style="font-size: 22px; font-weight: 900; color: #1a1a1a; letter-spacing: -1px;">
      &#x27F3; AGÊNCIA C8
    </div>
  </div>
  <hr style="border: none; border-top: 3px solid #7c3aed; margin-bottom: 30px;">
  <h1 style="text-align: center; font-size: 15px; font-weight: 700; text-transform: uppercase; margin-bottom: 40px; line-height: 1.6;">
    CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE {{escopo}}
  </h1>$HTML$,

    'parties_block', $HTML$  <table style="width:100%; border-collapse:collapse; margin-bottom:30px; font-size:14px;">
    <tr>
      <td style="width:130px; vertical-align:top; padding:8px 0; font-weight:700; text-decoration:underline;">CONTRATANTE:</td>
      <td style="vertical-align:top; padding:8px 0; font-style:italic; line-height:1.7; text-align:justify;">
        {{empresa}}, inscrita sob o CNPJ n° {{cnpj}},
        neste ato representada pelo(a) {{consultor}},
        doravante denominado(a) <strong>CONTRATANTE</strong>.
      </td>
    </tr>
    <tr><td colspan="2" style="height:20px;"></td></tr>
    <tr>
      <td style="width:130px; vertical-align:top; padding:8px 0; font-weight:700; text-decoration:underline;">CONTRATADA:</td>
      <td style="vertical-align:top; padding:8px 0; font-style:italic; line-height:1.7; text-align:justify;">
        Agência C8 LTDA, inscrita sob o CNPJ n° 62.659.676/0001-49, com sede na
        Rua Ademir Pereira de Jesus, 46 Apto 102, Matinha, Teófilo Otoni (MG),
        neste ato representada por seu sócio-administrador Tarcísio Pereira da Silva Brito,
        inscrito no CPF nº 089.712.156-23, doravante denominada <strong>CONTRATADA</strong>.
      </td>
    </tr>
  </table>
  <p style="text-align:justify; margin-bottom:30px; line-height:1.7; font-size:14px;">
    As partes acima qualificadas firmam este contrato de assessoria de marketing e vendas
    regulamentada pelas seguintes cláusulas e condições:
  </p>$HTML$,

    'clauses_block', $HTML$  <div style="font-size:14px;">{{CLAUSES}}</div>$HTML$,

    'signature_block', $HTML$  <div style="font-size:14px; margin-top:40px;">
    <p style="text-align:justify; margin-bottom:30px; line-height:1.7;">
      Estando justos e contratados, as partes assinam o presente contrato na presença
      de duas testemunhas, para que surtam todos os devidos e legais efeitos.
    </p>
    <p style="margin-bottom:50px;">Teófilo Otoni (MG), {{data}}.</p>

    <div style="margin-bottom:50px;">
      <p><strong>CONTRATADA:</strong> <span style="display:inline-block; width:380px; border-bottom:1px solid #000;">&nbsp;</span></p>
      <p style="margin-left:100px; font-weight:700;">AGÊNCIA C8 LTDA</p>
    </div>
    <div style="margin-bottom:50px;">
      <p><strong>CONTRATANTE:</strong> <span style="display:inline-block; width:375px; border-bottom:1px solid #000;">&nbsp;</span></p>
      <p style="margin-left:100px; font-weight:700;">{{empresa}}</p>
    </div>
    <div>
      <p style="font-weight:700; margin-bottom:30px;">TESTEMUNHAS:</p>
      <div style="display:flex; gap:80px;">
        <div>
          <div style="border-bottom:1px solid #000; width:240px; margin-bottom:5px;">&nbsp;</div>
          <p>Nome</p>
        </div>
        <div>
          <div style="border-bottom:1px solid #000; width:240px; margin-bottom:5px;">&nbsp;</div>
          <p>Nome</p>
        </div>
      </div>
    </div>
  </div>$HTML$,

    'footer', $HTML$  <div style="margin-top:40px; border-top:4px solid #7c3aed;">&nbsp;</div>
</div>$HTML$
  ),
  now(),
  now()
);


-- =============================================================================
-- 2. CLÁUSULAS — Biblioteca
--    content armazena TipTap JSONContent. Usamos parágrafos simples.
-- =============================================================================

-- Cláusula 1ª — OBJETO
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Objeto',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"1.1"},{"type":"text","text":" O presente contrato tem por objeto a prestação de serviços de {{escopo}}, focada na estruturação e otimização de processos comerciais para o crescimento sustentável e contínuo da CONTRATANTE."}]}]}',
  0, 'always', NULL, false, NULL, now(), now()
);

-- Cláusula 2ª — VIGÊNCIA
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Vigência',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"2.1"},{"type":"text","text":" A vigência do presente contrato será de {{prazo_minimo}} meses, podendo ser prorrogado por prazo igual ou superior, através de Contrato Aditivo."}]}]}',
  1, 'always', NULL, true, NULL, now(), now()
);


-- Cláusula 3ª — OBRIGAÇÕES DO CONTRATANTE
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Obrigações do Contratante',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"3.1"},{"type":"text","text":" Constituem obrigações do CONTRATANTE, sem prejuízo de outras obrigações estipuladas neste TERMO:"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Fornecer à CONTRATADA todas as informações relativas ao negócio necessárias para a adequada prestação dos serviços;"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Participar ativamente do processo de planejamento e execução dos serviços prestados pela CONTRATADA, através de reuniões periódicas;"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Produzir e fornecer todos os materiais necessários para execução das estratégias definidas como fotos, vídeos, informações e dados sobre o produto, serviço e empresa;"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Responsabilizar-se pela veracidade e licitude de todo o conteúdo fornecido à CONTRATADA;"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Informar e manter atualizados os dados de acesso (logins e senhas) de plataformas necessárias, garantindo os níveis de permissão adequados para a execução técnica;"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Efetuar os pagamentos devidos à CONTRATADA na forma e prazo especificados na Cláusula 5ª."}]}]}]}]}',
  2, 'always', NULL, false, NULL, now(), now()
);

-- Cláusula 4ª — OBRIGAÇÕES DA CONTRATADA
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Obrigações da Contratada',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"4.1"},{"type":"text","text":" Constituem obrigações da CONTRATADA, sem prejuízo de outras obrigações estipuladas neste TERMO:"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Desenvolver, da melhor forma possível, os serviços contratados, dentro dos prazos estabelecidos pelas partes;"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Divulgar somente os conteúdos informados, repassados ou aprovados pelo CONTRATANTE;"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Manter sigilo sobre as informações confidenciais relativas ao negócio da CONTRATANTE."}]}]}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"4.2"},{"type":"text","text":" O cronograma para a realização de serviços será definido em comum acordo entre as PARTES."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"4.3"},{"type":"text","text":" A CONTRATADA se declara disponível diariamente para o esclarecimento de dúvidas e/ou atualização sobre o andamento do projeto, utilizando como ferramenta principal o WhatsApp."}]}]}',
  3, 'always', NULL, false, NULL, now(), now()
);


-- Cláusula 5ª — REMUNERAÇÃO (sem setup — condição always)
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Remuneração — Assessoria Mensal',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"5.1"},{"type":"text","text":" Pelos serviços prestados, o CONTRATANTE pagará à CONTRATADA o valor fixo mensal de {{valor}}, com vencimento todo dia {{vencimento}}."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"5.2"},{"type":"text","text":" O pagamento será efetuado exclusivamente via PIX (Chave CNPJ: 62.659.676/0001-49 — Agência C8 LTDA). A confirmação do crédito é condição essencial para a manutenção dos serviços."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"5.3"},{"type":"text","text":" A verba destinada à veiculação de anúncios (Meta, Google, etc.), bem como os custos de infraestrutura tecnológica, serão pagos diretamente pela CONTRATANTE aos respectivos fornecedores."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"5.4"},{"type":"text","text":" O atraso no pagamento de qualquer quantia acarretará multa de 10% (dez por cento) e juros moratórios de 1% (um por cento) ao mês."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"5.5"},{"type":"text","text":" Atrasos superiores a 20 (vinte) dias conferem à CONTRATADA o direito de suspender a prestação dos serviços até a regularização do débito."}]}]}',
  4, 'always', NULL, true, NULL, now(), now()
);

-- Cláusula 5-SETUP — REMUNERAÇÃO com Setup (condição has_setup)
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Remuneração — Investimento de Estruturação (Setup)',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"5.1"},{"type":"text","text":" Do Investimento de Estruturação (Setup): Pela implementação da infraestrutura de vendas, diagnóstico e planejamento estratégico, o valor total é de {{valor}} ({{escopo}})."}]},{"type":"paragraph","content":[{"type":"text","text":"a) O primeiro pagamento do setup vencerá em {{primeiro_pagamento}}, permanecendo os demais vencimentos conforme cronograma acordado."}]},{"type":"paragraph","content":[{"type":"text","text":"b) O pagamento será efetuado exclusivamente via PIX (Chave CNPJ: 62.659.676/0001-49 — Agência C8 LTDA)."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"5.2"},{"type":"text","text":" Da Assessoria Mensal: Após a quitação do Setup, a CONTRATANTE passará a pagar o valor fixo mensal de acordo com o plano contratado, com vencimento todo dia {{vencimento}}."}]}]}',
  5, 'has_setup', NULL, true, NULL, now(), now()
);


-- Cláusula 6ª — SIGILO E CONFIDENCIALIDADE
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Sigilo e Confidencialidade',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"6.1"},{"type":"text","text":" As partes se obrigam a manter em sigilo as informações confidenciais relativas ao negócio, políticas, segredos comerciais, organização, criação e demais informações envolvendo a execução deste contrato."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"6.2"},{"type":"text","text":" Para efeito deste instrumento, considera-se como \"informação confidencial\" toda informação escrita ou verbal que revelada à outra parte, que por sua natureza não deve ser de conhecimento público."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"6.3"},{"type":"text","text":" A violação a este compromisso de confidencialidade obrigará a parte infratora ao pagamento de perdas e danos, inclusive extrapatrimoniais."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"6.4"},{"type":"text","text":" A obrigação de sigilo e confidencialidade não se aplica para os casos de divulgação de informações do CONTRATANTE necessárias para a prestação de serviço pela CONTRATADA."}]}]}',
  6, 'always', NULL, false, NULL, now(), now()
);

-- Cláusula 7ª — RESPONSABILIDADE CIVIL
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Responsabilidade Civil',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"7.1"},{"type":"text","text":" As partes reconhecem expressamente não haver qualquer vínculo societário ou empregatício entre as partes contratantes, seus representantes legais, prepostos ou empregados, responsabilizando-se cada uma das partes por todas as obrigações fiscais, legais, trabalhistas e civis."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"7.2"},{"type":"text","text":" Cada parte responderá exclusivamente pelos atos ou omissões praticadas pelos profissionais que contratar, de sorte que não há para a outra parte nenhuma responsabilidade por eventual imprudência, negligência, imperícia ou danos que venham a ser cometidos, inclusive a terceiros."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"7.3"},{"type":"text","text":" Caso uma das partes venha a ser autuada ou condenada em razão do não cumprimento de qualquer obrigação prevista neste contrato como de responsabilidade da outra parte, a parte responsável obriga-se a ressarcir a outra de todas as despesas necessárias à realização de sua defesa."}]}]}',
  7, 'always', NULL, false, NULL, now(), now()
);

-- Cláusula 8ª — RESCISÃO
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Rescisão',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"8.1"},{"type":"text","text":" A presente relação contratual poderá ser rescindida por qualquer das PARTES, sem incidência de multa, em casos de dissolução, insolvência, falência ou recuperação judicial de qualquer uma delas."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"8.2"},{"type":"text","text":" O CONTRATANTE poderá rescindir o serviço de assessoria de performance mediante notificação formal à CONTRATADA com antecedência mínima de 30 (trinta) dias da data do próximo vencimento."}]},{"type":"paragraph","content":[{"type":"text","text":"a) O descumprimento do aviso prévio de 30 dias sujeitará a PARTE solicitante ao pagamento de multa compensatória equivalente a 02 (duas) mensalidades vigentes à época da rescisão."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"8.3"},{"type":"text","text":" Na hipótese de violação de qualquer cláusula deste CONTRATO, a PARTE prejudicada notificará a outra para sanar a violação em até 10 (dez) dias. Não havendo regularização, a rescisão ocorrerá no 5º dia útil após o término do prazo de correção."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"8.4"},{"type":"text","text":" Após a rescisão, a CONTRATADA manterá os dados, relatórios e arquivos da CONTRATANTE disponíveis para extração pelo prazo improrrogável de 07 (sete) dias."}]}]}',
  8, 'always', NULL, false, NULL, now(), now()
);


-- Cláusula 9ª — DISPOSIÇÕES GERAIS
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Disposições Gerais',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"9.1"},{"type":"text","text":" Este contrato não implica em qualquer associação ou compromisso societário entre as partes."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"9.2"},{"type":"text","text":" O não exercício pelas partes de qualquer direito que lhes assegure este contrato não implicará em reconhecimento da renúncia a qualquer direito, nem novação ou modificação deste contrato."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"9.3"},{"type":"text","text":" O contrato será assinado em plataforma digital indicada pela CONTRATADA (Autentique ou Gov.br), sendo plenamente vinculante e eficaz, constituindo título executivo extrajudicial para todos os fins de direito."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"9.4"},{"type":"text","text":" As alterações nos termos deste instrumento somente terão validade se realizadas por aditivo contratual."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"9.5"},{"type":"text","text":" O presente contrato é regido pelas leis da República Federativa do Brasil."}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"9.6"},{"type":"text","text":" As partes elegem o foro da Comarca de Teófilo Otoni (MG) para dirimir quaisquer questões oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja."}]}]}',
  9, 'always', NULL, false, NULL, now(), now()
);

-- Cláusula de Prazo Mínimo (exibida apenas quando contrato tem prazo mínimo > 0)
INSERT INTO contract_clauses (
  id, organization_id, title, content, display_order,
  condition_type, condition_value, is_editable, service_id, created_at, updated_at
) VALUES (
  gen_random_uuid(), v_org_id,
  'Fidelidade e Prazo Mínimo',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Parágrafo Único — Fidelidade:"},{"type":"text","text":" O CONTRATANTE se compromete a manter o contrato pelo período mínimo de {{prazo_minimo}} meses a partir da data de assinatura. O descumprimento deste prazo mínimo sujeitará o CONTRATANTE ao pagamento de multa compensatória equivalente a 02 (duas) mensalidades vigentes à época da rescisão."}]}]}',
  10, 'has_min_duration', NULL, false, NULL, now(), now()
);

END $$;

-- =============================================================================
-- FIM DO SCRIPT
-- Após executar, acesse Configurações → Contratos para verificar o template,
-- e Configurações → Contratos → Cláusulas para ver e editar cada cláusula.
-- =============================================================================
