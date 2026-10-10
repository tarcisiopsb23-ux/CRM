# Documento de Requisitos — C8 Control Gerencial Module

## Introdução

O módulo **C8 Control Gerencial** reorganiza e expande o controle do produto CRM externo (C8 Control) dentro do Maestr.ia. O objetivo é centralizar toda a gestão de tenants C8 Control em um módulo dedicado no sidebar, acessível apenas para usuários com role `owner` ou `admin`, eliminando a aba C8 Control do cadastro individual de clientes e garantindo que os lançamentos financeiros tenham uma única fonte de verdade — o contrato CRM vinculado.

O escopo desta feature cobre:

1. **Reorganização do banco de dados** — avaliar e migrar as tabelas existentes (`crm_client_plans`, `crm_client_users`, `crm_sessions`) para suportar os novos campos exigidos pelo módulo gerencial, sem perda de dados
2. **Módulo gerencial no sidebar** — nova seção "C8 Control" acessível pelo menu lateral com lista de tenants, controle de status, planos, contratos e financeiro
3. **Remoção da aba C8 Control do cadastro do cliente** — a aba `C8ControlTab` dentro de `ClientsPage`/`ContractDetailPage` deve ser removida; o toggle de ativação migra para o módulo gerencial
4. **Integração financeira sem duplicação** — contratos CRM criados no módulo gerencial aparecem na aba "Contratos" do cliente; pagamentos têm uma única fonte via `contract_id`
5. **Manutenção das funcionalidades existentes** — página de login público, Edge Functions e aba C8 Control no módulo Financeiro são preservadas

---

## Glossário

- **Maestr_ia**: Esta aplicação — CRM multi-tenant da agência
- **C8_Control**: Produto CRM externo (projeto Supabase separado) oferecido pela agência como SaaS para seus clientes
- **Tenant**: Um cliente da agência que contrata o C8 Control (registrado na tabela `clients` do Maestr_ia)
- **Tenant_Config**: Configuração centralizada de um Tenant no C8 Control, armazenada em `crm_client_plans` (ou tabela equivalente após migração)
- **CRM_User**: Usuário final do Tenant que acessa o C8 Control via página de login público — cadastrado diretamente no C8 Control
- **Primary_User**: E-mail do usuário principal do Tenant, registrado no Maestr_ia em `crm_client_plans.primary_user_email` para controle de acesso inicial
- **Modulo_Gerencial**: Nova seção "C8 Control" no sidebar do Maestr_ia, com controle de acesso baseado nas permissões configuradas por cargo
- **Subscription_Status**: Estado da assinatura do Tenant (`ativo`, `bloqueado`, `suspenso`, `cancelado`)
- **Contrato_CRM**: Registro na tabela `contracts` do Maestr_ia vinculado ao serviço "C8 Control CRM" de um Tenant, criado automaticamente ao cadastrar o Tenant
- **Payment**: Lançamento financeiro na tabela `payments` do Maestr_ia, vinculado a um `contract_id` do Contrato_CRM
- **Access_Controller**: Lógica responsável por bloquear/liberar acesso ao C8 Control por Tenant, incluindo revogação de sessões ativas
- **Financial_Manager**: Componente do módulo gerencial que exibe e gerencia cobranças do C8 Control — por Tenant e de forma consolidada para todos os Tenants
- **Dashboard_Slug**: Identificador único de URL do cliente (campo `dashboard_slug` na tabela `clients`)
- **RLS**: Row Level Security — mecanismo de isolamento de dados por organização no Supabase
- **Permission_Scope**: Conjunto de permissões (`visualizar`, `criar`, `editar`, `excluir`) configurável por cargo na tela de Cargos e Permissões para o módulo `c8control`

---

## Requisitos

### Requisito 1: Reorganização do Banco de Dados

**User Story:** Como desenvolvedor, quero que as tabelas do C8 Control suportem todos os campos necessários para o módulo gerencial, para que o sistema possa armazenar status detalhado, motivo de bloqueio, nome do plano, datas de contrato e valor mensal sem perda dos dados existentes.

#### Critérios de Aceitação

1. THE Maestr_ia SHALL adicionar as colunas `blocked_reason TEXT`, `plan_name TEXT NOT NULL DEFAULT 'Starter'`, `contract_start DATE`, `contract_end DATE`, `suspended_at TIMESTAMPTZ`, `primary_user_email TEXT` e `notes TEXT` à tabela `crm_client_plans` via migration idempotente (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
2. THE Maestr_ia SHALL atualizar o CHECK constraint de `subscription_status` em `crm_client_plans` para aceitar os valores `'ativo'`, `'bloqueado'`, `'suspenso'`, `'cancelado'`
3. THE Maestr_ia SHALL preservar todos os registros existentes em `crm_client_plans`, `crm_client_users` e `crm_sessions` durante a migration — nenhum dado deve ser excluído
4. WHEN a migration for aplicada, THE Maestr_ia SHALL garantir que todos os registros existentes em `crm_client_plans` com `subscription_status` não contemplado pelo novo CHECK recebam o valor `'ativo'` via UPDATE de backfill antes da aplicação do constraint
5. THE Maestr_ia SHALL manter RLS ativo em todas as tabelas afetadas, com políticas baseadas em `organization_id = get_user_organization_id()`
6. THE Maestr_ia SHALL criar índices `IF NOT EXISTS` para as novas colunas que serão usadas em filtros: `idx_crm_client_plans_status` em `(organization_id, subscription_status)` e `idx_crm_client_plans_contract_end` em `(contract_end)`
7. IF a coluna `c8_control_enabled` não existir na tabela `clients`, THEN THE Maestr_ia SHALL criá-la via migration idempotente com `BOOLEAN NOT NULL DEFAULT false`

---

### Requisito 2: Módulo Gerencial C8 Control no Sidebar

**User Story:** Como usuário da agência, quero acessar um módulo dedicado "C8 Control" no menu lateral com controle de acesso granular baseado nas permissões configuradas, para que cada perfil de usuário veja e execute apenas o que lhe é permitido, e eu possa gerenciar todos os tenants, pagamentos e status em um único lugar.

#### Critérios de Aceitação

1. THE Modulo_Gerencial SHALL ser acessível via item "C8 Control" no sidebar do Maestr_ia, visível apenas para usuários cujo perfil de cargo tenha permissão de visualização (`canView`) no escopo `c8control` — configurável na tela de Cargos e Permissões das Configurações
2. THE Maestr_ia SHALL incluir o módulo "C8 Control" na tela de Cargos e Permissões (SettingsPage → PermissionsSection), com os escopos: `visualizar`, `criar`, `editar` e `excluir`, seguindo o mesmo padrão dos demais módulos do sistema
3. IF um usuário sem permissão de visualização tentar acessar a rota do Modulo_Gerencial diretamente, THEN THE Maestr_ia SHALL redirecionar para a página inicial sem exibir mensagem de erro técnico
4. WHEN o usuário acessa o Modulo_Gerencial, THE Modulo_Gerencial SHALL exibir uma lista de todos os Tenants com `c8_control_enabled = true` da organização autenticada, com as colunas: nome do cliente, plano (`plan_name`), Subscription_Status, limite de usuários (`max_users`), data de vencimento do contrato (`contract_end`) e valor mensal (`plan_value`)
5. WHEN o usuário acessa o Modulo_Gerencial, THE Modulo_Gerencial SHALL exibir métricas consolidadas: total de tenants ativos, receita mensal esperada (soma de `plan_value` onde `subscription_status = 'ativo'`) e número de tenants inadimplentes
6. THE Modulo_Gerencial SHALL permitir filtrar a lista de Tenants por Subscription_Status (`ativo`, `bloqueado`, `suspenso`, `cancelado`) e buscar por nome do cliente
7. WHEN o usuário com permissão `editar` clica em "Bloquear" para um Tenant ativo ou inadimplente, THE Access_Controller SHALL exibir um formulário solicitando o motivo do bloqueio (`blocked_reason`), e somente após confirmação SHALL atualizar `subscription_status = 'bloqueado'` e `blocked_reason` em `crm_client_plans` e revogar todas as sessões ativas do Tenant em `crm_sessions`
8. WHEN o usuário com permissão `editar` clica em "Liberar" para um Tenant bloqueado, THE Access_Controller SHALL atualizar `subscription_status = 'ativo'` e limpar `blocked_reason` em `crm_client_plans`
9. WHEN o usuário com permissão `editar` clica em "Suspender" para um Tenant ativo, THE Access_Controller SHALL atualizar `subscription_status = 'suspenso'` e registrar `suspended_at = now()` em `crm_client_plans`
10. WHEN o usuário com permissão `excluir` clica em "Cancelar Contrato" para um Tenant, THE Access_Controller SHALL exibir diálogo de confirmação e, após confirmação, atualizar `subscription_status = 'cancelado'` e `c8_control_enabled = false` na tabela `clients`, sem excluir dados históricos
11. THE Modulo_Gerencial SHALL exibir uma seção "Inadimplentes" destacando Tenants com pagamentos em aberto há mais de 5 dias corridos, com o valor total em aberto por Tenant
12. THE Modulo_Gerencial SHALL exibir uma visão geral de pagamentos de todos os Tenants, com filtros por status (`pendente`, `pago`, `vencido`, `cancelado`) e período, acessível a usuários com permissão de visualização
13. THE Modulo_Gerencial SHALL exibir, dentro do registro individual de cada Tenant, o histórico completo de pagamentos daquele Tenant com ações de registrar recebimento, editar e excluir (excluir requer permissão `excluir` e confirmação com senha e justificativa)
14. IF o usuário não tiver permissão `criar`, THEN THE Modulo_Gerencial SHALL ocultar o botão "Novo Tenant C8 Control" e qualquer ação de criação
15. IF o usuário não tiver permissão `editar`, THEN THE Modulo_Gerencial SHALL ocultar botões de edição, bloqueio, liberação e suspensão
16. IF o usuário não tiver permissão `excluir`, THEN THE Modulo_Gerencial SHALL ocultar botões de cancelamento de contrato e exclusão de pagamentos

---

### Requisito 3: Cadastro e Edição de Tenant no Módulo Gerencial

**User Story:** Como usuário com permissão `criar` no módulo C8 Control, quero cadastrar novos tenants selecionando clientes já existentes no Maestr.ia e editar os existentes diretamente no módulo gerencial, para que eu possa configurar plano, limite de usuários e contrato com replicação automática na aba Contratos do cliente, sem duplicar lançamentos financeiros.

#### Critérios de Aceitação

1. THE Modulo_Gerencial SHALL exibir um botão "Novo Tenant C8 Control" que abre um formulário de cadastro com os campos: cliente (seleção a partir dos clientes já cadastrados na tabela `clients` do Maestr_ia), nome do plano, valor mensal, limite de usuários, dia de vencimento (1–28), data de início do contrato, data de fim do contrato e e-mail do usuário principal do tenant
2. WHEN o usuário salva um novo Tenant, THE Modulo_Gerencial SHALL criar ou atualizar o registro em `crm_client_plans` com `organization_id`, `client_id`, `plan_name`, `plan_value`, `max_users`, `due_day`, `contract_start`, `contract_end` e `subscription_status = 'ativo'`, e atualizar `c8_control_enabled = true` na tabela `clients`
3. WHEN o usuário ativa o C8 Control para um cliente pela primeira vez, THE Modulo_Gerencial SHALL criar exatamente 1 registro em `crm_client_plans` — IF já existir um registro para aquele `client_id`, THEN THE Modulo_Gerencial SHALL atualizar o registro existente em vez de criar um novo
4. WHEN um novo Tenant é salvo com `plan_value > 0`, THE Modulo_Gerencial SHALL criar automaticamente um Contrato_CRM na tabela `contracts` com `service_contracted = 'C8 Control CRM'`, `title = 'CRM — [nome do cliente]'`, `client_id`, `value = plan_value`, `start_date = contract_start`, `end_date = contract_end`, `duration_months` calculado e `metadata = { source: 'c8_control', max_users: N }` — tornando-o visível na aba "Contratos" do cadastro do cliente
5. THE Maestr_ia SHALL garantir que a criação do Contrato_CRM via `useCreateContract` gere os lançamentos mensais automaticamente na tabela `payments` com `contract_id` vinculado — e que nenhum outro mecanismo crie lançamentos adicionais para o mesmo período, evitando duplicação
6. IF já existir um Contrato_CRM ativo (`service_contracted = 'C8 Control CRM'` e `status` ativo) para o mesmo `client_id`, THEN THE Modulo_Gerencial SHALL oferecer as opções: "Renovar contrato existente" (atualiza `contract_end` e `value`) ou "Criar novo contrato" (encerra o anterior e cria um novo), nunca criando dois contratos ativos simultaneamente
7. THE Modulo_Gerencial SHALL permitir editar os campos de plano e contrato de um Tenant existente via formulário modal, com os mesmos campos do cadastro
8. WHEN o usuário clica em "Renovar Contrato", THE Modulo_Gerencial SHALL atualizar `contract_end` em `crm_client_plans` e no Contrato_CRM correspondente, e registrar a renovação como nota em `crm_client_plans.notes`
9. THE Modulo_Gerencial SHALL exibir, no formulário de cadastro, apenas clientes da organização autenticada que ainda não possuem C8 Control ativo (`c8_control_enabled = false` ou sem registro em `crm_client_plans`)

---

### Requisito 4: Limite de Usuários e Usuário Principal do Tenant

**User Story:** Como usuário com permissão `editar` no módulo C8 Control, quero definir o limite máximo de usuários para cada tenant e vincular o usuário principal do tenant para controle de acesso inicial, para que o C8 Control possa aplicar esse limite internamente e eu tenha um ponto de contato registrado para cada tenant.

#### Critérios de Aceitação

1. THE Modulo_Gerencial SHALL exibir, no formulário de cadastro e edição de Tenant, o campo "Limite de usuários" (`max_users`, inteiro entre 1 e 100) como único controle de usuários gerenciado pelo Maestr_ia — o cadastro dos demais usuários é feito diretamente dentro do C8 Control
2. THE Modulo_Gerencial SHALL exibir, no formulário de cadastro de Tenant, o campo "E-mail do usuário principal" para registrar o contato responsável pelo tenant — este e-mail é armazenado em `crm_client_plans.primary_user_email` e serve como referência de acesso inicial
3. WHEN o usuário salva o Tenant com um e-mail de usuário principal, THE Modulo_Gerencial SHALL armazenar o e-mail em `crm_client_plans.primary_user_email` sem criar registros em `crm_client_users` — o vínculo é apenas informativo para controle administrativo
4. THE Modulo_Gerencial SHALL exibir, na listagem e no detalhe de cada Tenant, o campo "Usuário principal" com o e-mail registrado e o limite de usuários configurado
5. WHEN o limite de usuários (`max_users`) é alterado no Modulo_Gerencial, THE Maestr_ia SHALL atualizar o campo `max_users` em `crm_client_plans` — o C8 Control consumirá esse valor via Edge Function `crm-validate-access` para aplicar o limite internamente
6. THE Modulo_Gerencial SHALL exibir o contador de usuários ativos do tenant (lido de `crm_client_users WHERE client_id AND active = true`) ao lado do limite configurado, para que o administrador saiba quantos usuários já foram cadastrados no C8 Control

---

### Requisito 5: Controle Financeiro no Módulo Gerencial

**User Story:** Como usuário com role `owner` ou `admin`, quero gerenciar as cobranças de mensalidade de cada Tenant diretamente no módulo gerencial, para que eu possa gerar cobranças, registrar recebimentos e acompanhar inadimplência em um único lugar.

#### Critérios de Aceitação

1. THE Financial_Manager SHALL exibir, ao selecionar um Tenant, o histórico dos últimos 24 lançamentos financeiros vinculados ao Contrato_CRM daquele Tenant (filtrado por `contract_id` na tabela `payments`)
2. WHEN o usuário clica em "Gerar Cobrança", THE Financial_Manager SHALL criar um lançamento em `payments` com `organization_id`, `client_id`, `contract_id` (do Contrato_CRM ativo), `description = 'Mensalidade C8 Control — [nome do cliente]'`, `value = plan_value`, `due_date` calculado a partir do próximo `due_day` e `status = 'pendente'`
3. THE Financial_Manager SHALL vincular obrigatoriamente todo lançamento gerado pelo módulo gerencial ao `contract_id` do Contrato_CRM ativo — lançamentos sem `contract_id` não devem ser criados por este módulo
4. WHEN o usuário registra o recebimento de um lançamento, THE Financial_Manager SHALL atualizar `status = 'pago'`, `paid_at` com a data informada e `value` com o valor efetivamente recebido na tabela `payments`
5. THE Financial_Manager SHALL exibir o total consolidado: receita mensal esperada (soma de `plan_value` dos Tenants ativos) e total recebido no mês corrente (soma de `payments.value` onde `paid_at` está no mês atual e `status = 'pago'`)
6. IF um lançamento de mensalidade atingir 30 dias de atraso (calculado como `due_date <= now() - INTERVAL '30 days'` e `status = 'pendente'`), THEN THE Access_Controller SHALL atualizar automaticamente `subscription_status = 'bloqueado'` em `crm_client_plans` e revogar sessões ativas via função agendada no banco de dados

---

### Requisito 6: Remoção da Aba C8 Control do Cadastro do Cliente

**User Story:** Como usuário da agência, quero que o cadastro individual do cliente não exiba mais a aba C8 Control, para que a gestão do produto seja centralizada exclusivamente no módulo gerencial e não haja duplicação de interfaces.

#### Critérios de Aceitação

1. THE Maestr_ia SHALL remover o componente `C8ControlTab` da lista de abas exibidas em `ClientsPage` e `ContractDetailPage`
2. THE Maestr_ia SHALL remover o import e a referência ao componente `C8ControlTab` de todos os arquivos que o utilizam, sem deixar código morto
3. THE Maestr_ia SHALL remover o toggle de ativação do C8 Control da `SettingsPage` do cliente — a ativação passa a ser feita exclusivamente pelo Modulo_Gerencial
4. WHEN a aba C8 Control for removida, THE Maestr_ia SHALL garantir que as demais abas do cadastro do cliente continuem funcionando sem erros de renderização ou navegação
5. THE Maestr_ia SHALL manter o arquivo `C8ControlTab.tsx` no repositório como referência histórica, mas sem importá-lo em nenhuma rota ou componente ativo — alternativamente, o arquivo pode ser excluído se não houver necessidade de referência

---

### Requisito 7: Integração Financeira sem Duplicação

**User Story:** Como usuário da agência, quero que os contratos CRM criados no módulo gerencial apareçam na aba "Contratos" do cadastro do cliente e que os lançamentos financeiros tenham uma única fonte, para que não haja duplicação de dados entre o módulo gerencial e o módulo financeiro geral.

#### Critérios de Aceitação

1. WHEN um Contrato_CRM é criado no Modulo_Gerencial, THE Maestr_ia SHALL inserir um registro na tabela `contracts` com `client_id`, `service_contracted = 'C8 Control CRM'`, `title = 'CRM — [nome do cliente]'`, `duration_months`, `recurring_value` e `metadata = { source: 'c8_control', max_users: N }`, tornando-o visível na aba "Contratos" do cadastro do cliente
2. THE Financial_Manager SHALL buscar os lançamentos financeiros de um Tenant exclusivamente via `payments WHERE contract_id = [id do Contrato_CRM ativo]` — nunca via filtro por `description LIKE 'Mensalidade C8 Control%'` sem `contract_id`
3. THE Maestr_ia SHALL garantir que a aba "C8 Control" no módulo Financeiro (`C8ControlFinancialTab`) continue lendo os mesmos `payments` vinculados ao `contract_id` do Contrato_CRM, sem criar lançamentos duplicados
4. IF existirem lançamentos históricos em `payments` com `description LIKE 'Mensalidade C8 Control%'` e `contract_id IS NULL`, THEN THE Maestr_ia SHALL exibi-los no módulo gerencial como "lançamentos legados" com indicação visual, sem excluí-los
5. THE Maestr_ia SHALL garantir que um Tenant tenha no máximo 1 Contrato_CRM ativo por vez — IF já existir um contrato com `service_contracted = 'C8 Control CRM'` e `status` ativo para o mesmo `client_id`, THEN o Modulo_Gerencial SHALL oferecer a opção de renovar o contrato existente em vez de criar um novo

---

### Requisito 8: Manutenção das Funcionalidades Existentes

**User Story:** Como usuário da agência e como CRM_User, quero que as funcionalidades existentes do C8 Control continuem operando normalmente após a reorganização, para que nenhum cliente perca acesso ao produto durante a migração.

#### Critérios de Aceitação

1. THE Maestr_ia SHALL manter a rota pública `/public/dashboard/:slug/crm/login` funcional e acessível sem autenticação após todas as alterações desta feature
2. THE Maestr_ia SHALL manter as Edge Functions `crm-validate-access` e `crm-manage-user` sem alterações de interface ou comportamento — apenas ajustes internos são permitidos se necessário para suportar o novo campo `subscription_status = 'suspenso'`
3. THE Maestr_ia SHALL manter a aba "C8 Control" no módulo Financeiro (`C8ControlFinancialTab`) funcional, exibindo a lista de Tenants com status, valor em aberto e ações de bloquear/liberar/gerar cobrança
4. WHEN a Edge Function `crm-validate-access` receber `action: 'validate'` para um Tenant com `subscription_status = 'suspenso'`, THE Maestr_ia SHALL retornar `403 { reason: 'suspended' }` — comportamento análogo ao bloqueio
5. THE Maestr_ia SHALL garantir que todas as migrations desta feature sejam idempotentes: uso de `IF NOT EXISTS`, `DROP ... IF EXISTS`, `CREATE OR REPLACE` e backfill seguro antes de aplicar constraints `NOT NULL` ou CHECK
6. THE Maestr_ia SHALL garantir que o isolamento multi-tenant via RLS seja mantido em todas as tabelas novas e modificadas, com políticas baseadas em `organization_id = get_user_organization_id()`
