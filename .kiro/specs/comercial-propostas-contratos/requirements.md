# Documento de Requisitos

## Introdução

O **Módulo Comercial (Propostas e Contratos)** expande o CRM da agência com um sistema premium de criação, envio e acompanhamento de propostas comerciais, integrado ao pipeline de leads existente e ao cadastro de clientes. O objetivo central é transformar a proposta comercial em uma **landing page persuasiva e rastreável**, com aceitação digital em um clique e geração automática de contrato — eliminando processos manuais e reduzindo o ciclo de vendas.

O módulo opera **sem catálogo de serviços pré-cadastrado**: todos os serviços e seus valores são digitados diretamente durante a criação de cada proposta, refletindo a realidade da agência, onde o escopo e o preço são definidos de acordo com o perfil e a necessidade de cada cliente.

---

## Glossário

- **Proposal_Module**: Módulo de propostas desta aplicação (CRM da agência)
- **Contract_Module**: Módulo de contratos desta aplicação, já parcialmente existente (`contracts` table)
- **Proposal**: Documento comercial digital gerado para um cliente específico, acessível via link público como landing page
- **Proposal_Editor**: Interface visual de edição da proposta dentro do CRM
- **Proposal_Viewer**: Página pública acessível pelo cliente via link, sem autenticação
- **Proposal_Service**: Serviço individual listado na proposta, com nome, descrição e valor — digitados na hora, sem catálogo prévio
- **Proposal_Bonus**: Serviço marcado como bônus na proposta; exibe valor simbólico zerado para o cliente
- **Value_Comparison**: Bloco automático de comparação de valor percebido (total individual vs. valor do plano vs. economia)
- **Financial_Schedule**: Cronograma de parcelas gerado automaticamente a partir da primeira parcela, vencimento e recorrência
- **Digital_Acceptance**: Ato do cliente clicar em "Aprovar Proposta" na Proposal_Viewer, gerando aceite com IP, timestamp e trilha de auditoria
- **Contract_Template**: Template de contrato com variáveis substituíveis para geração automática após aceite digital
- **Proposal_Analytics**: Sistema de rastreamento de comportamento do cliente na Proposal_Viewer
- **Pipeline_Stage**: Etapa do pipeline de leads (`etapa_kanban` na tabela `leads`)
- **Timeline_CRM**: Feed de eventos cronológicos no cadastro do cliente no CRM
- **AI_Assistant**: Módulo de Inteligência Artificial para geração automática de textos da proposta
- **Closer**: Responsável comercial associado ao lead/proposta
- **Organization**: Organização autenticada (isolamento por RLS em todas as tabelas)

---

## Requisitos

---

### Requisito 1: Listagem e Gestão de Propostas

**User Story:** Como usuário da agência, quero visualizar todas as propostas criadas com filtros e métricas resumidas, para que eu possa gerenciar o pipeline comercial e identificar oportunidades em aberto.

#### Critérios de Aceitação

1. THE Proposal_Module SHALL exibir uma página de listagem de propostas acessível via menu "Comercial → Propostas"
2. THE Proposal_Module SHALL listar as propostas com as seguintes colunas: cliente, empresa, responsável comercial (Closer), data de criação, status, valor do plano, último acesso, total de visualizações e link público copiável; ao copiar o link, THE Proposal_Module SHALL exibir confirmação visual (ex: tooltip "Copiado!")
3. WHEN o usuário aplica filtros, THE Proposal_Module SHALL filtrar as propostas combinando todos os filtros ativos com lógica AND pelas dimensões: status (`rascunho`, `enviada`, `visualizada`, `aprovada`, `recusada`, `expirada`), Closer responsável, período de criação, empresa, campanha de origem, origem do lead e tags
4. THE Proposal_Module SHALL exibir indicadores de resumo no topo da listagem — total de propostas, total enviadas, total aprovadas, taxa de aprovação (aprovadas ÷ enviadas × 100%, exibindo "N/A" quando enviadas = 0) e valor total em propostas aprovadas — sempre refletindo o escopo global da organização, independente dos filtros ativos
5. WHEN o usuário clica em uma proposta, THE Proposal_Module SHALL abrir os detalhes da proposta exibindo: título, cliente, status, valor do plano, data de criação, link público, painel de analytics e as ações disponíveis (editar, duplicar, enviar, arquivar, excluir)
6. WHEN o usuário clica em "Nova Proposta", THE Proposal_Editor SHALL abrir o formulário de criação de proposta
7. IF a organização não possuir nenhuma proposta cadastrada, THEN THE Proposal_Module SHALL exibir estado vazio com instrução "Crie sua primeira proposta" e um botão "Nova Proposta" visível

---

### Requisito 2: Criação e Edição da Proposta

**User Story:** Como usuário da agência, quero criar uma proposta visual e personalizada para um cliente específico, digitando os serviços e valores diretamente no momento da criação, para que eu possa enviar uma proposta adequada ao perfil e à necessidade de cada cliente.

#### Critérios de Aceitação

1. WHEN o usuário inicia a criação de uma proposta, THE Proposal_Editor SHALL exigir a seleção de um cliente cadastrado no CRM (`clients` table) antes de liberar os demais campos
2. WHEN um cliente é selecionado, THE Proposal_Editor SHALL preencher automaticamente os campos: nome do cliente, empresa, CNPJ, e-mail e WhatsApp a partir dos dados da tabela `clients`
3. THE Proposal_Editor SHALL permitir editar o bloco **Hero** da proposta com os seguintes campos: logotipo (upload), título, subtítulo, mensagem personalizada, vídeo opcional (URL embed), imagem de destaque opcional, botão de WhatsApp (texto + número de destino configurável) e botão de Aprovar (texto configurável)
4. THE Proposal_Editor SHALL disponibilizar as seguintes seções editáveis, cada uma com editor de texto rico e controle individual de visibilidade (ativar/ocultar, visível por padrão): Apresentação, Diagnóstico, Objetivos, Estratégia, Solução, Escopo, Cronograma, Metodologia, Diferenciais, Cases, Depoimentos, FAQ, Garantias e Considerações Finais
5. THE Proposal_Editor SHALL disponibilizar uma seção de **Serviços** onde o usuário adiciona cada serviço manualmente com os campos: nome do serviço (máx. 120 caracteres), descrição (máx. 500 caracteres) e valor individual em R$ (mínimo R$ 0,01, máximo R$ 999.999,99) — sem catálogo pré-cadastrado ou seleção de serviços existentes
6. WHEN o usuário adiciona um serviço, THE Proposal_Editor SHALL permitir marcar o serviço como **Bônus**, exibindo o valor para o cliente como R$ 0,00 com etiqueta "Bônus Exclusivo" na Proposal_Viewer e mantendo o valor real apenas internamente para cálculo da economia; WHEN o usuário remove a marcação de bônus, THE Proposal_Editor SHALL restaurar o valor original do serviço no Value_Comparison
7. THE Proposal_Editor SHALL calcular e exibir automaticamente o **Value_Comparison** com: lista de serviços com checkmark e valor, bônus destacados com ícone 🎁, total individual = soma dos valores reais de todos os serviços, valor do plano informado pelo usuário, economia = total_individual − valor_do_plano e percentual_economizado = (economia ÷ total_individual) × 100
8. WHEN o usuário altera o valor do plano, adiciona, edita ou remove qualquer serviço, THE Proposal_Editor SHALL recalcular o Value_Comparison automaticamente e em tempo real
9. THE Proposal_Editor SHALL disponibilizar o bloco **Cronograma Financeiro** com campos: valor e data da primeira parcela, dia de vencimento das parcelas recorrentes, tipo de recorrência (mensal, trimestral, semestral, anual), número de parcelas (máx. 360) e possibilidade de registrar reajustes por mês específico (valor alternativo para a parcela daquele mês)
10. WHEN o cronograma financeiro é preenchido, THE Proposal_Editor SHALL gerar automaticamente a tabela do Financial_Schedule com as colunas: Nº Parcela, Mês de Referência, Valor e Data de Vencimento
11. THE Proposal_Editor SHALL exibir um bloco de **CTA Final** com o botão "Aprovar Proposta" com texto e cor configuráveis
12. WHEN o usuário salva a proposta, THE Proposal_Module SHALL persistir todos os dados na tabela `proposals` com `status = 'rascunho'` e `organization_id` da organização autenticada
13. IF o usuário tentar salvar uma proposta sem cliente selecionado ou sem ao menos um serviço adicionado, THEN THE Proposal_Editor SHALL exibir mensagem de validação e impedir o salvamento
14. WHEN uma proposta é criada, THE Proposal_Editor SHALL gerar automaticamente um `public_slug` único; IF houver colisão, THEN THE Proposal_Editor SHALL regenerar o slug até obter unicidade antes de persistir o registro

---

### Requisito 3: Link Público e Visualização pelo Cliente (Proposal_Viewer)

**User Story:** Como cliente da agência, quero acessar a proposta via link único sem precisar de login, para que eu possa visualizar o conteúdo comercial de forma profissional e tomar minha decisão de aprovação.

#### Critérios de Aceitação

1. THE Proposal_Module SHALL disponibilizar a proposta em uma URL pública no formato `/proposta/:public_slug` acessível sem autenticação
2. WHEN o cliente acessa a Proposal_Viewer com um `public_slug` válido e status `enviada`, `visualizada` ou `aprovada`, THE Proposal_Module SHALL exibir a proposta como landing page com todas as seções ativas renderizadas em ordem crescente de `section_order`, iniciando pelo bloco Hero
3. WHEN o cliente acessa a Proposal_Viewer, THE Proposal_Viewer SHALL exibir o Value_Comparison com: serviços com checkmark verde, bônus com ícone 🎁 e valor "De: R$ X → Por: R$ 0,00 (Bônus Exclusivo)", total individual riscado visualmente, valor do plano destacado, economia em destaque verde e percentual economizado
4. WHEN o cliente acessa a Proposal_Viewer, THE Proposal_Viewer SHALL exibir o Financial_Schedule como tabela com as colunas: parcela, mês de referência, valor e data de vencimento
5. IF o `public_slug` não corresponder a nenhuma proposta da organização, THEN THE Proposal_Viewer SHALL exibir mensagem "Proposta não encontrada" sem expor nenhum dado interno; IF a proposta possuir status `rascunho`, `recusada` ou `expirada`, THEN THE Proposal_Viewer SHALL exibir mensagem "Esta proposta não está mais disponível" sem revelar o status ou dados da organização
6. WHEN o cliente clica no botão de WhatsApp configurado na proposta, THE Proposal_Viewer SHALL abrir o WhatsApp com mensagem pré-configurada para o número registrado; IF nenhum número de WhatsApp estiver configurado, THEN o botão de WhatsApp SHALL ser ocultado automaticamente
7. THE Proposal_Viewer SHALL ser responsiva, renderizando corretamente em viewport móvel (≥ 320px) e desktop (≥ 1024px), sem scroll horizontal em nenhum breakpoint
8. IF o `public_slug` for válido mas a proposta tiver status `aprovada`, THEN THE Proposal_Viewer SHALL exibir a proposta em modo somente-leitura sem o botão "Aprovar Proposta"

---

### Requisito 4: Rastreamento de Comportamento (Proposal_Analytics)

**User Story:** Como usuário da agência, quero saber exatamente como cada cliente interagiu com a proposta enviada, para que eu possa priorizar follow-ups e entender o engajamento comercial.

#### Critérios de Aceitação

1. WHEN a Proposal_Viewer é carregada pelo cliente, THE Proposal_Analytics SHALL registrar na tabela `proposal_events`: evento `visualizacao`, timestamp UTC, IP do visitante, cidade (via geolocalização por IP — se falhar, cidade persiste como nulo sem bloquear o registro), dispositivo (mobile/desktop), navegador, sistema operacional e identificador de sessão único
2. WHEN o cliente interage com a Proposal_Viewer durante uma sessão, THE Proposal_Analytics SHALL registrar os seguintes eventos — cada threshold de scroll disparando no máximo uma vez por sessão: `scroll_parcial` (ao atingir 50% da página), `scroll_completo` (ao atingir 90% da página), `clique_whatsapp`, `clique_aprovar` e `aprovacao_confirmada`
3. WHEN qualquer evento é registrado, THE Proposal_Analytics SHALL atualizar para a proposta correspondente: total de visualizações (sessões únicas por IP, onde sessão = janela de 30 min de inatividade), total de acessos (incluindo revisitas), tempo de sessão (delta entre primeiro e último evento da sessão em segundos) e timestamps de primeiro e último acesso
4. WHEN o usuário da agência acessa os detalhes de uma proposta no CRM, THE Proposal_Module SHALL exibir painel de Analytics com: total de visualizações, total de acessos, tempo médio de sessão, último acesso, dispositivo mais usado, lista dos últimos 50 acessos (data, IP, cidade, dispositivo) e lista cronológica de eventos por sessão
5. IF o serviço de geolocalização retornar erro, THEN THE Proposal_Analytics SHALL persistir o registro de evento com `cidade = null`, sem afetar os demais campos
6. THE Proposal_Analytics SHALL aplicar isolamento por `organization_id` em todas as operações de leitura e escrita — nenhum dado de analytics de uma organização deve ser acessível por outra

---

### Requisito 5: Aceite Digital e Aprovação da Proposta

**User Story:** Como cliente da agência, quero aprovar a proposta digitalmente com um clique, para que o processo de contratação seja concluído de forma ágil, segura e rastreável.

#### Critérios de Aceitação

1. WHEN o cliente clica em "Aprovar Proposta" na Proposal_Viewer, THE Proposal_Module SHALL exibir um modal de confirmação solicitando: nome completo do aprovador, CPF do aprovador (validado no formato XXX.XXX.XXX-XX ou 11 dígitos numéricos) e aceite explícito dos termos ("Declaro que li e aceito os termos desta proposta")
2. WHEN o cliente confirma o aceite com todos os campos válidos, THE Proposal_Module SHALL registrar na tabela `proposal_acceptances`: `proposal_id`, nome do aprovador, CPF do aprovador, IP de origem, user agent, timestamp UTC, hash SHA-256 do conteúdo serializado da proposta no momento do aceite e o conteúdo serializado completo (snapshot imutável)
3. WHEN o aceite é registrado com sucesso, THE Proposal_Module SHALL atualizar `proposals.status = 'aprovada'` e registrar o evento `aprovacao_confirmada` no Proposal_Analytics
4. WHEN o aceite é registrado com sucesso, THE Proposal_Module SHALL disparar automaticamente a geração do contrato a partir do Contract_Template associado à organização (ver Requisito 7)
5. WHEN o aceite é registrado com sucesso, THE Proposal_Module SHALL registrar na Timeline_CRM do cliente o evento: "Proposta [título] aprovada digitalmente por [nome do aprovador] em [data/hora UTC]"
6. IF o aprovador não preencher todos os campos obrigatórios ou o CPF for inválido, THEN THE Proposal_Module SHALL destacar os campos inválidos e impedir a confirmação sem fechar o modal
7. IF a operação de registro do aceite falhar (erro de rede ou banco), THEN THE Proposal_Module SHALL exibir mensagem de erro e manter o modal aberto para nova tentativa, sem alterar o status da proposta
8. IF a proposta já possuir status `aprovada` quando o cliente tentar confirmar um segundo aceite, THEN THE Proposal_Module SHALL rejeitar o registro sem criar duplicata em `proposal_acceptances` e exibir mensagem "Esta proposta já foi aprovada"
9. THE Proposal_Module SHALL disponibilizar para o usuário da agência o comprovante de aceite com todos os dados registrados, exportável em PDF

---

### Requisito 6: Integração com Pipeline de Leads

**User Story:** Como usuário da agência, quero criar propostas diretamente a partir do pipeline de leads e ter o progresso atualizado automaticamente, para que o processo comercial seja fluido e sem retrabalho.

#### Critérios de Aceitação

1. WHEN um lead está na etapa `proposta_enviada` do pipeline, THE Proposal_Module SHALL exibir o botão "Criar Proposta" no card do lead e no modal de detalhes do lead; a tabela `proposals` SHALL armazenar `lead_id` como FK referenciando o lead de origem
2. WHEN o usuário clica em "Criar Proposta" a partir do pipeline e o lead possui cliente vinculado, THE Proposal_Editor SHALL abrir com o cliente já pré-selecionado e os campos nome, empresa, e-mail e WhatsApp preenchidos; IF o lead não possuir cliente vinculado na tabela `clients`, THEN THE Proposal_Editor SHALL abrir com o campo de seleção de cliente em branco e exibir aviso "Nenhum cliente vinculado a este lead — selecione manualmente"
3. WHEN uma proposta vinculada a um lead é aprovada, THE Proposal_Module SHALL atualizar automaticamente o `etapa_kanban` do lead para `efetivados`
4. WHEN um lead avança para a etapa `emissao_contrato` no pipeline, THE Proposal_Module SHALL exibir as propostas aprovadas daquele lead como opções selecionáveis para geração de contrato
5. WHEN o usuário visualiza o pipeline, THE Proposal_Module SHALL exibir nas colunas das etapas o número de propostas ativas (status `enviada` ou `visualizada`) vinculadas aos leads daquela etapa; colunas sem propostas ativas não exibem contador

---

### Requisito 7: Geração Automática de Contrato por Template

**User Story:** Como usuário da agência, quero que o contrato seja gerado automaticamente após a aprovação da proposta, utilizando um template com variáveis preenchidas pelos dados do cliente e da proposta, para eliminar o retrabalho de digitação e reduzir erros.

#### Critérios de Aceitação

1. THE Contract_Module SHALL disponibilizar uma tela de gerenciamento de templates de contrato acessível via "Comercial → Configurações de Contratos"
2. THE Contract_Module SHALL suportar as seguintes variáveis de substituição no template: `{{cliente}}`, `{{empresa}}`, `{{cnpj}}`, `{{cpf}}`, `{{valor}}`, `{{plano}}`, `{{servicos}}`, `{{bonificacoes}}`, `{{vencimento}}`, `{{primeiro_pagamento}}`, `{{data}}`, `{{consultor}}`, `{{escopo}}`, `{{cronograma}}`
3. WHEN o aceite digital é registrado, THE Contract_Module SHALL criar automaticamente um registro na tabela `contracts` com `client_id`, `organization_id`, `proposal_id` (FK), valor do plano, data do contrato, lista de serviços contratados e `status = 'ativo'`
4. WHEN o contrato é gerado, THE Contract_Module SHALL substituir todas as variáveis do template pelos valores da proposta aprovada e persistir: o conteúdo final como texto na tabela `contracts` e como PDF no Supabase Storage com URL armazenada no registro do contrato
5. IF nenhum template de contrato estiver configurado para a organização, THEN THE Contract_Module SHALL usar um template padrão do sistema, gerar o contrato normalmente e exibir ao usuário da agência uma notificação in-app: "Contrato gerado com template padrão. Personalize seu template em Configurações de Contratos."
6. WHEN o contrato é gerado, THE Contract_Module SHALL registrar na Timeline_CRM do cliente o evento: "Contrato gerado automaticamente a partir da proposta [título] em [data/hora UTC]"
7. THE Contract_Module SHALL manter versionamento imutável de contratos: cada geração cria um novo registro com número de versão incrementado; edições posteriores criam nova versão sem alterar ou excluir a versão anterior

---

### Requisito 8: Aba Comercial no Cadastro do Cliente

**User Story:** Como usuário da agência, quero visualizar e gerenciar todas as propostas e contratos de um cliente diretamente na tela de detalhes do cliente no CRM, para ter uma visão completa do relacionamento comercial sem precisar navegar por múltiplas telas.

#### Critérios de Aceitação

1. THE Proposal_Module SHALL adicionar a aba **Comercial** como última aba na tela de detalhes do cliente, após as abas existentes
2. WHEN o usuário acessa a aba Comercial de um cliente, THE Proposal_Module SHALL exibir as sub-abas nesta ordem: Propostas, Contratos, Timeline, Aprovações, Arquivos
3. THE Proposal_Module SHALL exibir na sub-aba **Propostas** a lista de todas as propostas do cliente com: título, data de criação, status, valor do plano, total de visualizações e data do último acesso; os botões de ação disponíveis por status são — `rascunho`: editar, excluir; `enviada`/`visualizada`: visualizar, duplicar, copiar link, arquivar; `aprovada`: visualizar, duplicar; `expirada`/`recusada`: duplicar
4. THE Proposal_Module SHALL exibir na sub-aba **Contratos** a lista de contratos vinculados ao cliente com: título, data, status, valor, número de versão e link para o PDF do contrato — integrando com a tabela `contracts` existente
5. THE Proposal_Module SHALL exibir na sub-aba **Timeline** todos os eventos comerciais do cliente em ordem cronológica reversa: proposta criada, proposta enviada, proposta visualizada (com contagem acumulada), proposta aprovada, contrato gerado, contrato enviado e contrato assinado
6. THE Proposal_Module SHALL exibir na sub-aba **Aprovações** os registros de aceite digital com: data/hora, nome do aprovador, CPF mascarado no formato `XXX.***.***-XX`, IP de origem e botão de download do comprovante em PDF
7. THE Proposal_Module SHALL exibir na sub-aba **Arquivos** os PDFs gerados para propostas e contratos com: nome do arquivo, data de geração, número de versão e botão de download
8. IF uma sub-aba não possuir registros, THEN THE Proposal_Module SHALL exibir estado vazio com mensagem contextual (ex: "Nenhuma proposta criada para este cliente ainda")

---

### Requisito 9: Envio de Proposta e Comunicação

**User Story:** Como usuário da agência, quero enviar a proposta ao cliente via link, WhatsApp ou e-mail diretamente do CRM, para que o processo de entrega seja rápido e rastreável.

#### Critérios de Aceitação

1. WHEN o usuário clica em "Enviar Proposta", THE Proposal_Module SHALL disponibilizar as opções: (a) copiar link público — copia para clipboard e exibe confirmação "Copiado!"; (b) enviar via WhatsApp — abre WhatsApp Web com mensagem pré-formatada; (c) enviar por e-mail — abre modal com assunto e corpo pré-preenchidos e campo "Para" preenchido com o e-mail do cliente
2. WHEN a proposta é enviada por qualquer um dos três canais, THE Proposal_Module SHALL atualizar `proposals.status = 'enviada'` e registrar na Timeline_CRM o evento `proposta_enviada` com canal utilizado (whatsapp/email/link), timestamp UTC e identificador do usuário que enviou
3. WHEN o usuário acessa a opção de envio via WhatsApp, THE Proposal_Module SHALL gerar mensagem pré-formatada contendo link da proposta, nome do cliente e nome do Closer responsável, editável pelo usuário antes de abrir o WhatsApp Web
4. WHERE templates de e-mail estiverem configurados para a organização, THE Proposal_Module SHALL disponibilizá-los para seleção no modal de envio por e-mail, com suporte às variáveis `{{cliente}}`, `{{consultor}}`, `{{link_proposta}}` e `{{valor_plano}}`
5. WHEN a Proposal_Viewer é acessada pela primeira vez após o status ser `enviada`, THE Proposal_Module SHALL atualizar `proposals.status = 'visualizada'` e enviar notificação in-app ao Closer responsável contendo: nome do cliente, título da proposta e timestamp do primeiro acesso
6. IF qualquer operação de envio falhar (erro de rede, clipboard bloqueado, etc.), THEN THE Proposal_Module SHALL exibir mensagem de erro descritiva e manter o status da proposta inalterado

---

### Requisito 10: Inteligência Artificial para Geração de Conteúdo

**User Story:** Como usuário da agência, quero usar IA para gerar automaticamente o conteúdo das seções da proposta, para que o processo de criação seja mais rápido e os textos sejam mais persuasivos.

#### Critérios de Aceitação

1. THE AI_Assistant SHALL disponibilizar botão de geração automática em cada uma das seguintes seções da proposta: Apresentação, Diagnóstico, Objetivos, Estratégia, Escopo, Cronograma, FAQ e Proposta Completa
2. WHEN o usuário solicita geração de conteúdo para uma seção, THE AI_Assistant SHALL enviar ao serviço de IA, como contexto obrigatório: nome do cliente, empresa, nicho do lead (quando disponível), lista de serviços da proposta com seus valores e a seção de destino; IF algum campo de contexto obrigatório estiver ausente, THE AI_Assistant SHALL exibir aviso indicando qual dado está faltando antes de acionar a IA
3. WHEN o usuário solicita geração de conteúdo fora das seções da proposta, THE AI_Assistant SHALL disponibilizar geração de: texto completo do contrato, mensagem de follow-up, mensagem de WhatsApp pós-proposta e e-mail pós-proposta
4. WHEN o AI_Assistant recebe resposta do serviço de IA, THE Proposal_Editor SHALL exibir o resultado em modal de pré-visualização com editor de texto e opções: "Usar texto gerado" (substitui conteúdo da seção), "Regenerar" (nova chamada à IA) e "Cancelar" (fecha modal sem alterar a seção)
5. IF o serviço de IA não responder em até 30 segundos ou retornar erro, THEN THE AI_Assistant SHALL exibir mensagem "Não foi possível gerar o conteúdo. Tente novamente ou preencha manualmente." e fechar o indicador de carregamento sem bloquear o editor
6. WHEN o usuário aciona a geração de IA, THE Proposal_Editor SHALL exibir indicador de carregamento na seção correspondente até receber resposta ou atingir o timeout

---

### Requisito 11: Dashboard Comercial e Analytics

**User Story:** Como gestor da agência, quero um dashboard consolidado com métricas comerciais de propostas e contratos, para que eu possa acompanhar o desempenho do time e tomar decisões baseadas em dados.

#### Critérios de Aceitação

1. THE Proposal_Module SHALL disponibilizar uma página de Dashboard Comercial acessível via "Comercial → Analytics"
2. WHEN o usuário acessa o Dashboard Comercial, THE Proposal_Module SHALL exibir por padrão os indicadores dos últimos 30 dias: total de propostas criadas, total enviadas, total aprovadas, taxa de conversão (aprovadas ÷ enviadas × 100%, exibindo "N/A" quando enviadas = 0 no período), valor total em propostas aprovadas, tempo médio até aprovação (delta entre `created_at` e timestamp do aceite em `proposal_acceptances`, em dias), número médio de visualizações por proposta e volume de propostas por Closer responsável
3. WHEN o usuário seleciona um período personalizado, THE Proposal_Module SHALL recalcular e exibir todos os indicadores do critério 2 filtrados para o intervalo de datas informado
4. WHILE um período estiver selecionado, THE Proposal_Module SHALL exibir um ranking de Closers ordenado por número de propostas aprovadas no período e, como critério de desempate, valor total fechado
5. WHILE um período estiver selecionado, THE Proposal_Module SHALL exibir gráfico de funil com as etapas Criadas → Enviadas → Visualizadas → Aprovadas, exibindo volume absoluto e taxa de conversão de cada etapa em relação à anterior (volume_etapa_N ÷ volume_etapa_N-1 × 100%)
6. WHILE um período estiver selecionado, THE Proposal_Module SHALL exibir as 10 propostas com maior engajamento no período, ordenadas primeiramente por total de visualizações e, como critério de desempate, por tempo médio de sessão (decrescente)

---

### Requisito 12: Integridade de Dados, Segurança e Isolamento Multi-Tenant

**User Story:** Como desenvolvedor e como agência, quero que todos os dados de propostas e contratos sejam isolados por organização, com integridade garantida e acesso controlado por RLS, para que nenhum dado vaze entre organizações e a auditoria seja completa.

#### Critérios de Aceitação

1. THE Proposal_Module SHALL aplicar Row Level Security (RLS) cobrindo SELECT, INSERT, UPDATE e DELETE nas tabelas `proposals`, `proposal_services`, `proposal_sections`, `proposal_events`, `proposal_acceptances`, `proposal_templates` e `contract_templates`, garantindo que operações de uma organização retornem resultado vazio (não erro de permissão) para registros de outra organização
2. WHEN uma nova proposta é criada, THE Proposal_Module SHALL garantir que o `public_slug` gerado seja único na tabela `proposals`; IF houver colisão, THEN THE Proposal_Module SHALL rejeitar o INSERT e regenerar o slug sem persistir o registro conflitante
3. WHEN a Proposal_Viewer renderiza uma proposta, THE Proposal_Module SHALL garantir que nenhum identificador interno (`id`, `organization_id`, `client_id`) apareça na URL, em atributos HTML visíveis ou em dados embutidos no HTML — utilizando exclusivamente o `public_slug` como referência pública
4. THE Proposal_Module SHALL registrar trilha de auditoria para cada uma das seguintes ações: criação de proposta, edição de proposta, envio de proposta, aprovação de proposta, geração de contrato e exclusão (soft delete) de proposta; cada entrada de auditoria SHALL conter no mínimo: `organization_id`, `user_id`, tipo da ação, `proposal_id` e timestamp UTC
5. IF uma proposta for excluída pelo usuário da agência, THEN THE Proposal_Module SHALL aplicar soft delete definindo `deleted_at = now()` e preservar sem alteração os registros relacionados nas tabelas `proposal_acceptances`, `proposal_events`, `proposal_services` e `proposal_sections`
6. IF o usuário da agência tentar enviar uma proposta com `plan_value = 0` ou `plan_value` ausente, THEN THE Proposal_Module SHALL rejeitar a ação, exibir mensagem "O valor do plano deve ser maior que zero para enviar a proposta" e manter o status da proposta inalterado
7. WHEN qualquer operação tenta atualizar ou excluir um registro em `proposal_acceptances`, THE Proposal_Module SHALL rejeitar a operação com erro de permissão, garantindo que o snapshot e o hash SHA-256 registrados no momento do aceite permaneçam imutáveis

---

## Propriedades de Corretude (Property-Based Testing)

### P1 — Cálculo do Value_Comparison (Invariante)

**Propriedade:** Para qualquer lista de serviços com valores positivos:
- `total_individual = soma(valor_real de todos os serviços)`
- `economia = total_individual − valor_do_plano`
- `percentual_economizado = (economia ÷ total_individual) × 100`
- `economia >= 0` quando `valor_do_plano <= total_individual`

**Tipo:** Invariante matemática — testável como property test puro.

---

### P2 — Unicidade do public_slug (Invariante)

**Propriedade:** Para qualquer número de propostas criadas em qualquer organização, nunca dois registros na tabela `proposals` devem ter o mesmo `public_slug`.

**Tipo:** Invariante de unicidade — verificável com constraint UNIQUE no banco.

---

### P3 — Imutabilidade do Snapshot de Aceite (Invariante)

**Propriedade:** O hash SHA-256 de `proposal_acceptances.proposal_snapshot` deve ser igual ao hash registrado no momento do aceite, independente de quantas edições posteriores a proposta tenha sofrido.

**Tipo:** Invariante de imutabilidade — verificável recalculando o hash a partir do snapshot armazenado.

---

### P4 — Consistência do Cronograma Financeiro (Round Trip)

**Propriedade:** Dado um cronograma com `N` parcelas, `valor_parcela` e `data_primeira_parcela` (recorrência mensal, sem reajustes):
- O número de linhas geradas deve ser exatamente `N`
- A soma dos valores deve ser `N × valor_parcela`
- A data da parcela `i` deve ser `data_primeira_parcela + (i−1) meses`

**Tipo:** Invariante de geração determinística — testável como property test com gerador de parâmetros aleatórios.

---

### P5 — Idempotência do Aceite Digital (Idempotência)

**Propriedade:** Registrar `aprovacao_confirmada` em uma proposta já com `status = 'aprovada'` não deve criar duplicata em `proposal_acceptances` nem alterar nenhum campo existente do registro original.

**Tipo:** Idempotência — testável via chamadas repetidas à função de aceite.

---

### P6 — Isolamento Multi-Tenant (Metamórfica)

**Propriedade:** Uma query à tabela `proposals` autenticada com `organization_id = A` jamais deve retornar registros com `organization_id = B`, para quaisquer organizações `A ≠ B`.

**Tipo:** Propriedade de isolamento — verificável com property test gerando pares de organizações distintas e consultando de forma cruzada.
