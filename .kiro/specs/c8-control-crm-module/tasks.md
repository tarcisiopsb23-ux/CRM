# Plano de Implementação: C8 Control CRM Module

## Visão Geral

O CRM externo (C8 Control) é um projeto separado já pronto. Nessa aplicação, implementamos apenas o portão de entrada (login público), a configuração do plano por cliente e o controle financeiro.

## Tasks

- [x] 1. Migrations do banco de dados (00117–00122)
  - [x] 1.1 Criar migration 00117 — ADD COLUMN c8_control_enabled
    - Adicionar `c8_control_enabled BOOLEAN NOT NULL DEFAULT false` na tabela `clients`
    - Criar índice em `(organization_id, c8_control_enabled)`
    - _Requisitos: 3.2, 3.3, 3.4_

  - [x] 1.2 Criar migration 00118 — CREATE TABLE crm_client_plans
    - Criar tabela com colunas: `id`, `organization_id`, `client_id`, `plan_value`, `modules TEXT[]`, `max_users`, `due_day`, `subscription_status`, `created_at`, `updated_at`
    - RLS via `get_user_organization_id()` (padrão do projeto)
    - Trigger `update_updated_at_column` (função já existente)
    - _Requisitos: 2.4, 4.4, 4.5_

  - [x] 1.3 Criar migration 00119 — CREATE TABLE crm_client_users
    - Criar tabela com colunas: `id`, `organization_id`, `client_id`, `user_id`, `email`, `name`, `active`, `last_access_at`, `created_at`
    - RLS via `get_user_organization_id()`
    - _Requisitos: 2.8, 2.10_

  - [x] 1.4 Criar migration 00120 — RPC get_crm_client_by_slug
    - Função `SECURITY DEFINER` com `LOWER(TRIM(...))` (padrão das RPCs 00062/00067)
    - Retornar: `client_id`, `organization_id`, `name`, `logo_url` (de `metadata->>'logo_url'`), `c8_control_enabled`, `subscription_status`
    - `GRANT EXECUTE TO anon, authenticated`
    - _Requisitos: 1.1, 1.2, 1.3, 1.8_

  - [x] 1.5 Criar migration 00121 — Função auto_block_overdue_crm_clients
    - Atualiza `subscription_status = 'bloqueado'` para planos com pagamento pendente há mais de 30 dias
    - Revoga sessões ativas dos clientes bloqueados (`UPDATE crm_sessions SET revoked = true`)
    - _Requisitos: 4.8_

  - [x] 1.6 Criar migration 00122 — CREATE TABLE crm_sessions
    - Criar tabela com colunas: `id`, `organization_id`, `client_id`, `user_id`, `session_token` (UNIQUE), `created_at`, `last_activity_at`, `expires_at` (DEFAULT now() + 30min), `revoked`
    - Índice em `session_token` e em `(client_id, revoked)`
    - RLS via `get_user_organization_id()`
    - _Requisitos: 1.4_

- [x] 2. Constantes e tipos base
  - [x] 2.1 Criar src/lib/crmModules.ts
    - Exportar `CRM_MODULES` (Leads/Kanban, Financeiro, Agenda, Projetos, Relatórios, WhatsApp, Campanhas)
    - Exportar tipos `CrmModuleId` e `SubscriptionStatus`
    - _Requisitos: 2.3_

  - [x] 2.2 Adicionar variável de ambiente `VITE_C8_CONTROL_URL` no `.env.example`
    - Documentar que é a URL base do CRM externo para redirecionamento pós-login
    - _Requisitos: 1.4_

- [x] 3. Hooks de dados
  - [x] 3.1 Criar src/hooks/useCrmClientPlan.ts
    - Query em `crm_client_plans` por `client_id`
    - Mutations: `upsertPlan`, `updateStatus`
    - _Requisitos: 2.4, 2.5, 4.4, 4.5_

  - [x] 3.2 Criar src/hooks/useCrmClientUsers.ts
    - Query em `crm_client_users` por `client_id` onde `active = true`
    - Mutations: `inviteUser`, `removeUser` (via Edge Function `crm-manage-user`)
    - Expor `activeCount` para controle de limite
    - _Requisitos: 2.7, 2.8, 2.9, 2.10_

  - [x] 3.3 Criar src/hooks/useCrmFinancial.ts
    - Query: clientes com `c8_control_enabled = true` + join `crm_client_plans` + `payments` recentes
    - Calcular `totalExpectedMonthly` e `totalReceivedMonth`
    - Mutations: `generateCharge`, `blockAccess`, `unblockAccess`
    - _Requisitos: 4.1, 4.2, 4.3, 4.6, 4.7_

- [x] 4. Edge Functions
  - [x] 4.1 Criar supabase/functions/crm-validate-access/index.ts
    - `action: 'create_session'`: verificar `subscription_status = 'ativo'` → gerar `session_token` → INSERT em `crm_sessions` → retornar `{ session_token, expires_at }`
    - `action: 'validate'`: buscar sessão → verificar `revoked`, `expires_at`, `subscription_status` → UPDATE `last_activity_at` e `expires_at` (+30min) → retornar `{ valid: true, client_id, user_id, modules[] }`
    - `action: 'revoke'`: UPDATE `crm_sessions SET revoked = true` pelo `session_token`
    - Autenticação via `CRM_API_KEY` no header (secret compartilhado com o CRM externo)
    - _Requisitos: 1.4_

  - [x] 4.2 Criar supabase/functions/crm-manage-user/index.ts
    - `action: 'invite'`: verificar limite → criar usuário no SaaS_DB via Admin API → inserir em `crm_client_users`
    - `action: 'remove'`: marcar `active = false` em `crm_client_users` → revogar sessões ativas do usuário (`UPDATE crm_sessions SET revoked = true`) → desativar no SaaS_DB
    - Validar JWT da agência na requisição
    - Retornar erro 400 se limite atingido
    - _Requisitos: 2.8, 2.9, 2.10_

- [x] 5. Componentes da aba C8 Control no cliente
  - [x] 5.1 Criar src/components/clients/CrmPlanForm.tsx
    - Campos: valor do plano (R$), checkboxes de módulos (`CRM_MODULES`), `max_users`, `due_day`
    - Ao salvar: chamar `upsertPlan`
    - Ao alterar valor: oferecer opção de gerar lançamento financeiro
    - _Requisitos: 2.2, 2.3, 2.4, 2.5_

  - [x] 5.2 Criar src/components/clients/CrmUsersList.tsx
    - Listar CRM_Users com nome, e-mail e `last_access_at`
    - Botão "Convidar Usuário" (desabilitado quando `activeCount >= max_users`)
    - Botão "Remover" por usuário
    - Contador "X de Y usuários utilizados"
    - _Requisitos: 2.7, 2.8, 2.9, 2.10_

  - [x] 5.3 Criar src/components/clients/C8ControlTab.tsx
    - Compor `CrmPlanForm` + `CrmUsersList` + histórico dos últimos 6 lançamentos financeiros
    - _Requisitos: 2.1, 2.6_

- [x] 6. Integração em ContractDetailPage e SettingsPage
  - [x] 6.1 Modificar src/components/clients/ContractDetailPage.tsx
    - Adicionar aba "C8 Control" condicionalmente quando `c8_control_enabled = true`
    - Renderizar `C8ControlTab` dentro da nova aba
    - _Requisitos: 2.1_

  - [x] 6.2 Modificar src/pages/SettingsPage.tsx
    - Adicionar toggle "C8 Control" ao lado dos dashboards de performance e atendimento
    - Ao ativar: `UPDATE clients SET c8_control_enabled = true` + criar plano padrão em `crm_client_plans`
    - Ao desativar: diálogo de confirmação com contagem de usuários ativos → `c8_control_enabled = false` + `subscription_status = 'cancelado'`
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Aba financeira do C8 Control
  - [x] 7.1 Criar src/components/financial/C8ControlFinancialTab.tsx
    - Lista de clientes com `c8_control_enabled = true`: nome, valor, status, próximo vencimento, valor em aberto
    - Seção "Inadimplentes" (atraso > 5 dias)
    - Botão "Bloquear Acesso": atualiza `subscription_status = 'bloqueado'` + revoga todas as sessões ativas do cliente (`UPDATE crm_sessions SET revoked = true WHERE client_id`)
    - Botão "Liberar Acesso": atualiza `subscription_status = 'ativo'`
    - Botão "Gerar Cobrança" por cliente
    - Cards de totais: receita esperada e recebida no mês
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 7.2 Modificar src/pages/FinancialPage.tsx
    - Adicionar tab `"c8control"` com `<C8ControlFinancialTab />`
    - _Requisitos: 4.1_

- [x] 8. Página de login público — portão de entrada
  - [x] 8.1 Criar src/pages/C8ControlLoginPage.tsx
    - Buscar dados do cliente via RPC `get_crm_client_by_slug(slug)`
    - Se slug inválido ou `c8_control_enabled = false` → exibir "Acesso não encontrado"
    - Se `subscription_status = 'bloqueado'` → exibir mensagem de suspensão (sem mostrar formulário)
    - Exibir nome e logo do cliente (`metadata->>'logo_url'`) quando disponíveis
    - Formulário de e-mail + senha
    - Autenticar via `supabaseAuth.signInWithPassword()`
    - Se erro → exibir "E-mail ou senha incorretos"
    - Se sucesso → chamar `crm-validate-access` com `action: 'create_session'` → obter `session_token`
    - Redirecionar para `${VITE_C8_CONTROL_URL}/auth?session_token=${session_token}&slug=${slug}`
    - Link de recuperação de senha via Supabase Auth
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 8.2 Escrever testes de propriedade para C8ControlLoginPage
    - P1: slug com `c8_control_enabled = false` → "Acesso não encontrado" (sem formulário)
    - P3: `subscription_status = 'bloqueado'` → mensagem de suspensão (sem formulário)
    - P4: credenciais inválidas → mensagem genérica sem especificar campo

- [x] 9. Adicionar rota pública em App.tsx
  - [x] 9.1 Modificar src/App.tsx
    - Adicionar `<Route path="/public/dashboard/:slug/crm/login" element={<C8ControlLoginPage />} />`
    - Posicionar junto às demais rotas públicas (antes das rotas protegidas)
    - _Requisitos: 1.1_

- [x] 10. Checkpoint final
  - Executar `tsc --noEmit` para verificar tipos
  - Verificar que a rota pública de login funciona sem autenticação
  - Verificar que bloquear um cliente na aba financeira impede o login na página pública
  - Verificar que o redirecionamento para o CRM externo inclui o token

## Notas

- Tasks com `*` são opcionais (property-based tests com fast-check)
- Não há `C8ControlAppPage` — o app do CRM é o projeto externo
- A variável `VITE_C8_CONTROL_URL` deve ser configurada no ambiente de produção
- As migrations seguem a numeração sequencial do projeto (00117 → 00122)
- A Edge Function `crm-validate-access` requer o secret `CRM_API_KEY` compartilhado com o CRM externo
- A Edge Function `crm-manage-user` requer `SUPABASE_SERVICE_ROLE_KEY` nos secrets
- O CRM externo deve chamar `crm-validate-access` com `action: 'validate'` a cada login do usuário
- O CRM externo deve chamar `crm-validate-access` com `action: 'revoke'` no logout
- Sessões expiram automaticamente após 30 minutos de inatividade (sem necessidade de cron job)
