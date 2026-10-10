# Documento de Requisitos

## Introdução

O Módulo Fiscal é uma nova seção independente do Maestr.IA que permite às agências emitir, gerenciar e cancelar Notas Fiscais de Serviços Eletrônicas (NFS-e) diretamente no CRM, integrado à API REST da plataforma Notaas. O módulo suporta emissão manual vinculada a contratos ou pagamentos, emissão automática ao confirmar recebimento de pagamento (configurável), rastreamento de status via webhooks HMAC-SHA256, e exibição contextual das notas dentro dos módulos de Contratos e Pagamentos existentes.

---

## Glossário

- **Fiscal_Module**: O módulo de gestão fiscal do Maestr.IA, acessível via rota `/fiscal`.
- **NFS-e**: Nota Fiscal de Serviços Eletrônica, documento fiscal digital regulamentado pela LC 116/2003.
- **Notaas_API**: API REST da plataforma Notaas (`https://platform.notaas.com.br`) utilizada para emissão de NFS-e, autenticada via header `x-api-key`.
- **Invoice**: Registro interno de uma NFS-e na tabela `invoices` do Supabase.
- **Tomador**: Pessoa física ou jurídica destinatária da NFS-e (cliente da agência).
- **Prestador**: A agência emissora da NFS-e, identificada pelo CNPJ configurado nas Configurações Fiscais.
- **Fiscal_Settings**: Configurações fiscais da organização armazenadas em `organization_integrations` com `integration_type = 'notaas'`.
- **Webhook_Handler**: Edge Function do Supabase responsável por receber e processar eventos de webhook da Notaas.
- **Competência**: Mês/ano de referência da prestação do serviço, no formato `YYYY-MM`.
- **ISS**: Imposto Sobre Serviços, tributo municipal incidente sobre prestação de serviços.
- **LC 116**: Lei Complementar 116/2003, que define os códigos de serviço para NFS-e no Brasil.
- **Regime_Tributário**: Enquadramento fiscal da empresa emissora (Simples Nacional, Lucro Presumido, Lucro Real).
- **Certificado_A1**: Certificado digital no formato A1 (arquivo `.pfx`/`.p12`) utilizado para assinar documentos fiscais.
- **CNPJ**: Cadastro Nacional da Pessoa Jurídica, identificador fiscal de empresas no Brasil.
- **CPF**: Cadastro de Pessoas Físicas, identificador fiscal de pessoas físicas no Brasil.

---

## Requisitos

### Requisito 1: Configurações Fiscais

**User Story:** Como administrador da agência, quero configurar as credenciais e parâmetros fiscais da organização, para que o sistema possa emitir NFS-e em nome da agência com as informações corretas.

#### Critérios de Aceitação

1. THE Fiscal_Settings SHALL armazenar os seguintes campos na tabela `organization_integrations` com `integration_type = 'notaas'`: `api_key`, `cnpj_emissor`, `codigo_servico_padrao`, `aliquota_iss_padrao`, `regime_tributario`, `descricao_servico_padrao`, `codigos_servico_por_tipo_contrato` (objeto JSON), `sandbox_mode` (booleano).
2. WHEN o administrador salvar as Fiscal_Settings, THE Fiscal_Settings SHALL validar que o campo `cnpj_emissor` contém exatamente 14 dígitos numéricos antes de persistir.
3. WHEN o administrador salvar as Fiscal_Settings, THE Fiscal_Settings SHALL validar que o campo `aliquota_iss_padrao` contém um valor numérico entre 0,00 e 100,00 antes de persistir.
4. WHEN o administrador salvar as Fiscal_Settings, THE Fiscal_Settings SHALL validar que o campo `api_key` não está vazio antes de persistir.
5. THE Fiscal_Settings SHALL exibir o valor do campo `api_key` mascarado (formato `sk_****xxxx`) na interface de configurações.
6. WHERE o campo `sandbox_mode` estiver habilitado, THE Notaas_API SHALL receber todas as requisições de emissão direcionadas ao ambiente de sandbox da Notaas.
7. THE Fiscal_Settings SHALL permitir o cadastro de até 20 mapeamentos de `codigos_servico_por_tipo_contrato`, associando cada tipo de contrato (`contract_type` da tabela `contracts`) a um código LC 116.
8. IF o administrador tentar salvar Fiscal_Settings sem permissão de `can_edit` no módulo `fiscal`, THEN THE Fiscal_Module SHALL retornar erro de autorização sem persistir nenhum dado.
9. THE Fiscal_Settings SHALL ser acessíveis exclusivamente por usuários com role `owner` ou `admin`, ou com permissão explícita `can_edit` no módulo `settings`.

---

### Requisito 2: Emissão Manual de NFS-e

**User Story:** Como usuário com permissão fiscal, quero emitir uma NFS-e manualmente vinculada a um contrato ou pagamento, para que eu possa documentar fiscalmente serviços prestados de forma pontual.

#### Critérios de Aceitação

1. WHEN o usuário acionar a emissão manual, THE Fiscal_Module SHALL exibir um formulário com os campos: `client_id` (seleção de cliente), `contract_id` (opcional), `payment_id` (opcional), `valor_servico`, `codigo_servico`, `descricao_servico`, `competencia` (mês/ano), `aliquota_iss`.
2. WHEN o formulário de emissão for submetido, THE Fiscal_Module SHALL pré-preencher `codigo_servico` e `aliquota_iss` com os valores das Fiscal_Settings, permitindo sobrescrita pelo usuário.
3. WHEN um `contract_id` for selecionado no formulário, THE Fiscal_Module SHALL pré-preencher `codigo_servico` com o código mapeado para o `contract_type` do contrato, se existir mapeamento nas Fiscal_Settings.
4. WHEN o formulário de emissão for submetido com dados válidos, THE Fiscal_Module SHALL criar um registro na tabela `invoices` com `status = 'processando'` antes de chamar a Notaas_API.
5. WHEN o registro Invoice for criado com `status = 'processando'`, THE Fiscal_Module SHALL chamar `POST /api/v1/emitir` na Notaas_API com o payload contendo: `tomador` (cnpj/cpf, nome, email, endereço do cliente), `servico` (codigo, descricao), `valores` (total, aliquotaIss), `competencia`.
6. WHEN a Notaas_API retornar sucesso na emissão, THE Fiscal_Module SHALL atualizar o Invoice com os campos: `notaas_id`, `notaas_protocol`, `numero`, `pdf_url`, `xml_url`, `emitida_em`, e `status = 'autorizada'`.
7. IF a Notaas_API retornar erro na emissão, THEN THE Fiscal_Module SHALL atualizar o Invoice com `status = 'rejeitada'` e `erro_mensagem` contendo a mensagem de erro retornada pela API.
8. WHEN o formulário de emissão for submetido, THE Fiscal_Module SHALL validar que `valor_servico` é maior que 0,00 antes de criar o Invoice.
9. WHEN o formulário de emissão for submetido, THE Fiscal_Module SHALL validar que `competencia` está no formato `YYYY-MM` e representa um mês válido antes de criar o Invoice.
10. IF o usuário não tiver permissão `can_create` no módulo `fiscal`, THEN THE Fiscal_Module SHALL ocultar o botão de emissão manual e retornar erro 403 se a ação for tentada diretamente.

---

### Requisito 3: Emissão Automática ao Confirmar Pagamento

**User Story:** Como administrador, quero que o sistema emita automaticamente uma NFS-e quando um pagamento for marcado como recebido, para que a documentação fiscal seja gerada sem intervenção manual.

#### Critérios de Aceitação

1. THE Fiscal_Settings SHALL incluir um campo booleano `auto_emit_on_payment` que controla se a emissão automática está habilitada para a organização.
2. WHEN um pagamento tiver seu `status` alterado para `'pago'` e `auto_emit_on_payment` estiver habilitado nas Fiscal_Settings, THE Fiscal_Module SHALL iniciar automaticamente o fluxo de emissão de NFS-e para aquele pagamento.
3. WHEN a emissão automática for iniciada, THE Fiscal_Module SHALL verificar se já existe um Invoice com `payment_id` igual ao pagamento e `status` diferente de `'rejeitada'` ou `'cancelada'` antes de criar um novo registro.
4. IF já existir um Invoice ativo para o pagamento, THEN THE Fiscal_Module SHALL não criar um novo Invoice e registrar um aviso no log sem interromper o fluxo de confirmação do pagamento.
5. WHEN a emissão automática for iniciada sem `contract_id` no pagamento, THE Fiscal_Module SHALL utilizar `codigo_servico_padrao` e `descricao_servico_padrao` das Fiscal_Settings para preencher os dados do serviço.
6. WHEN a emissão automática falhar na chamada à Notaas_API, THE Fiscal_Module SHALL atualizar o Invoice com `status = 'rejeitada'` e `erro_mensagem`, sem reverter a confirmação do pagamento.
7. THE Fiscal_Module SHALL utilizar o mês/ano da data `paid_at` do pagamento como `competencia` da NFS-e na emissão automática.

---

### Requisito 4: Listagem e Gerenciamento de NFS-e

**User Story:** Como usuário com permissão fiscal, quero visualizar todas as notas fiscais emitidas com seus status e ações disponíveis, para que eu possa acompanhar e gerenciar a documentação fiscal da agência.

#### Critérios de Aceitação

1. THE Fiscal_Module SHALL exibir uma listagem paginada de Invoices da organização, ordenada por `created_at` decrescente, com as colunas: número da nota, cliente, competência, valor do serviço, status, data de emissão.
2. THE Fiscal_Module SHALL suportar filtro da listagem por `status` (pendente, processando, autorizada, rejeitada, cancelada), por `competencia` (mês/ano) e por nome do cliente.
3. WHEN um Invoice tiver `status = 'autorizada'` e `pdf_url` preenchido, THE Fiscal_Module SHALL exibir um botão para download/visualização do PDF da nota.
4. WHEN um Invoice tiver `status = 'autorizada'`, THE Fiscal_Module SHALL exibir um botão de cancelamento para usuários com permissão `can_delete` no módulo `fiscal`.
5. WHEN o usuário acionar o cancelamento de um Invoice, THE Fiscal_Module SHALL exibir uma confirmação solicitando o motivo do cancelamento antes de prosseguir.
6. WHEN o cancelamento for confirmado, THE Fiscal_Module SHALL chamar o endpoint de cancelamento da Notaas_API e, em caso de sucesso, atualizar o Invoice com `status = 'cancelada'`, `cancelada_em` e `motivo_cancelamento`.
7. IF a Notaas_API retornar erro no cancelamento, THEN THE Fiscal_Module SHALL exibir a mensagem de erro ao usuário sem alterar o `status` do Invoice.
8. THE Fiscal_Module SHALL exibir um badge de status colorido para cada Invoice: cinza (pendente), amarelo (processando), verde (autorizada), vermelho (rejeitada), cinza-escuro (cancelada).
9. WHEN um Invoice tiver `status = 'rejeitada'`, THE Fiscal_Module SHALL exibir a `erro_mensagem` ao expandir o registro na listagem.

---

### Requisito 5: Vinculação Contextual em Contratos

**User Story:** Como usuário, quero visualizar as NFS-e geradas para um contrato específico dentro da tela de detalhes do contrato, para que eu tenha visibilidade fiscal sem sair do contexto do cliente.

#### Critérios de Aceitação

1. THE Fiscal_Module SHALL exibir uma aba ou seção "Notas Fiscais" na tela de detalhes do contrato (`ContractDetailPage`) listando todos os Invoices com `contract_id` igual ao contrato visualizado.
2. WHEN a seção de Notas Fiscais do contrato for exibida, THE Fiscal_Module SHALL mostrar para cada Invoice: número da nota, competência, valor, status e link para PDF (quando disponível).
3. WHEN a seção de Notas Fiscais do contrato for exibida, THE Fiscal_Module SHALL exibir um botão "Emitir NFS-e" que abre o formulário de emissão manual pré-preenchido com o `contract_id` e dados do cliente do contrato.
4. IF o usuário não tiver permissão `can_view` no módulo `fiscal`, THEN THE Fiscal_Module SHALL ocultar completamente a seção de Notas Fiscais na tela de detalhes do contrato.

---

### Requisito 6: Vinculação Contextual em Pagamentos

**User Story:** Como usuário, quero visualizar e acessar a NFS-e vinculada a um pagamento diretamente na linha do pagamento, para que eu possa confirmar a documentação fiscal de cada recebimento.

#### Critérios de Aceitação

1. WHEN um pagamento possuir um Invoice vinculado com `status = 'autorizada'`, THE Fiscal_Module SHALL exibir um ícone/botão de nota fiscal na linha do pagamento na listagem de pagamentos.
2. WHEN o usuário clicar no ícone de nota fiscal na linha do pagamento, THE Fiscal_Module SHALL exibir um modal ou painel lateral com os dados resumidos do Invoice: número, competência, valor, status e link para PDF.
3. WHEN um pagamento não possuir Invoice vinculado e o usuário tiver permissão `can_create` no módulo `fiscal`, THE Fiscal_Module SHALL exibir um botão "Emitir NFS-e" na linha do pagamento.
4. IF o usuário não tiver permissão `can_view` no módulo `fiscal`, THEN THE Fiscal_Module SHALL ocultar todos os controles fiscais na listagem de pagamentos.

---

### Requisito 7: Recebimento de Webhooks da Notaas

**User Story:** Como sistema, quero processar os eventos de webhook enviados pela Notaas para atualizar o status das notas fiscais em tempo real, para que os usuários vejam sempre o estado atual de cada NFS-e.

#### Critérios de Aceitação

1. THE Webhook_Handler SHALL expor um endpoint público `POST /functions/v1/notaas-webhook` para receber eventos da Notaas.
2. WHEN o Webhook_Handler receber uma requisição, THE Webhook_Handler SHALL validar a assinatura HMAC-SHA256 do payload usando o segredo configurado nas Fiscal_Settings antes de processar qualquer evento.
3. IF a assinatura HMAC-SHA256 for inválida, THEN THE Webhook_Handler SHALL retornar HTTP 401 sem processar o payload.
4. WHEN o Webhook_Handler receber o evento `nfse.autorizada`, THE Webhook_Handler SHALL localizar o Invoice pelo `notaas_id` e atualizar os campos `status = 'autorizada'`, `numero`, `pdf_url`, `xml_url`, `emitida_em`.
5. WHEN o Webhook_Handler receber o evento `nfse.rejeitada`, THE Webhook_Handler SHALL localizar o Invoice pelo `notaas_id` e atualizar os campos `status = 'rejeitada'` e `erro_mensagem` com a descrição do erro retornada no payload.
6. IF o Webhook_Handler não encontrar um Invoice correspondente ao `notaas_id` recebido, THEN THE Webhook_Handler SHALL retornar HTTP 404 e registrar o evento não processado no log.
7. THE Webhook_Handler SHALL retornar HTTP 200 para todos os eventos processados com sucesso, independentemente do tipo de evento.
8. THE Webhook_Handler SHALL processar os eventos de webhook de forma idempotente: receber o mesmo evento `nfse.autorizada` duas vezes SHALL resultar no mesmo estado final do Invoice sem criar duplicatas.

---

### Requisito 8: Controle de Acesso ao Módulo Fiscal

**User Story:** Como administrador, quero controlar quais usuários têm acesso ao módulo fiscal e quais ações podem executar, para que dados fiscais sensíveis sejam protegidos por permissões independentes dos demais módulos.

#### Critérios de Aceitação

1. THE Fiscal_Module SHALL registrar `fiscal` como um módulo de permissão independente no sistema de RBAC existente, adicionando-o ao enum `permission_module` do banco de dados.
2. THE Fiscal_Module SHALL aplicar as seguintes permissões padrão por role: `owner` e `admin` têm acesso total; `manager` tem `can_view = true`, `can_create = true`, `can_edit = true`, `can_delete = false`; `member` e `viewer` têm todos os campos `false` por padrão.
3. WHEN um usuário acessar a rota `/fiscal` sem permissão `can_view` no módulo `fiscal`, THE Fiscal_Module SHALL exibir a tela de "Acesso negado" padrão do ModuleGuard.
4. THE Fiscal_Module SHALL respeitar sobrescritas individuais de permissão via `user_permissions` e `job_title_permissions`, seguindo o mesmo padrão dos demais módulos do sistema.
5. THE Fiscal_Module SHALL adicionar `fiscal` à lista de módulos exibidos na tela de Configurações → Cargos e Permissões, com o label "Fiscal / NFS-e".
6. THE Fiscal_Module SHALL adicionar a rota `/fiscal` ao mapeamento `ROUTE_TO_MODULE` no hook `usePermissions`, associando-a ao módulo `fiscal`.

---

### Requisito 9: Persistência e Integridade dos Dados

**User Story:** Como sistema, quero garantir que os dados de NFS-e sejam armazenados com integridade referencial e isolamento por organização, para que não haja vazamento de dados entre tenants.

#### Critérios de Aceitação

1. THE Fiscal_Module SHALL utilizar a tabela `invoices` definida na migration `015_create_invoices_table.sql`, com as colunas: `id`, `organization_id`, `client_id`, `contract_id`, `payment_id`, `type`, `status`, `notaas_id`, `notaas_protocol`, `numero`, `serie`, `valor_servico`, `aliquota_iss`, `valor_iss`, `valor_liquido`, `codigo_servico`, `descricao_servico`, `competencia`, `tomador_nome`, `tomador_cnpj_cpf`, `tomador_email`, `tomador_endereco`, `pdf_url`, `xml_url`, `emitida_em`, `cancelada_em`, `motivo_cancelamento`, `erro_mensagem`, `metadata`, `created_at`, `updated_at`.
2. THE Fiscal_Module SHALL armazenar um snapshot dos dados do tomador (`tomador_nome`, `tomador_cnpj_cpf`, `tomador_email`, `tomador_endereco`) no momento da emissão, independentemente de alterações futuras no cadastro do cliente.
3. THE Fiscal_Module SHALL aplicar Row Level Security (RLS) na tabela `invoices` garantindo que cada organização acesse apenas seus próprios registros, usando a função `get_user_organization_id()` existente.
4. WHEN um Invoice for criado, THE Fiscal_Module SHALL garantir que `organization_id` seja sempre igual ao `organization_id` da sessão autenticada, sem aceitar valores externos.
5. THE Fiscal_Module SHALL manter índices na tabela `invoices` para as colunas `organization_id`, `client_id`, `contract_id`, `payment_id`, `status` e `competencia` para garantir performance nas consultas de listagem e filtro.
6. FOR ALL Invoices criados, o campo `organization_id` SHALL ser igual ao `organization_id` do cliente referenciado em `client_id` (propriedade de consistência referencial entre tenants).

---

### Requisito 10: Feedback e Experiência do Usuário

**User Story:** Como usuário, quero receber feedback claro sobre o resultado de cada operação fiscal, para que eu saiba imediatamente se uma NFS-e foi emitida, rejeitada ou cancelada com sucesso.

#### Critérios de Aceitação

1. WHEN a emissão de uma NFS-e for concluída com sucesso, THE Fiscal_Module SHALL exibir uma notificação toast de sucesso com o número da nota emitida.
2. WHEN a emissão de uma NFS-e falhar, THE Fiscal_Module SHALL exibir uma notificação toast de erro com a mensagem retornada pela Notaas_API.
3. WHEN o cancelamento de uma NFS-e for concluído com sucesso, THE Fiscal_Module SHALL exibir uma notificação toast de sucesso e atualizar o status na listagem sem recarregar a página.
4. WHILE uma operação de emissão ou cancelamento estiver em andamento, THE Fiscal_Module SHALL exibir um indicador de carregamento (spinner) no botão acionado e desabilitar o botão para evitar duplo envio.
5. WHEN o usuário abrir o formulário de emissão manual, THE Fiscal_Module SHALL pré-preencher automaticamente os dados do tomador a partir do cadastro do cliente selecionado (nome, CPF/CNPJ, email, endereço).
6. IF as Fiscal_Settings não estiverem configuradas (sem `api_key`), THEN THE Fiscal_Module SHALL exibir um banner de aviso na página principal do módulo orientando o administrador a configurar a integração antes de emitir notas.
