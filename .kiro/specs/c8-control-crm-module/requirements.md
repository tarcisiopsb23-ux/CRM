# Documento de Requisitos

## Introdução

O módulo **C8 Control** permite à agência oferecer o CRM (projeto externo separado) como produto SaaS para seus clientes. **O CRM em si é um projeto independente já existente.** Nessa aplicação (CRM da agência), o escopo se limita a:

1. **Página de login pública** — portão de entrada via slug que autentica o usuário e redireciona para o CRM externo
2. **Aba C8 Control no módulo de clientes** — configuração do plano por cliente (valor, módulos, usuários, mensalidades)
3. **Ativação do C8 Control nas configurações do cliente** — toggle para habilitar/desabilitar o produto por cliente
4. **Aba financeira do C8 Control** — gestão centralizada de clientes com CRM ativo, inadimplência e controle de acesso/bloqueio

---

## Glossário

- **C8_Control**: O produto CRM externo oferecido pela agência como serviço para seus clientes finais (projeto separado)
- **CRM_Client**: O cliente da agência que contrata o C8 Control (registrado na tabela `clients` desta aplicação)
- **CRM_User**: Usuário final do CRM_Client que acessa o C8 Control via login público
- **CRM_Externo**: O projeto CRM separado, já pronto, para onde o CRM_User é redirecionado após autenticação
- **CRM_URL**: URL base do projeto CRM externo (configurável por ambiente)
- **Dashboard_Slug**: Identificador único de URL do cliente (campo `dashboard_slug` na tabela `clients`)
- **Access_Controller**: Lógica responsável por bloquear/liberar acesso ao C8 Control por cliente
- **Financial_Manager**: Módulo financeiro desta aplicação que gerencia cobranças do C8 Control
- **Subscription_Status**: Estado da assinatura do C8 Control por cliente (`ativo`, `inadimplente`, `bloqueado`, `cancelado`)

---

## Requisitos

### Requisito 1: Página de Login Público — Portão de Entrada do C8 Control

**User Story:** Como CRM_User, quero acessar o C8 Control via URL personalizada do meu cliente, para que eu seja autenticado e redirecionado para o CRM sem precisar de uma conta na agência.

#### Critérios de Aceitação

1. WHEN um CRM_User acessa `/public/dashboard/:slug/crm/login`, THE C8_Control SHALL exibir a página de login específica daquele CRM_Client identificado pelo slug
2. IF o slug informado na URL não corresponder a nenhum CRM_Client com C8 Control ativo, THEN THE C8_Control SHALL exibir "Acesso não encontrado" sem revelar informações sobre outros clientes
3. IF a assinatura do CRM_Client estiver com Subscription_Status igual a `bloqueado`, THEN THE C8_Control SHALL exibir "Acesso temporariamente suspenso. Entre em contato com a agência." e impedir o login antes de qualquer tentativa de autenticação
4. WHEN o CRM_User submete credenciais válidas (e-mail e senha), THE C8_Control SHALL autenticar o usuário no SaaS_DB e, em caso de sucesso, redirecionar para a URL do CRM_Externo passando o token de sessão
5. IF as credenciais forem inválidas, THEN THE C8_Control SHALL exibir "E-mail ou senha incorretos" sem especificar qual campo está errado
6. THE C8_Control SHALL exibir o nome e logotipo do CRM_Client na página de login, quando disponíveis em `clients.metadata->>'logo_url'`
7. WHEN o CRM_User solicita recuperação de senha, THE C8_Control SHALL disparar o fluxo de reset via Supabase Auth (SaaS_DB)
8. WHILE o C8 Control estiver desativado para um CRM_Client (`c8_control_enabled = false`), THE C8_Control SHALL retornar "Acesso não encontrado" para qualquer acesso à URL de login daquele slug

---

### Requisito 2: Aba C8 Control no Módulo de Clientes

**User Story:** Como usuário da agência, quero configurar o plano C8 Control de cada cliente dentro da tela de detalhes do cliente, para que eu possa definir o que cada cliente tem acesso e quanto paga.

#### Critérios de Aceitação

1. WHILE o C8 Control estiver ativado para um CRM_Client, THE ContractDetailPage SHALL exibir a aba "C8 Control" na lista de abas do cliente
2. WHEN o usuário da agência acessa a aba C8 Control, THE C8_Control SHALL exibir o formulário de configuração com os campos: valor do plano (R$), módulos disponibilizados, número máximo de usuários e dia de vencimento da mensalidade
3. THE C8_Control SHALL disponibilizar os seguintes módulos selecionáveis: Leads/Kanban, Financeiro, Agenda, Projetos, Relatórios, WhatsApp, Campanhas
4. WHEN o usuário da agência salva o plano, THE C8_Control SHALL persistir a configuração na tabela `crm_client_plans` com `organization_id`, `client_id`, módulos selecionados, valor e limite de usuários
5. WHEN o usuário da agência altera o valor do plano, THE C8_Control SHALL oferecer a opção de gerar automaticamente um lançamento financeiro na tabela `payments` com a descrição "Mensalidade C8 Control — [nome do cliente]" e vencimento calculado a partir do `due_day` configurado
6. THE C8_Control SHALL exibir na aba o histórico dos últimos 6 lançamentos financeiros gerados para aquele cliente, com status de pagamento (pago, pendente, atrasado)
7. WHEN o usuário da agência acessa a aba C8 Control, THE C8_Control SHALL exibir a lista de CRM_Users cadastrados para aquele cliente com nome, e-mail e data do último acesso
8. WHEN o usuário da agência convida um novo CRM_User, THE C8_Control SHALL criar o usuário no SaaS_DB via Admin API e registrar o vínculo na tabela `crm_client_users`
9. IF o número de CRM_Users ativos atingir o limite do plano, THEN THE C8_Control SHALL desabilitar o botão "Convidar Usuário" e exibir "Limite de [N] usuários atingido"
10. WHEN o usuário da agência remove um CRM_User, THE C8_Control SHALL desativar o usuário no SaaS_DB e marcar `active = false` em `crm_client_users`, sem excluir o histórico

---

### Requisito 3: Ativação do C8 Control nas Configurações do Cliente

**User Story:** Como usuário da agência, quero ativar ou desativar o C8 Control para cada cliente nas configurações, para que eu possa controlar quais clientes têm acesso ao produto.

#### Critérios de Aceitação

1. THE SettingsPage SHALL exibir a opção "C8 Control" na seção de ativação de produtos do cliente, ao lado das opções existentes de "Dashboard de Performance" e "Dashboard de Atendimento"
2. WHEN o usuário da agência ativa o C8 Control para um CRM_Client, THE C8_Control SHALL atualizar `c8_control_enabled = true` na tabela `clients`
3. WHEN o usuário da agência ativa o C8 Control pela primeira vez, THE C8_Control SHALL criar automaticamente um registro inicial em `crm_client_plans` com valores padrão (valor R$ 0,00, sem módulos, 1 usuário)
4. WHEN o usuário da agência desativa o C8 Control, THE C8_Control SHALL atualizar `c8_control_enabled = false` e definir `subscription_status = 'cancelado'`, sem excluir dados históricos
5. IF o C8 Control for desativado enquanto existirem CRM_Users ativos, THEN THE C8_Control SHALL exibir um diálogo de confirmação informando o número de usuários que perderão acesso

---

### Requisito 4: Aba Financeira do C8 Control

**User Story:** Como usuário da agência, quero uma visão centralizada de todos os clientes com C8 Control ativo no módulo financeiro, para que eu possa gerenciar cobranças, identificar inadimplentes e controlar o acesso.

#### Critérios de Aceitação

1. THE FinancialPage SHALL exibir a aba "C8 Control" listando todos os CRM_Clients com `c8_control_enabled = true` da organização autenticada
2. WHEN o usuário da agência acessa a aba, THE Financial_Manager SHALL exibir por cliente: nome, valor do plano, Subscription_Status, data do próximo vencimento e valor em aberto
3. THE Financial_Manager SHALL exibir uma seção "Inadimplentes" com os CRM_Clients com pagamento atrasado há mais de 5 dias corridos
4. WHEN o usuário da agência clica em "Bloquear Acesso", THE Access_Controller SHALL atualizar `subscription_status = 'bloqueado'` em `crm_client_plans`, impedindo imediatamente novos logins daquele cliente na página de login público
5. WHEN o usuário da agência clica em "Liberar Acesso" para um cliente bloqueado, THE Access_Controller SHALL atualizar `subscription_status = 'ativo'` e restaurar o acesso ao login
6. WHEN o usuário da agência clica em "Gerar Cobrança", THE Financial_Manager SHALL criar um lançamento em `payments` com o valor do plano, vencimento no próximo `due_day` e descrição "Mensalidade C8 Control — [nome do cliente]"
7. THE Financial_Manager SHALL exibir o total consolidado de receita mensal esperada (soma dos planos ativos) e o total efetivamente recebido no mês corrente
8. IF um lançamento de mensalidade atingir 30 dias de atraso, THEN THE Access_Controller SHALL atualizar automaticamente `subscription_status = 'bloqueado'` via função agendada no banco de dados
