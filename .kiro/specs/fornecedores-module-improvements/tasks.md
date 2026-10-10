# Implementation Plan: fornecedores-module-improvements

## Overview

Implementação em três frentes independentes: (1) módulo de Fornecedores como item de primeiro nível no sidebar com sub-abas, (2) vinculação de fornecedor em projetos, tarefas e eventos via `supplier_id`, e (3) clareza nos labels de webhook de Drive e alerta visual para clientes sem pasta Drive.

## Tasks

- [x] 1. Migração SQL — adicionar `supplier_id` em `projects`, `tasks` e `events`
  - Criar arquivo `supabase/migrations/00140_supplier_link_projects_events.sql`
  - Adicionar coluna `supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL` nas três tabelas
  - Criar índices parciais em `projects` e `events` para `(organization_id, supplier_id) WHERE supplier_id IS NOT NULL`
  - _Requirements: 2.6, 2.7_

- [x] 2. Componente `SupplierSelect` e atualização dos hooks
  - [x] 2.1 Criar `src/components/shared/SupplierSelect.tsx`
    - Props: `organizationId`, `value: string | null`, `onChange: (id: string | null) => void`, `disabled?: boolean`
    - Usa `useSuppliers(organizationId)` filtrando `is_active = true`, ordenado por nome
    - Inclui opção "Nenhum / Não especificado" (valor `null`)
    - _Requirements: 2.4, 2.5_

  - [ ]* 2.2 Escrever property test para `SupplierSelect` (Property 5)
    - **Property 5: Seletor lista apenas fornecedores ativos em ordem alfabética**
    - **Validates: Requirements 2.4, 2.5**

  - [x] 2.3 Atualizar interface `Project` e `Task` em `useProjects.ts`
    - Adicionar `supplier_id?: string | null` às interfaces `Project` e `Task`
    - _Requirements: 2.6_

  - [x] 2.4 Atualizar interface `EventRow` em `useEvents.ts`
    - Adicionar `supplier_id?: string | null` à interface `EventRow`
    - _Requirements: 2.7_

  - [x] 2.5 Atualizar `FreelancerBadge` para aceitar `supplierName?: string`
    - Quando `supplierName` fornecido, exibir nome do fornecedor ao lado do badge
    - _Requirements: 2.8, 2.9_

  - [ ]* 2.6 Escrever property test para `FreelancerBadge` (Property 7)
    - **Property 7: Nome do fornecedor exibido junto ao FreelancerBadge**
    - **Validates: Requirements 2.8**

- [x] 3. Vinculação de fornecedor em `ProjectsPage` e `Agenda`
  - [x] 3.1 Modificar formulário de projeto em `src/pages/ProjectsPage.tsx`
    - Após o checkbox `is_freelancer`, renderizar `<SupplierSelect>` condicionalmente quando `form.is_freelancer === true`
    - Ao desmarcar `is_freelancer`, limpar `form.supplier_id` para `null`
    - Incluir `supplier_id` no payload de `create` e `update`
    - Exibir nome do fornecedor no `FreelancerBadge` nos cards de projeto
    - _Requirements: 2.1, 2.3, 2.6, 2.8, 2.10_

  - [ ]* 3.2 Escrever property test para toggle `is_freelancer` em projetos (Property 4)
    - **Property 4: Toggle is_freelancer controla visibilidade do seletor de fornecedor**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 3.3 Modificar formulário de evento em `src/pages/Agenda.tsx`
    - Mesma lógica do 3.1 aplicada ao formulário de evento (após checkbox `agenda_is_freelancer`)
    - Incluir `supplier_id` no payload de `create` e `update` de eventos
    - Exibir nome do fornecedor no `FreelancerBadge` na listagem de eventos
    - _Requirements: 2.2, 2.3, 2.7, 2.8, 2.10_

  - [ ]* 3.4 Escrever property test de round-trip `supplier_id` (Property 6)
    - **Property 6: Persistência de supplier_id em projetos e eventos (round-trip)**
    - **Validates: Requirements 2.6, 2.7**

  - [ ]* 3.5 Escrever property test para formulário válido sem `supplier_id` (Property 8)
    - **Property 8: Formulário com is_freelancer=true é válido sem supplier_id**
    - **Validates: Requirements 2.10**

- [x] 4. Checkpoint — Vinculação de fornecedor
  - Garantir que todos os testes passam. Verificar que `supplier_id` persiste e é exibido corretamente em projetos e eventos.

- [x] 5. Módulo de Fornecedores no Sidebar
  - [x] 5.1 Criar `src/components/suppliers/SuppliersDashboardTab.tsx`
    - Métricas: total de fornecedores ativos, total de despesas do mês, top 5 por valor, distribuição por categoria (gráfico de pizza)
    - Reutiliza `useSuppliers` e `useSupplierExpenses`
    - _Requirements: 1.6_

  - [ ]* 5.2 Escrever property test para `SuppliersDashboardTab` (Property 3)
    - **Property 3: Dashboard exibe todas as métricas obrigatórias**
    - **Validates: Requirements 1.6**

  - [x] 5.3 Criar `src/components/suppliers/SupplierExpensesView.tsx`
    - Extrair a visão de despesas de fornecedores de `FinancialPage` para componente reutilizável
    - _Requirements: 1.5_

  - [x] 5.4 Criar `src/pages/SuppliersModulePage.tsx`
    - Lê `?tab=` (valores: `dashboard`, `cadastro`, `financeiro`); fallback para `cadastro`
    - Renderiza `SuppliersDashboardTab`, `SuppliersPage` (cadastro) ou `SupplierExpensesView`
    - Usa `ModuleGuard` via rota — sem lógica de permissão duplicada na página
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.8, 1.10_

  - [ ]* 5.5 Escrever property test para query param de sub-aba (Property 2)
    - **Property 2: Query param controla a sub-aba ativa**
    - **Validates: Requirements 1.3, 1.10**

  - [x] 5.6 Atualizar `src/App.tsx`
    - Substituir `<Route path="/suppliers" element={<Navigate to="/financial?tab=suppliers" replace />} />` por `<Route path="/suppliers" element={<SuppliersModulePage />} />`
    - Importar `SuppliersModulePage`
    - _Requirements: 1.2, 1.8_

  - [x] 5.7 Adicionar item "Fornecedores" em `src/components/layout/AppSidebar.tsx`
    - Importar ícone `Truck` de lucide-react
    - Inserir `{ title: "Fornecedores", url: "/suppliers", icon: Truck, module: "clients" }` imediatamente antes do item `"Financeiro"` em `navItems`
    - Adicionar `canViewClients` como permissão proxy (já existe no componente)
    - _Requirements: 1.1, 1.2, 1.7_

  - [ ]* 5.8 Escrever property test para visibilidade do item no sidebar (Property 1)
    - **Property 1: Visibilidade do item de Fornecedores segue permissão**
    - **Validates: Requirements 1.7**

  - [x] 5.9 Adicionar aviso de deprecação na aba `suppliers` de `FinancialPage`
    - Exibir `Alert` informando que o módulo foi movido para o menu lateral, com link para `/suppliers`
    - Manter o conteúdo atual (`SuppliersPage`) abaixo do aviso para compatibilidade retroativa
    - _Requirements: 1.9_

- [x] 6. Checkpoint — Módulo de Fornecedores
  - Garantir que todos os testes passam. Verificar navegação sidebar → `/suppliers`, sub-abas e aviso de deprecação no Financeiro.

- [x] 7. Clareza nos webhooks de Drive e alerta de clientes sem pasta
  - [x] 7.1 Renomear labels e adicionar textos de ajuda em `src/components/settings/N8nSection.tsx`
    - `"Webhook URL: Novos Clientes"` → `"Webhook URL: Notificação de Novo Cliente (CRM → n8n)"`
    - `"Webhook URL: Pasta de Clientes"` → `"Webhook URL: Criação de Pasta no Drive (Clientes)"`
    - Adicionar parágrafo de ajuda abaixo de cada seção explicando a diferença funcional
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 7.2 Criar `src/components/clients/DriveFolderAlert.tsx`
    - Props: `organizationId: string`, `canEdit: boolean`
    - Filtra clientes sem `metadata.drive_folder_id` e sem `metadata.drive_folder` (ambos nulos/ausentes)
    - Card com borda amarela, título com contagem, lista de clientes com botão de ação por item
    - Botão aciona `useDriveFolder().triggerFolder({ action: "create", module: "client", record })`
    - Após sucesso, invalida query de clientes para remover o cliente da lista
    - Oculto quando `driveFolderClientWebhookUrl` não está configurado
    - _Requirements: 3.4, 3.5, 3.7, 3.8, 3.9, 3.10_

  - [ ]* 7.3 Escrever property tests para `DriveFolderAlert` (Properties 9, 10, 11)
    - **Property 9: Clientes sem drive_folder_id são identificados corretamente**
    - **Property 10: Alerta exibido com contagem correta**
    - **Property 11: Visibilidade do alerta segue o papel do usuário**
    - **Validates: Requirements 3.4, 3.5, 3.6, 3.10**

  - [x] 7.4 Renderizar `<DriveFolderAlert>` em `ClientsPage`
    - Condicionado a `isAdminOrOwner || profile?.role === "manager"` e `driveFolderClientWebhookUrl` configurado
    - Posicionar no topo da página, antes do conteúdo principal
    - _Requirements: 3.5, 3.6, 3.9_

  - [ ]* 7.5 Escrever property test para remoção do alerta após criação de pasta (Property 12)
    - **Property 12: Após criação de pasta, cliente removido do alerta**
    - **Validates: Requirements 3.8**

- [x] 8. Checkpoint final — Garantir que todos os testes passam
  - Verificar labels renomeados na N8nSection, alerta de Drive na ClientsPage e comportamento de remoção após criação de pasta.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- A migração SQL (task 1) deve ser aplicada antes de qualquer teste de round-trip
- O item "Fornecedores" no sidebar usa `module: "clients"` como proxy de permissão — sem alteração de enum no banco
- `SupplierExpensesView` (task 5.3) é extraído de `FinancialPage` para evitar duplicação de código
