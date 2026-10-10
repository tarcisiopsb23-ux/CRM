# Plano de Implementação: C8 Control Gerencial Module

## Visão Geral

Implementação incremental do módulo gerencial C8 Control: migration de banco, novos hooks e componentes, remoção de código legado e integração com o sistema de permissões existente.

## Tarefas

- [x] 1. Migration de banco de dados
  - Criar arquivo `supabase/migrations/00130_c8control_gerencial_module.sql`
  - Adicionar colunas `blocked_reason`, `plan_name`, `contract_start`, `contract_end`, `suspended_at`, `primary_user_email`, `notes` à tabela `crm_client_plans` com `ADD COLUMN IF NOT EXISTS`
  - Executar backfill de `subscription_status` para `'ativo'` em registros com valores fora do novo CHECK
  - Recriar o CHECK constraint de `subscription_status` com os valores `'ativo'`, `'bloqueado'`, `'suspenso'`, `'cancelado'`
  - Criar índices `idx_crm_client_plans_status` e `idx_crm_client_plans_contract_end`
  - Garantir coluna `c8_control_enabled BOOLEAN NOT NULL DEFAULT false` na tabela `clients`
  - Adicionar `'c8control'` ao enum `permission_module` via bloco `DO $$ ... $$` idempotente
  - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 8.5, 8.6_

- [x] 2. Atualizar tipos e módulos existentes
  - [x] 2.1 Atualizar `SubscriptionStatus` em `src/lib/crmModules.ts` para incluir `'suspenso'`
    - _Requisitos: 1.2_
  - [x] 2.2 Atualizar interface `CrmClientPlan` em `src/hooks/useCrmClientPlan.ts` com os novos campos: `plan_name`, `blocked_reason`, `contract_start`, `contract_end`, `suspended_at`, `primary_user_email`, `notes`
    - _Requisitos: 1.1, 3.2_
  - [x] 2.3 Adicionar módulo `c8control` ao array `MODULES` e ao mapa `ROUTE_TO_MODULE` em `src/hooks/usePermissions.ts`; adicionar `'c8control'` ao set `CLIENT_ONLY_MODULES` enquanto a migration de enum não for aplicada
    - _Requisitos: 2.1, 2.2_

- [x] 3. Checkpoint — garantir que os tipos compilam sem erros antes de prosseguir
  - Verificar que `SubscriptionStatus`, `CrmClientPlan` e `PermissionModule` estão consistentes
  - Garantir que não há erros de TypeScript nos arquivos modificados

- [x] 4. Criar hook `useC8Tenants`
  - Criar `src/hooks/useC8Tenants.ts` com a interface `C8Tenant` e query key `['c8_tenants', organizationId]`
  - Query: `crm_client_plans JOIN clients WHERE c8_control_enabled = true AND organization_id = X`
  - Incluir campos: `client_id`, `client_name`, `plan_name`, `plan_value`, `max_users`, `due_day`, `subscription_status`, `contract_start`, `contract_end`, `primary_user_email`, `notes`, `suspended_at`, `blocked_reason`, `active_users_count`, `c8_control_enabled`
  - _Requisitos: 2.4, 4.4, 4.6_

- [x] 5. Criar hook `useC8TenantActions`
  - [x] 5.1 Criar `src/hooks/useC8TenantActions.ts` com as mutações `saveTenant`, `blockTenant`, `unblockTenant`, `suspendTenant`, `cancelTenant`, `renewContract`
    - `saveTenant`: UPSERT em `crm_client_plans` + UPDATE `clients.c8_control_enabled = true` + chamar `useCreateContract` se `plan_value > 0`
    - `blockTenant`: UPDATE `subscription_status = 'bloqueado'`, `blocked_reason` + revogar sessões em `crm_sessions`
    - `unblockTenant`: UPDATE `subscription_status = 'ativo'`, `blocked_reason = null`
    - `suspendTenant`: UPDATE `subscription_status = 'suspenso'`, `suspended_at = now()`
    - `cancelTenant`: UPDATE `subscription_status = 'cancelado'` + `clients.c8_control_enabled = false`
    - `renewContract`: UPDATE `contract_end` em `crm_client_plans` e no contrato CRM ativo
    - _Requisitos: 2.7, 2.8, 2.9, 2.10, 3.2, 3.3, 3.4, 3.6, 3.8_
  - [ ]* 5.2 Escrever testes de propriedade para transições de status (Propriedade 4)
    - **Propriedade 4: Transições de status são consistentes e reversíveis**
    - **Valida: Requisitos 2.7, 2.8, 2.9, 2.10**
  - [ ]* 5.3 Escrever testes de propriedade para unicidade de `crm_client_plans` por cliente (Propriedade 6)
    - **Propriedade 6: Unicidade de registro em crm_client_plans por cliente**
    - **Valida: Requisitos 3.3**

- [x] 6. Criar hook `useC8Payments`
  - Criar `src/hooks/useC8Payments.ts` com opções `organizationId`, `clientId?`, `statusFilter?`, `periodStart?`, `periodEnd?`, `limit` (default 24)
  - Query: `payments WHERE contract_id IN (contratos CRM do tenant)`, ordenado por `due_date DESC`
  - Quando `clientId` for `undefined`, buscar pagamentos de todos os tenants da organização
  - _Requisitos: 2.12, 5.1, 7.2_

- [x] 7. Checkpoint — garantir que os três hooks compilam e as queries retornam dados esperados
  - Verificar tipagem e ausência de erros de TypeScript nos hooks criados

- [x] 8. Criar componente `C8TenantForm`
  - Criar `src/components/c8control/C8TenantForm.tsx` com os campos: cliente (select de clientes sem C8 ativo), `plan_name`, `plan_value`, `max_users` (1–100), `due_day` (1–28), `contract_start`, `contract_end`, `primary_user_email`, `notes`
  - Validar `max_users` no intervalo [1, 100] com mensagem de erro inline
  - Exibir aviso "Tenant criado sem contrato financeiro" quando `plan_value = 0`
  - Exibir modal de confirmação quando já existir Contrato_CRM ativo: "Renovar existente" ou "Criar novo"
  - Usar `useC8TenantActions.saveTenant` ao submeter
  - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9, 4.1, 4.2, 4.3_
  - [ ]* 8.1 Escrever testes de propriedade para validação de `max_users` (Propriedade 10)
    - **Propriedade 10: Validação do limite de usuários**
    - **Valida: Requisitos 4.1**
  - [ ]* 8.2 Escrever testes de propriedade para unicidade de Contrato_CRM ativo (Propriedade 8)
    - **Propriedade 8: No máximo 1 Contrato_CRM ativo por tenant**
    - **Valida: Requisitos 3.6, 7.5**

- [x] 9. Criar componente `C8TenantDetail`
  - Criar `src/components/c8control/C8TenantDetail.tsx` como drawer/modal com seções: Plano e Contrato, Usuário Principal + contador de usuários ativos, Pagamentos do Tenant
  - Exibir botões de ação (Editar, Bloquear, Liberar, Suspender, Cancelar) condicionados a `canEdit` e `canDelete`
  - Integrar `useC8TenantActions` para as ações de status
  - Exibir diálogo de motivo ao bloquear (botão de confirmação desabilitado sem motivo)
  - Exibir diálogo de confirmação ao cancelar, informando número de usuários ativos
  - Exibir lançamentos legados (`contract_id IS NULL`) com indicação visual "lançamento legado"
  - _Requisitos: 2.7, 2.8, 2.9, 2.10, 2.13, 2.14, 2.15, 2.16, 4.4, 4.6, 5.1, 7.4_
  - [ ]* 9.1 Escrever testes de propriedade para UI gates de permissão (Propriedade 5)
    - **Propriedade 5: UI gates de permissão ocultam ações não autorizadas**
    - **Valida: Requisitos 2.14, 2.15, 2.16**

- [x] 10. Criar componente `C8TenantList`
  - Criar `src/components/c8control/C8TenantList.tsx` com tabela de tenants, filtro por `subscription_status` e busca por nome
  - Colunas: nome do cliente, `plan_name`, `subscription_status` (badge colorido), `max_users`, `contract_end`, `plan_value`
  - Botão "Novo Tenant C8 Control" visível apenas quando `canCreate = true`
  - Abrir `C8TenantForm` (modal) ao criar/editar e `C8TenantDetail` ao visualizar
  - _Requisitos: 2.4, 2.6, 2.14_
  - [ ]* 10.1 Escrever testes de propriedade para filtragem de tenants (Propriedade 2)
    - **Propriedade 2: Filtragem de tenants por status e nome**
    - **Valida: Requisitos 2.4, 2.6**

- [x] 11. Criar componente `C8PaymentsView`
  - Criar `src/components/c8control/C8PaymentsView.tsx` com visão consolidada de pagamentos de todos os tenants
  - Filtros por status (`pendente`, `pago`, `vencido`, `cancelado`) e período
  - Exibir total recebido no mês e receita mensal esperada
  - Ações de registrar recebimento e editar condicionadas a `canEdit`; excluir condicionado a `canDelete`
  - _Requisitos: 2.12, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 11.1 Escrever testes de propriedade para filtragem de pagamentos por `contract_id` (Propriedade 11)
    - **Propriedade 11: Pagamentos filtrados exclusivamente por contract_id**
    - **Valida: Requisitos 2.13, 5.1, 7.2, 7.3**
  - [ ]* 11.2 Escrever testes de propriedade para registro de recebimento (Propriedade 12)
    - **Propriedade 12: Registro de recebimento atualiza corretamente o pagamento**
    - **Valida: Requisitos 5.4, 5.5**

- [x] 12. Criar página principal `C8ControlPage`
  - Criar `src/pages/C8ControlPage.tsx` com três tabs: Dashboard, Tenants, Pagamentos
  - Tab Dashboard: métricas consolidadas (total ativos, receita mensal esperada, inadimplentes) + seção "Inadimplentes" com tenants com pagamentos em aberto há mais de 5 dias
  - Tab Tenants: renderizar `C8TenantList`
  - Tab Pagamentos: renderizar `C8PaymentsView`
  - Proteger com `useModulePermission('c8control')` — redirecionar para `/` se `canView = false`
  - _Requisitos: 2.1, 2.3, 2.4, 2.5, 2.11_
  - [ ]* 12.1 Escrever testes de propriedade para cálculo de métricas consolidadas (Propriedade 3)
    - **Propriedade 3: Cálculo correto das métricas consolidadas**
    - **Valida: Requisitos 2.5, 2.11**

- [x] 13. Checkpoint — verificar que a página C8ControlPage renderiza corretamente com dados mockados
  - Garantir que as três tabs navegam sem erros
  - Garantir que o guard de permissão redireciona corretamente

- [x] 14. Integrar módulo ao roteamento e sidebar
  - [x] 14.1 Adicionar rota `/c8control` em `src/App.tsx` dentro do `ModuleGuard`, importando `C8ControlPage`
    - _Requisitos: 2.1, 2.3_
  - [x] 14.2 Adicionar item "C8 Control" ao array `navItems` e ao mapa `canViewByModule` em `src/components/layout/AppSidebar.tsx`, usando `useModulePermission('c8control')`
    - _Requisitos: 2.1_
  - [ ]* 14.3 Escrever testes de propriedade para controle de acesso ao módulo (Propriedade 1)
    - **Propriedade 1: Controle de acesso ao módulo por permissão**
    - **Valida: Requisitos 2.1, 2.3**

- [x] 15. Remover `C8ControlTab` do cadastro de clientes e das configurações
  - [x] 15.1 Remover import e referência ao componente `C8ControlTab` de `src/pages/ClientsPage.tsx`; remover a aba C8 Control da lista de tabs exibidas
    - _Requisitos: 6.1, 6.2, 6.4_
  - [x] 15.2 Remover a seção "Produtos por Cliente" (toggle C8 Control) de `src/pages/SettingsPage.tsx`, incluindo os estados, handlers e imports relacionados (`useClients`, `Package`, lógica de `c8Toggling`, `c8DisableDialogOpen`, etc.)
    - _Requisitos: 6.3_
  - [x] 15.3 Verificar se `src/components/clients/ContractDetailPage.tsx` importa `C8ControlTab` e remover se aplicável
    - _Requisitos: 6.2_
  - [ ]* 15.4 Escrever testes unitários para garantir que as abas restantes de `ClientsPage` renderizam sem erros após a remoção (Propriedade 14)
    - **Propriedade 14: Abas restantes do cadastro de cliente funcionam após remoção da C8ControlTab**
    - **Valida: Requisitos 6.4_

- [x] 16. Atualizar Edge Function `crm-validate-access`
  - Modificar `supabase/functions/crm-validate-access/index.ts` para retornar `403 { reason: 'suspended' }` quando `subscription_status = 'suspenso'`, de forma análoga ao tratamento de `'bloqueado'`
  - _Requisitos: 8.2, 8.4_
  - [ ]* 16.1 Escrever testes de propriedade para resposta 403 em tenant suspenso (Propriedade 17)
    - **Propriedade 17: Edge Function retorna 403 para tenant suspenso**
    - **Valida: Requisitos 8.4**

- [x] 17. Criar arquivo de testes de propriedade consolidado
  - Criar `src/components/c8control/__tests__/c8control.property.test.ts` com todos os testes de propriedade referenciados nas tarefas anteriores
  - Usar `fast-check` com `numRuns: 100` por propriedade
  - Incluir arbitrários: `arbTenant()`, `arbTenantAtivo()`, `arbTenantFormValues()`, `arbPayment()`, `arbContractOperation()`
  - Extrair funções puras testáveis: `filterTenantsByStatus`, `calcMetrics`, `applyBlock`, `applyUnblock`, `upsertTenantInStore`, `filterPaymentsByContract`, `validateMaxUsers`
  - Cada teste deve referenciar a propriedade com o formato: `// Feature: c8-control-gerencial-module, Propriedade N: <texto>`
  - _Requisitos: 2.4, 2.5, 2.7, 2.8, 3.3, 4.1, 5.1_

- [x] 18. Checkpoint final — garantir que todos os testes passam e não há erros de compilação
  - Verificar ausência de imports mortos de `C8ControlTab` em toda a base de código
  - Garantir que a rota `/public/dashboard/:slug/crm/login` continua acessível (sem regressão)
  - Garantir que `C8ControlFinancialTab` continua funcional no módulo Financeiro
  - Garantir que `useCreateContract` não gera lançamentos duplicados para o mesmo período
  - Garantir que todos os testes de propriedade passam com `numRuns: 100`

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia os requisitos específicos para rastreabilidade
- Os checkpoints garantem validação incremental a cada bloco de mudanças
- Testes de propriedade validam invariantes universais; testes unitários validam exemplos e casos de borda
- A migration deve ser aplicada antes de qualquer alteração de código que dependa dos novos campos
