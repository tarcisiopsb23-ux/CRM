# Requirements Document

## Introduction

Este documento descreve os requisitos para três melhorias no sistema Maestr.IA CRM:

1. **Módulo de Fornecedores independente no Sidebar** — Elevar a aba "Fornecedores" (atualmente dentro do módulo Financeiro) para um módulo de primeiro nível no menu lateral, com suas próprias sub-abas (Dashboard, Cadastro, Financeiro), posicionado acima do módulo Financeiro.

2. **Vinculação de Fornecedor em Projetos, Tarefas e Eventos da Agenda** — Quando um item é marcado como "atribuído a terceirizado", habilitar um campo de seleção para vincular o fornecedor cadastrado no módulo de Fornecedores.

3. **Clareza e Alerta nos Webhooks de Drive** — Revisar e renomear os campos de webhook na tela de configurações para eliminar ambiguidade entre "Webhook URL: Novos Clientes" (CRM → n8n) e "Webhook URL: Pasta de Clientes" (Drive automático), e implementar alerta visual quando a pasta do Google Drive não for criada para um cliente.

---

## Glossary

- **Sidebar**: Menu de navegação lateral da aplicação, renderizado pelo componente `AppSidebar`.
- **Módulo de Fornecedores**: Novo módulo de primeiro nível no sidebar, acessível via rota `/suppliers`, com sub-abas Dashboard, Cadastro e Financeiro.
- **Fornecedor**: Entidade cadastrada na tabela `suppliers`, com campos como nome, CPF/CNPJ, categoria de serviço, e-mail, telefone e Pix.
- **Terceirizado**: Indicador booleano (`is_freelancer`) em projetos e eventos da agenda que sinaliza que o item foi delegado a um prestador externo.
- **Supplier_Link**: Referência opcional (`supplier_id`) em projetos, tarefas e eventos da agenda que vincula o item a um Fornecedor cadastrado.
- **Webhook_CRM_Saida**: Webhook de saída do CRM para o n8n, disparado por eventos de negócio (ex: novo cliente criado). Configurado na seção "Webhooks de Saída (CRM → n8n)".
- **Webhook_Drive_Pasta**: Webhook específico para criação automática de pastas no Google Drive via n8n. Configurado na seção "Google Drive — Pastas Automáticas".
- **Drive_Folder_Alert**: Alerta visual exibido quando um cliente não possui pasta do Google Drive criada.
- **N8nConfig**: Objeto de configuração armazenado em `organization_integrations` com `integration_type = 'n8n'`.
- **AppSidebar**: Componente React em `src/components/layout/AppSidebar.tsx` que renderiza o menu lateral.
- **FinancialPage**: Página em `src/pages/FinancialPage.tsx` que atualmente contém a aba "Fornecedores".
- **SuppliersPage**: Componente em `src/pages/SuppliersPage.tsx` que renderiza o cadastro de fornecedores.
- **FreelancerBadge**: Componente visual em `src/components/shared/FreelancerBadge.tsx` que indica atribuição a terceirizado.
- **N8nSection**: Componente de configuração em `src/components/settings/N8nSection.tsx` que gerencia os webhooks n8n.

---

## Requirements

### Requirement 1: Módulo de Fornecedores no Sidebar

**User Story:** Como usuário do sistema, quero acessar o módulo de Fornecedores diretamente pelo menu lateral, sem precisar navegar pelo módulo Financeiro, para que eu possa gerenciar fornecedores de forma mais rápida e intuitiva.

#### Acceptance Criteria

1. THE AppSidebar SHALL exibir um item de menu "Fornecedores" com ícone distinto, posicionado imediatamente acima do item "Financeiro" na lista de navegação.

2. WHEN o usuário clica no item "Fornecedores" no AppSidebar, THE AppSidebar SHALL navegar para a rota `/suppliers`.

3. THE Módulo_de_Fornecedores SHALL exibir três sub-abas internas: "Dashboard", "Cadastro" e "Financeiro", controladas por query param `?tab=`.

4. WHEN o usuário acessa a sub-aba "Cadastro" do Módulo_de_Fornecedores, THE Módulo_de_Fornecedores SHALL renderizar o conteúdo equivalente ao atual SuppliersPage (lista, cadastro, edição e visualização de fornecedores).

5. WHEN o usuário acessa a sub-aba "Financeiro" do Módulo_de_Fornecedores, THE Módulo_de_Fornecedores SHALL exibir as despesas de fornecedores (contas a pagar vinculadas a fornecedores), equivalente à visão de despesas atualmente disponível no módulo Financeiro.

6. WHEN o usuário acessa a sub-aba "Dashboard" do Módulo_de_Fornecedores, THE Módulo_de_Fornecedores SHALL exibir métricas consolidadas dos fornecedores, incluindo: total de fornecedores ativos, total de despesas do mês atual, top 5 fornecedores por valor de despesa no mês, e distribuição de despesas por categoria de serviço.

7. THE AppSidebar SHALL controlar a visibilidade do item "Fornecedores" com base na permissão de módulo `suppliers`, seguindo o mesmo padrão dos demais módulos.

8. WHEN a rota `/suppliers` é acessada sem a permissão `suppliers`, THE Módulo_de_Fornecedores SHALL redirecionar o usuário para a rota `/`.

9. WHERE a aba "Fornecedores" ainda existir dentro do FinancialPage, THE FinancialPage SHALL manter a aba "Fornecedores" para compatibilidade retroativa, exibindo um aviso informando que o módulo foi movido para o menu lateral.

10. THE AppSidebar SHALL manter a rota `/suppliers` como redirecionamento para `/suppliers?tab=cadastro` quando nenhum tab for especificado, preservando a compatibilidade com links existentes que apontam para `/financial?tab=suppliers`.

---

### Requirement 2: Vinculação de Fornecedor em Projetos, Tarefas e Eventos da Agenda

**User Story:** Como gestor de projetos, quero vincular um fornecedor cadastrado ao marcar um projeto, tarefa ou evento como "atribuído a terceirizado", para que eu possa rastrear qual fornecedor está executando cada item e facilitar a gestão financeira.

#### Acceptance Criteria

1. WHEN o usuário marca o checkbox "Atribuído a terceirizado" (`is_freelancer = true`) no formulário de criação ou edição de um projeto, THE Módulo_de_Fornecedores SHALL exibir um campo de seleção de Fornecedor imediatamente abaixo do checkbox.

2. WHEN o usuário marca o checkbox "Atribuído a terceirizado" (`is_freelancer = true`) no formulário de criação ou edição de um evento da Agenda, THE Módulo_de_Fornecedores SHALL exibir um campo de seleção de Fornecedor imediatamente abaixo do checkbox.

3. WHEN o usuário desmarca o checkbox "Atribuído a terceirizado" (`is_freelancer = false`) em qualquer formulário, THE Sistema SHALL limpar o valor do campo de seleção de Fornecedor e ocultá-lo.

4. THE campo de seleção de Fornecedor SHALL listar apenas os fornecedores com `is_active = true` pertencentes à organização do usuário, ordenados alfabeticamente por nome.

5. THE campo de seleção de Fornecedor SHALL incluir uma opção "Nenhum / Não especificado" que permite salvar o item como terceirizado sem vincular a um fornecedor específico.

6. WHEN o usuário salva um projeto com `is_freelancer = true` e um Fornecedor selecionado, THE Sistema SHALL persistir o `supplier_id` no registro do projeto na tabela `projects`.

7. WHEN o usuário salva um evento da Agenda com `is_freelancer = true` e um Fornecedor selecionado, THE Sistema SHALL persistir o `supplier_id` no registro do evento na tabela `events`.

8. WHEN um projeto ou evento com `supplier_id` preenchido é exibido na listagem ou no detalhe, THE Sistema SHALL exibir o nome do Fornecedor vinculado junto ao FreelancerBadge.

9. IF o `supplier_id` salvo em um projeto ou evento não corresponder a nenhum Fornecedor ativo da organização, THEN THE Sistema SHALL exibir o FreelancerBadge sem nome de fornecedor, sem gerar erro de interface.

10. THE campo de seleção de Fornecedor em projetos e eventos SHALL ser opcional — o usuário pode marcar `is_freelancer = true` sem selecionar um fornecedor, mantendo o comportamento atual.

---

### Requirement 3: Clareza e Alerta nos Webhooks de Drive

**User Story:** Como administrador do sistema, quero que os campos de webhook na tela de configurações sejam claramente diferenciados por função, e quero receber um alerta visual quando a pasta do Google Drive não for criada para um cliente, para que eu possa identificar e corrigir problemas de integração rapidamente.

#### Acceptance Criteria

1. THE N8nSection SHALL exibir o campo atualmente rotulado "Webhook URL: Novos Clientes" com o rótulo "Webhook URL: Notificação de Novo Cliente (CRM → n8n)", dentro da seção "Webhooks de Saída (CRM → n8n)", deixando explícito que este webhook notifica o n8n sobre a criação de um novo cliente para automações gerais (ex: e-mail de boas-vindas, notificações).

2. THE N8nSection SHALL exibir o campo atualmente rotulado "Webhook URL: Pasta de Clientes" com o rótulo "Webhook URL: Criação de Pasta no Drive (Clientes)", dentro da seção "Google Drive — Pastas Automáticas", deixando explícito que este webhook aciona a criação automática de pasta no Google Drive para o cliente.

3. THE N8nSection SHALL exibir um texto de ajuda abaixo de cada seção de webhook explicando a diferença funcional entre os dois tipos: saída para automações gerais vs. criação de pasta no Drive.

4. WHEN um cliente é criado ou atualizado e o campo `drive_folder_id` (ou equivalente em `metadata`) está vazio ou nulo, THE Sistema SHALL registrar internamente o estado "sem pasta Drive" para aquele cliente.

5. WHEN a lista de clientes é exibida e existe pelo menos um cliente sem pasta do Google Drive criada, THE Sistema SHALL exibir um alerta visual (card com borda amarela, similar ao alerta de "clientes sem senha de suporte" no C8SupportTab) listando os clientes sem pasta Drive.

6. THE alerta de clientes sem pasta Drive SHALL ser exibido apenas para usuários com papel `owner`, `admin` ou `manager`.

7. THE alerta de clientes sem pasta Drive SHALL exibir o nome de cada cliente sem pasta, com um botão de ação para criar a pasta diretamente a partir do alerta, acionando o Webhook_Drive_Pasta correspondente.

8. WHEN o Webhook_Drive_Pasta é acionado com sucesso para um cliente a partir do alerta, THE Sistema SHALL atualizar o estado do cliente para refletir que a pasta foi criada e remover o cliente da lista de alertas.

9. IF o campo `driveFolderClientWebhookUrl` não estiver configurado no N8nConfig, THEN THE alerta de clientes sem pasta Drive SHALL ser ocultado, pois a funcionalidade de pasta automática não está habilitada para a organização.

10. THE alerta de clientes sem pasta Drive SHALL exibir a contagem total de clientes sem pasta no título do card de alerta.
