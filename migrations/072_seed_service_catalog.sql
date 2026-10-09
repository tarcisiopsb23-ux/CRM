-- =============================================================================
-- Migration 072: Seed do Catálogo de Serviços — Agência C8
-- Banco A — Idempotente (ON CONFLICT DO NOTHING)
--
-- Popula a tabela service_catalog com os 11 serviços do Catálogo Oficial
-- da Agência C8 (versão de referência — Agosto de 2026).
--
-- Execução: Supabase SQL Editor com service_role (bypassa RLS).
-- O slug é gerado inline pela mesma lógica do app e da migration 00206.
-- Se o serviço já existir (mesmo organization_id + name), a linha é ignorada.
-- =============================================================================

DO $$
DECLARE
  v_org_id UUID;
BEGIN

  -- Obtém a organização principal da Agência C8
  SELECT id INTO v_org_id
  FROM public.organizations
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma organização encontrada. Execute após criar a organização.';
  END IF;

  -- ─── Função auxiliar inline: gera slug a partir do nome ───────────────────
  -- Mesma lógica do useServiceCatalog.ts (generateSlug) e da migration 00206.

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 1. Assessoria de Marketing e Vendas
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Assessoria de Marketing e Vendas',
    trim(both '_' from regexp_replace(lower(translate(
      'Assessoria de Marketing e Vendas',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Marketing e Vendas',
    'Híbrida (consultiva e executiva)',
    'Assessoria estratégica contínua destinada a estruturar, executar e otimizar ações de marketing e vendas da CONTRATANTE. A atuação combina diagnóstico, planejamento, direcionamento técnico, execução operacional e acompanhamento de indicadores, conforme as frentes, canais, metas, cadência e itens expressamente selecionados na proposta, ordem de serviço ou contrato.',
    '[
      {"id":"asmv-01","name":"Diagnóstico inicial de marketing, vendas e presença digital","delivery_type":"unico","output_format":"texto","text_value":"Diagnóstico inicial de marketing, vendas e presença digital entregue ao início do contrato."},
      {"id":"asmv-02","name":"Planejamento estratégico e definição de prioridades","delivery_type":"unico","output_format":"texto","text_value":"Planejamento estratégico e definição de prioridades entregue ao início do contrato."},
      {"id":"asmv-03","name":"Plano de aquisição, conversão, retenção e crescimento","delivery_type":"unico","output_format":"texto","text_value":"Plano de aquisição, conversão, retenção e crescimento estruturado conforme briefing aprovado."},
      {"id":"asmv-04","name":"Acompanhamento de indicadores-chave (CAC, LTV, ROAS, CPL e conversão)","delivery_type":"recorrente","output_format":"texto","text_value":"Acompanhamento mensal de indicadores-chave (CAC, LTV, ROAS, CPL e conversão) durante a vigência do contrato."},
      {"id":"asmv-05","name":"Reuniões periódicas de acompanhamento e direcionamento","delivery_type":"recorrente","output_format":"numero","unit":"reunião","unit_plural":"reuniões"},
      {"id":"asmv-06","name":"Planejamento, configuração e otimização de campanhas de mídia paga","delivery_type":"recorrente","output_format":"texto","text_value":"Planejamento, configuração e otimização de campanhas de mídia paga conforme canais contratados."},
      {"id":"asmv-07","name":"Estruturação de funis comerciais e jornadas do cliente","delivery_type":"unico","output_format":"texto","text_value":"Estruturação de funis comerciais e jornadas do cliente entregue conforme escopo aprovado."},
      {"id":"asmv-08","name":"Direcionamento de CRM, pipeline e etapas de vendas","delivery_type":"recorrente","output_format":"texto","text_value":"Direcionamento de CRM, pipeline e etapas de vendas durante a vigência do contrato."},
      {"id":"asmv-09","name":"Réguas de relacionamento por e-mail, WhatsApp ou canais contratados","delivery_type":"unico","output_format":"texto","text_value":"Estruturação de réguas de relacionamento por e-mail, WhatsApp ou canais expressamente contratados."},
      {"id":"asmv-10","name":"Relatórios gerenciais e recomendações de otimização","delivery_type":"recorrente","output_format":"numero","unit":"relatório","unit_plural":"relatórios"}
    ]'::jsonb,
    '[]'::jsonb, 0, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 2. Consultoria de Marketing e Vendas
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Consultoria de Marketing e Vendas',
    trim(both '_' from regexp_replace(lower(translate(
      'Consultoria de Marketing e Vendas',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Marketing e Vendas',
    'Consultiva',
    'Consultoria estratégica voltada à análise técnica, diagnóstico, planejamento e direcionamento das ações de marketing e vendas da CONTRATANTE. Não compreende execução operacional recorrente; eventuais ativos executivos, como landing pages, dashboards, campanhas ou automações, serão objeto de contratação específica ou inclusão expressa no escopo.',
    '[
      {"id":"cmv-01","name":"Diagnóstico de marketing, vendas, funil, presença digital e processos comerciais","delivery_type":"unico","output_format":"texto","text_value":"Diagnóstico de marketing, vendas, funil, presença digital e processos comerciais entregue conforme escopo aprovado."},
      {"id":"cmv-02","name":"Análise de canais, campanhas, ativos digitais e oportunidades de crescimento","delivery_type":"unico","output_format":"texto","text_value":"Análise de canais, campanhas, ativos digitais e oportunidades de crescimento entregue conforme escopo aprovado."},
      {"id":"cmv-03","name":"Planejamento estratégico de marketing e vendas","delivery_type":"unico","output_format":"texto","text_value":"Planejamento estratégico de marketing e vendas entregue conforme escopo aprovado."},
      {"id":"cmv-04","name":"Definição de metas, indicadores e prioridades","delivery_type":"unico","output_format":"texto","text_value":"Definição de metas, indicadores e prioridades entregue conforme escopo aprovado."},
      {"id":"cmv-05","name":"Orientação sobre tráfego pago, conteúdo, SEO, CRO, branding, CRM e automações","delivery_type":"pontual","output_format":"texto","text_value":"Orientação técnica sobre tráfego pago, conteúdo, SEO, CRO, branding, CRM e automações conforme demanda."},
      {"id":"cmv-06","name":"Desenho de jornada do cliente e diretrizes de relacionamento","delivery_type":"unico","output_format":"texto","text_value":"Desenho de jornada do cliente e diretrizes de relacionamento entregue conforme escopo aprovado."},
      {"id":"cmv-07","name":"Plano de ação priorizado","delivery_type":"unico","output_format":"texto","text_value":"Plano de ação priorizado entregue ao final do processo consultivo."},
      {"id":"cmv-08","name":"Reuniões de apresentação, alinhamento e acompanhamento","delivery_type":"recorrente","output_format":"numero","unit":"reunião","unit_plural":"reuniões"},
      {"id":"cmv-09","name":"Relatório, parecer ou plano estratégico","delivery_type":"unico","output_format":"texto","text_value":"Relatório, parecer ou plano estratégico entregue conforme formato contratado."}
    ]'::jsonb,
    '[]'::jsonb, 1, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. Ecossistema de Atendimento IA e Automação
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Ecossistema de Atendimento IA e Automação',
    trim(both '_' from regexp_replace(lower(translate(
      'Ecossistema de Atendimento IA e Automacao',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Tecnologia e Automação',
    'Híbrida (consultiva e executiva)',
    'Serviço de desenho, implantação e evolução de soluções de atendimento e automação de processos, utilizando inteligência artificial, integrações e plataformas de workflow, inclusive n8n, conforme requisitos aprovados. A solução poderá envolver canais de atendimento, sistemas de gestão, bases de conhecimento, APIs e rotinas operacionais. As integrações, volumes, canais, credenciais, custos de terceiros e funcionalidades efetivamente contratadas deverão constar no escopo específico.',
    '[
      {"id":"ia-01","name":"Levantamento de requisitos, processos, regras de negócio e exceções","delivery_type":"unico","output_format":"texto","text_value":"Levantamento de requisitos, processos, regras de negócio e exceções entregue ao início do projeto."},
      {"id":"ia-02","name":"Mapeamento de jornada de atendimento e oportunidades de automação","delivery_type":"unico","output_format":"texto","text_value":"Mapeamento de jornada de atendimento e oportunidades de automação entregue ao início do projeto."},
      {"id":"ia-03","name":"Desenho de arquitetura, fluxos, gatilhos e critérios de encaminhamento","delivery_type":"unico","output_format":"texto","text_value":"Documento de arquitetura com fluxos, gatilhos e critérios de encaminhamento aprovado antes da implantação."},
      {"id":"ia-04","name":"Criação e configuração de agente de IA para atendimento ou operação","delivery_type":"unico","output_format":"numero","unit":"agente","unit_plural":"agentes"},
      {"id":"ia-05","name":"Estruturação de base de conhecimento e curadoria de conteúdos","delivery_type":"unico","output_format":"texto","text_value":"Base de conhecimento estruturada e curadoria de conteúdos entregues conforme escopo aprovado."},
      {"id":"ia-06","name":"Integração com canais (WhatsApp, site, Instagram, Facebook, e-mail)","delivery_type":"unico","output_format":"texto","text_value":"Integração com os canais expressamente aprovados no escopo do projeto."},
      {"id":"ia-07","name":"Criação de workflows de automação (n8n ou equivalente)","delivery_type":"unico","output_format":"numero","unit":"workflow","unit_plural":"workflows"},
      {"id":"ia-08","name":"Integração com CRM, ERP, agenda, gateway de pagamento e APIs aprovadas","delivery_type":"unico","output_format":"texto","text_value":"Integração com sistemas e APIs expressamente aprovados no escopo do projeto."},
      {"id":"ia-09","name":"Ambiente de homologação, testes e publicação em produção","delivery_type":"unico","output_format":"texto","text_value":"Ambiente de homologação, testes e publicação em produção conforme plano de implantação aprovado."},
      {"id":"ia-10","name":"Treinamento de usuários e entrega de orientações operacionais","delivery_type":"unico","output_format":"texto","text_value":"Treinamento de usuários e orientações operacionais entregues no ato da implantação."},
      {"id":"ia-11","name":"Documentação de fluxos contratados","delivery_type":"unico","output_format":"texto","text_value":"Documentação dos fluxos contratados entregue ao final da implantação."},
      {"id":"ia-12","name":"Suporte e otimizações pelo período contratado","delivery_type":"recorrente","output_format":"texto","text_value":"Suporte técnico e otimizações durante o período expressamente contratado."}
    ]'::jsonb,
    '[]'::jsonb, 2, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. Site / Landing Page
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Site / Landing Page',
    trim(both '_' from regexp_replace(lower(translate(
      'Site Landing Page',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Presença Digital',
    'Executiva',
    'Serviço de concepção, design, desenvolvimento, implantação e homologação de site institucional, landing page, hotsite ou blog, conforme briefing e requisitos aprovados. A entrega compreende somente as páginas, integrações, conteúdos, revisões e funcionalidades expressamente selecionados; novos módulos, páginas ou alterações posteriores constituem escopo adicional.',
    '[
      {"id":"slp-01","name":"Briefing e levantamento de requisitos","delivery_type":"unico","output_format":"texto","text_value":"Briefing e levantamento de requisitos realizado ao início do projeto."},
      {"id":"slp-02","name":"Arquitetura de informação e mapa de páginas","delivery_type":"unico","output_format":"texto","text_value":"Arquitetura de informação e mapa de páginas entregues antes do desenvolvimento."},
      {"id":"slp-03","name":"Layout responsivo para desktop e dispositivos móveis","delivery_type":"unico","output_format":"texto","text_value":"Layout responsivo para desktop e dispositivos móveis desenvolvido conforme briefing aprovado."},
      {"id":"slp-04","name":"Páginas desenvolvidas","delivery_type":"unico","output_format":"numero","unit":"página","unit_plural":"páginas"},
      {"id":"slp-05","name":"Formulários de contato, conversão e captura de leads","delivery_type":"unico","output_format":"numero","unit":"formulário","unit_plural":"formulários"},
      {"id":"slp-06","name":"Integração com WhatsApp, CRM, e-mail marketing ou agenda","delivery_type":"unico","output_format":"texto","text_value":"Integração com os sistemas expressamente previstos no escopo do projeto."},
      {"id":"slp-07","name":"Configuração de domínio, hospedagem e SSL","delivery_type":"unico","output_format":"texto","text_value":"Configuração de domínio, hospedagem e SSL conforme contratado."},
      {"id":"slp-08","name":"SEO técnico básico (estrutura, títulos, meta descrições, sitemap e indexação)","delivery_type":"unico","output_format":"texto","text_value":"SEO técnico básico aplicado: estrutura, títulos, meta descrições, sitemap e indexação."},
      {"id":"slp-09","name":"Publicação em produção e testes de homologação","delivery_type":"unico","output_format":"texto","text_value":"Publicação em produção e testes funcionais de homologação dentro do escopo aprovado."},
      {"id":"slp-10","name":"Rodadas de revisão","delivery_type":"pontual","output_format":"numero","unit":"rodada","unit_plural":"rodadas"}
    ]'::jsonb,
    '[]'::jsonb, 3, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 5. Google Meu Negócio
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Google Meu Negócio',
    trim(both '_' from regexp_replace(lower(translate(
      'Google Meu Negocio',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Presença Digital',
    'Híbrida (consultiva e executiva)',
    'Serviço de criação, regularização, otimização e gestão estratégica do Perfil da Empresa no Google, voltado ao fortalecimento da presença local, da encontrabilidade e da reputação digital da CONTRATANTE. A aprovação do perfil e de recursos da plataforma depende exclusivamente das políticas e validações do Google.',
    '[
      {"id":"gmn-01","name":"Criação ou reivindicação do Perfil da Empresa no Google","delivery_type":"unico","output_format":"texto","text_value":"Criação ou reivindicação do Perfil da Empresa no Google realizada ao início do serviço."},
      {"id":"gmn-02","name":"Configuração de nome, categoria, endereço, horário, contatos e links","delivery_type":"unico","output_format":"texto","text_value":"Configuração completa dos dados cadastrais do perfil: nome, categoria, endereço, área de atendimento, horário, contatos e links."},
      {"id":"gmn-03","name":"Orientação e apoio ao processo de verificação","delivery_type":"unico","output_format":"texto","text_value":"Orientação e apoio ao processo de verificação do perfil junto ao Google."},
      {"id":"gmn-04","name":"Descrição estratégica da empresa","delivery_type":"unico","output_format":"texto","text_value":"Redação de descrição estratégica da empresa para o perfil."},
      {"id":"gmn-05","name":"Cadastro de serviços, produtos, atributos e perguntas frequentes","delivery_type":"unico","output_format":"texto","text_value":"Cadastro de serviços, produtos, atributos e perguntas frequentes no perfil."},
      {"id":"gmn-06","name":"Inclusão e organização de fotos, logo e capa","delivery_type":"unico","output_format":"texto","text_value":"Inclusão e organização das fotos, logo e capa fornecidos ou contratados."},
      {"id":"gmn-07","name":"Publicações de atualização no perfil","delivery_type":"recorrente","output_format":"numero","unit":"publicação","unit_plural":"publicações"},
      {"id":"gmn-08","name":"Monitoramento básico de informações e desempenho do perfil","delivery_type":"recorrente","output_format":"texto","text_value":"Monitoramento básico de informações e desempenho do perfil durante a vigência do contrato."},
      {"id":"gmn-09","name":"Relatório e recomendações de otimização","delivery_type":"recorrente","output_format":"numero","unit":"relatório","unit_plural":"relatórios"}
    ]'::jsonb,
    '[]'::jsonb, 4, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 6. Aplicações Web
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Aplicações Web',
    trim(both '_' from regexp_replace(lower(translate(
      'Aplicacoes Web',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Tecnologia e Automação',
    'Híbrida (consultiva e executiva)',
    'Serviço de descoberta, arquitetura, design, desenvolvimento, testes e implantação de aplicações web, portais e sistemas sob demanda. Cada projeto é modular: os requisitos, usuários, perfis de acesso, integrações, ambientes, critérios de aceite, propriedade intelectual, suporte e evolução deverão ser definidos na proposta ou contrato específico.',
    '[
      {"id":"aw-01","name":"Levantamento de requisitos e regras de negócio","delivery_type":"unico","output_format":"texto","text_value":"Levantamento de requisitos e regras de negócio entregue ao início do projeto."},
      {"id":"aw-02","name":"Mapeamento de jornadas, perfis de usuário e permissões","delivery_type":"unico","output_format":"texto","text_value":"Mapeamento de jornadas, perfis de usuário e permissões entregue antes do desenvolvimento."},
      {"id":"aw-03","name":"Especificação de funcionalidades, integrações e critérios de aceite","delivery_type":"unico","output_format":"texto","text_value":"Especificação de funcionalidades, integrações e critérios de aceite aprovados antes do desenvolvimento."},
      {"id":"aw-04","name":"Módulos desenvolvidos","delivery_type":"unico","output_format":"numero","unit":"módulo","unit_plural":"módulos"},
      {"id":"aw-05","name":"Interface responsiva e design de experiência do usuário","delivery_type":"unico","output_format":"texto","text_value":"Interface responsiva e design de experiência do usuário desenvolvidos conforme especificação aprovada."},
      {"id":"aw-06","name":"Desenvolvimento de front-end, back-end e banco de dados","delivery_type":"unico","output_format":"texto","text_value":"Desenvolvimento de front-end, back-end e banco de dados conforme arquitetura aprovada."},
      {"id":"aw-07","name":"Integração com CRM, ERP, agenda, e-commerce, mensageria e APIs aprovadas","delivery_type":"unico","output_format":"texto","text_value":"Integração com sistemas e APIs expressamente aprovados no escopo do projeto."},
      {"id":"aw-08","name":"Ambiente de homologação, testes funcionais e correção de defeitos","delivery_type":"unico","output_format":"texto","text_value":"Ambiente de homologação, testes funcionais e correção de defeitos identificados na fase de homologação."},
      {"id":"aw-09","name":"Implantação em produção, configuração de domínio e infraestrutura","delivery_type":"unico","output_format":"texto","text_value":"Implantação em produção, configuração de domínio e infraestrutura conforme contratado."},
      {"id":"aw-10","name":"Documentação, treinamento e handover","delivery_type":"unico","output_format":"texto","text_value":"Documentação, treinamento e handover entregues ao final do projeto conforme pacote contratado."},
      {"id":"aw-11","name":"Manutenção corretiva, preventiva ou evolutiva","delivery_type":"recorrente","output_format":"texto","text_value":"Manutenção corretiva, preventiva ou evolutiva conforme plano contratado."}
    ]'::jsonb,
    '[]'::jsonb, 5, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 7. Social Media
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Social Media',
    'social_media',
    'Conteúdo e Criação',
    'Híbrida (consultiva e executiva)',
    'Serviço de planejamento, criação e publicação de conteúdo para perfis sociais da CONTRATANTE, com foco em posicionamento, consistência editorial e relacionamento de marca. A CONTRATADA realiza as publicações previstas; a resposta a comentários e mensagens diretas permanece sob responsabilidade da CONTRATANTE, salvo contratação expressa de gestão de comunidade. Impulsionamento e mídia paga não estão incluídos neste serviço.',
    '[
      {"id":"sm-01","name":"Diagnóstico de perfis e posicionamento","delivery_type":"unico","output_format":"texto","text_value":"Diagnóstico de perfis e posicionamento realizado ao início do contrato."},
      {"id":"sm-02","name":"Planejamento mensal de conteúdo e calendário editorial","delivery_type":"recorrente","output_format":"texto","text_value":"Planejamento mensal de conteúdo e calendário editorial entregues no início de cada competência."},
      {"id":"sm-03","name":"Artes estáticas e carrosséis","delivery_type":"recorrente","output_format":"numero","unit":"arte","unit_plural":"artes"},
      {"id":"sm-04","name":"Legendas, chamadas e hashtags","delivery_type":"recorrente","output_format":"numero","unit":"legenda","unit_plural":"legendas"},
      {"id":"sm-05","name":"Roteiros para reels, vídeos curtos e stories","delivery_type":"recorrente","output_format":"numero","unit":"roteiro","unit_plural":"roteiros"},
      {"id":"sm-06","name":"Edição de reels e peças em motion","delivery_type":"recorrente","output_format":"numero","unit":"vídeo","unit_plural":"vídeos"},
      {"id":"sm-07","name":"Agendamento e publicação nos perfis da CONTRATANTE","delivery_type":"recorrente","output_format":"numero","unit":"publicação","unit_plural":"publicações"},
      {"id":"sm-08","name":"Acompanhamento básico de desempenho","delivery_type":"recorrente","output_format":"texto","text_value":"Acompanhamento básico de desempenho dos perfis durante a vigência do contrato."},
      {"id":"sm-09","name":"Relatório e recomendações editoriais","delivery_type":"recorrente","output_format":"numero","unit":"relatório","unit_plural":"relatórios"}
    ]'::jsonb,
    '[]'::jsonb, 6, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 8. Captação de Fotos
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Captação de Fotos',
    trim(both '_' from regexp_replace(lower(translate(
      'Captacao de Fotos',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Conteúdo e Criação',
    'Executiva',
    'Serviço de produção fotográfica para comunicação institucional, comercial, editorial, de produtos, eventos ou redes sociais. Inclui planejamento, deslocamento, captação, seleção, edição e tratamento das imagens conforme o pacote contratado. A quantidade de fotos, duração da sessão, local, equipe e formato de entrega serão definidos na contratação.',
    '[
      {"id":"cf-01","name":"Briefing e definição de objetivo da sessão","delivery_type":"unico","output_format":"texto","text_value":"Briefing e definição de objetivo da sessão fotográfica realizados antes da captação."},
      {"id":"cf-02","name":"Planejamento de pauta, referências e lista de cenas","delivery_type":"unico","output_format":"texto","text_value":"Planejamento de pauta, referências e lista de cenas entregues antes da sessão."},
      {"id":"cf-03","name":"Sessão fotográfica (direção e captação)","delivery_type":"unico","output_format":"numero","unit":"sessão","unit_plural":"sessões"},
      {"id":"cf-04","name":"Edição, correção de cor, enquadramento e tratamento das imagens","delivery_type":"unico","output_format":"texto","text_value":"Edição, correção de cor, enquadramento e tratamento aplicados às imagens selecionadas."},
      {"id":"cf-05","name":"Fotos finais entregues","delivery_type":"unico","output_format":"numero","unit":"foto","unit_plural":"fotos"},
      {"id":"cf-06","name":"Entrega em galeria ou pasta digital com arquivos finais","delivery_type":"unico","output_format":"texto","text_value":"Entrega em galeria ou pasta digital com arquivos finais nos formatos e resoluções definidos no pacote. Arquivos brutos/RAW não incluídos salvo previsão expressa."}
    ]'::jsonb,
    '[]'::jsonb, 7, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 9. Captação de Vídeos
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Captação de Vídeos',
    trim(both '_' from regexp_replace(lower(translate(
      'Captacao de Videos',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Conteúdo e Criação',
    'Executiva',
    'Serviço de pré-produção, gravação e pós-produção de vídeos para finalidades institucionais, comerciais, educacionais, eventos ou redes sociais. A quantidade, duração, formatos, locações, roteiro, equipe, locução, trilha, motion e demais recursos serão definidos na contratação. A entrega padrão compreende materiais finalizados, não os arquivos brutos, salvo previsão expressa.',
    '[
      {"id":"cv-01","name":"Briefing e objetivos de comunicação","delivery_type":"unico","output_format":"texto","text_value":"Briefing e objetivos de comunicação definidos ao início do projeto."},
      {"id":"cv-02","name":"Conceito criativo, pauta e roteiro","delivery_type":"unico","output_format":"texto","text_value":"Conceito criativo, pauta e roteiro entregues antes das gravações conforme escopo contratado."},
      {"id":"cv-03","name":"Planejamento de gravação, cronograma e lista de cenas","delivery_type":"unico","output_format":"texto","text_value":"Planejamento de gravação, cronograma e lista de cenas entregues antes da captação."},
      {"id":"cv-04","name":"Sessão de gravação","delivery_type":"unico","output_format":"numero","unit":"sessão","unit_plural":"sessões"},
      {"id":"cv-05","name":"Edição, correção de cor e tratamento de áudio","delivery_type":"unico","output_format":"texto","text_value":"Edição, correção de cor e tratamento de áudio aplicados conforme padrão de qualidade contratado."},
      {"id":"cv-06","name":"Inserção de legendas, trilhas, motion graphics e chamadas","delivery_type":"unico","output_format":"texto","text_value":"Inserção de legendas, trilhas, motion graphics e chamadas conforme itens expressamente contratados."},
      {"id":"cv-07","name":"Vídeos finalizados entregues","delivery_type":"unico","output_format":"numero","unit":"vídeo","unit_plural":"vídeos"},
      {"id":"cv-08","name":"Rodadas de ajuste","delivery_type":"pontual","output_format":"numero","unit":"rodada","unit_plural":"rodadas"}
    ]'::jsonb,
    '[]'::jsonb, 8, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 10. Design Gráfico
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Design Gráfico',
    trim(both '_' from regexp_replace(lower(translate(
      'Design Grafico',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Conteúdo e Criação',
    'Executiva',
    'Serviço de criação de materiais gráficos digitais e impressos, alinhados à identidade visual e ao briefing da CONTRATANTE. As peças, formatos, quantidades, especificações de produção e número de revisões serão definidos no pacote ou ordem de serviço. Arquivos editáveis não são incluídos, exceto quando expressamente contratados.',
    '[
      {"id":"dg-01","name":"Briefing e direcionamento visual","delivery_type":"unico","output_format":"texto","text_value":"Briefing e direcionamento visual realizados ao início de cada demanda."},
      {"id":"dg-02","name":"Posts estáticos, carrosséis, stories, capas e thumbnails","delivery_type":"recorrente","output_format":"numero","unit":"peça","unit_plural":"peças"},
      {"id":"dg-03","name":"Banners para sites, campanhas e mídia digital","delivery_type":"pontual","output_format":"numero","unit":"banner","unit_plural":"banners"},
      {"id":"dg-04","name":"Criativos para anúncios e e-mail marketing","delivery_type":"pontual","output_format":"numero","unit":"criativo","unit_plural":"criativos"},
      {"id":"dg-05","name":"Apresentações, propostas comerciais e materiais institucionais digitais","delivery_type":"pontual","output_format":"numero","unit":"material","unit_plural":"materiais"},
      {"id":"dg-06","name":"Materiais impressos (cartões, folders, flyers, cartazes, cardápios, catálogos)","delivery_type":"pontual","output_format":"numero","unit":"peça","unit_plural":"peças"},
      {"id":"dg-07","name":"E-books, infográficos, relatórios e peças editoriais","delivery_type":"pontual","output_format":"numero","unit":"peça","unit_plural":"peças"},
      {"id":"dg-08","name":"Artes para painéis, fachadas, outdoors e grande formato","delivery_type":"pontual","output_format":"numero","unit":"arte","unit_plural":"artes"},
      {"id":"dg-09","name":"Rodadas de revisão","delivery_type":"pontual","output_format":"numero","unit":"rodada","unit_plural":"rodadas"},
      {"id":"dg-10","name":"Arquivos finais prontos para publicação digital ou impressão","delivery_type":"unico","output_format":"texto","text_value":"Arquivos finais entregues prontos para publicação digital ou impressão nos formatos contratados. Arquivos editáveis não incluídos, salvo previsão expressa."}
    ]'::jsonb,
    '[]'::jsonb, 9, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 11. Criação de Identidade Visual
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.service_catalog (
    id, organization_id, name, slug, category,
    modality, scope, deliverables,
    sub_services, display_order, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_org_id,
    'Criação de Identidade Visual',
    trim(both '_' from regexp_replace(lower(translate(
      'Criacao de Identidade Visual',
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )), '[^a-z0-9]+', '_', 'g')),
    'Conteúdo e Criação',
    'Híbrida (consultiva e executiva)',
    'Serviço de diagnóstico, estratégia e desenvolvimento da identidade visual de marca da CONTRATANTE, destinado a traduzir seu posicionamento em um sistema visual consistente. O projeto compreende as entregas selecionadas na proposta e até duas rodadas de revisão, salvo condição diversa expressamente contratada.',
    '[
      {"id":"iv-01","name":"Briefing e diagnóstico de marca","delivery_type":"unico","output_format":"texto","text_value":"Briefing e diagnóstico de marca realizados ao início do projeto."},
      {"id":"iv-02","name":"Estudo de referências, público, posicionamento e concorrência","delivery_type":"unico","output_format":"texto","text_value":"Estudo de referências, público, posicionamento e concorrência entregue antes da criação."},
      {"id":"iv-03","name":"Direcionamento conceitual e painel semântico/moodboard","delivery_type":"unico","output_format":"texto","text_value":"Direcionamento conceitual e painel semântico (moodboard) apresentados para aprovação antes do desenvolvimento."},
      {"id":"iv-04","name":"Criação ou redesign de logotipo com variações","delivery_type":"unico","output_format":"texto","text_value":"Criação ou redesign de logotipo com variações: principal, reduzida, horizontal, vertical e monocromática conforme aplicável."},
      {"id":"iv-05","name":"Paleta de cores e definição de tipografias","delivery_type":"unico","output_format":"texto","text_value":"Paleta de cores e definição de tipografias do sistema de identidade visual."},
      {"id":"iv-06","name":"Elementos gráficos, padrões, ícones e diretrizes de aplicação","delivery_type":"unico","output_format":"texto","text_value":"Elementos gráficos, padrões, ícones e diretrizes de aplicação conforme itens contratados."},
      {"id":"iv-07","name":"Mockups de apresentação","delivery_type":"unico","output_format":"numero","unit":"mockup","unit_plural":"mockups"},
      {"id":"iv-08","name":"Manual de identidade visual","delivery_type":"unico","output_format":"texto","text_value":"Manual de identidade visual com diretrizes de uso, área de proteção, tamanhos mínimos e usos inadequados."},
      {"id":"iv-09","name":"Papelaria, assinaturas, templates e aplicações selecionadas","delivery_type":"unico","output_format":"texto","text_value":"Papelaria, assinaturas, templates e aplicações expressamente selecionadas na proposta."},
      {"id":"iv-10","name":"Arquivos finais (AI, SVG, PDF, PNG e JPG)","delivery_type":"unico","output_format":"texto","text_value":"Arquivos finais entregues em AI, SVG, PDF, PNG e JPG conforme aplicável."},
      {"id":"iv-11","name":"Rodadas de revisão","delivery_type":"pontual","output_format":"numero","unit":"rodada","unit_plural":"rodadas","text_value":null}
    ]'::jsonb,
    '[]'::jsonb, 10, now(), now()
  )
  ON CONFLICT (organization_id, name) DO NOTHING;

END $$;

-- =============================================================================
-- Registro de versão
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version)
VALUES ('service_catalog_seed_catalogo_oficial_v1')
ON CONFLICT (version) DO NOTHING;
