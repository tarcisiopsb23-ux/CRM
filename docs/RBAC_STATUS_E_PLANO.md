# RBAC / Permissões — Status do que foi feito e próximos passos

Data: 2026-03-13  
Projeto: CRM SaaS (módulos: Dashboard, CRM, Analytics, Clientes, Financeiro, Agenda, Projetos, Metas, WhatsApp, Reuniões IA, Equipe, Ponto, Relatórios, Auditoria, Campanhas, Configurações)

---

## 1) Visão geral do modelo adotado

O sistema segue um modelo **RBAC (Role-Based Access Control)** com camadas adicionais:

1. **Role base (user_role)**: `owner`, `admin`, `manager`, `member`, `viewer`
2. **Cargo (job_title)**: armazenado em `profiles.metadata.job_title` (fallback `profiles.metadata.cargo`)
3. **Mapeamento Cargo → Role**: `job_title_role_mappings` (por organização)
4. **Permissão por módulo**:
   - Por cargo: `job_title_permissions`
   - Por usuário: `user_permissions`
5. **Permissão por sub-opção (aba/janela/view)**:
   - Por cargo: `job_title_permission_scopes`
   - Por usuário: `user_permission_scopes`

Regras de herança:
- Permissão do **módulo** vale para todas as sub-opções.
- Permissão marcada apenas na **sub-opção** vale só para ela e pode sobrescrever o módulo.
- `owner/admin` têm acesso total (com exceções específicas implementadas conforme decisões do cliente).

Arquivos-chave:
- `src/hooks/usePermissions.ts`
- `src/components/settings/PermissionsSection.tsx`

---

## 2) O que foi entregue (até agora)

### 2.1 Cargos no cadastro do colaborador

- Campo **Cargo** padronizado usando `profiles.metadata.job_title` (fallback `cargo`).
- Sugestões de cargo no cadastro direto (AddCollaboratorModal) usando catálogo central.
- Confirmação de exclusão do colaborador passa a exibir nome + cargo.

Arquivos:
- `src/components/team/AddCollaboratorModal.tsx`
- `src/components/team/TeamProfilesList.tsx`
- `src/lib/jobTitles.ts`

---

### 2.2 Catálogo de cargos (CRUD) nas Configurações

Foi criado um catálogo gerenciável por organização:
- Tabela `job_title_catalog`
- UI em Configurações permite **incluir/alterar/excluir** cargos
- Renomear cargo atualiza também:
  - mapeamentos de role (`job_title_role_mappings`)
  - permissões por cargo (`job_title_permissions`)
  - `profiles.metadata.job_title` e `profiles.metadata.cargo`

Banco:
- `supabase/migrations/00024_job_title_catalog.sql`

Frontend:
- `src/hooks/useJobTitleCatalog.ts`
- `src/components/settings/PermissionsSection.tsx`

---

### 2.3 “Permissões” virou “Cargos e Permissões” + 3 abas

Renomeado no menu de Configurações:
- “Permissões” → “Cargos e Permissões”

Estrutura interna:
- **Cargos**: CRUD de cargos (catálogo)
- **Permissões**: vínculo Cargo ↔ `user_role`
- **Acessos**: permissões por módulo e por sub-opção (aba/janela/view), por Cargo ou por Colaborador

Arquivos:
- `src/pages/SettingsPage.tsx`
- `src/components/settings/PermissionsSection.tsx`

---

### 2.4 Permissões por “sub-opção” (aba/janela/view)

Adicionadas tabelas para granularidade:
- `user_permission_scopes`
- `job_title_permission_scopes`

Banco:
- `supabase/migrations/00025_permission_scopes.sql`

Frontend:
- `src/hooks/usePermissions.ts`
- `src/components/settings/PermissionsSection.tsx`

---

### 2.5 Taxonomia de módulos (permission_module) expandida

O enum `permission_module` foi expandido para cobrir módulos do contexto:

- `dashboard`
- `crm`
- `sales_analytics`
- `whatsapp`
- `meetings`
- `reports`
- `campaigns`
- `audit`
- `timeclock`
- + os já existentes: `kanban`, `clients`, `financial`, `projects`, `agenda`, `goals`, `team`, `settings`

Banco:
- `supabase/migrations/00027_expand_permission_module.sql`

Frontend:
- `src/types/supabase.ts`
- `src/hooks/usePermissions.ts`
- `src/components/layout/AppSidebar.tsx`

---

### 2.6 Regras do Financeiro (conforme decisões do cliente)

**Despesas (supplier_expenses)**
- Restrito no banco para `owner/admin`.
- Para demais, expor apenas inadimplência agregada via função.

Banco:
- `supabase/migrations/00026_financial_expenses_access.sql`

**Contratos**
- `owner/admin`: create/update/delete
- `manager/member`: create (e select)
- `viewer`: sem acesso

**Receitas (payments)**
- `viewer`: sem acesso
- `owner/admin/manager/member`: select/insert/update
- delete: só `owner/admin`

Banco:
- `supabase/migrations/00028_financial_contracts_payments_policies.sql`

**Relatórios financeiros**
- Definição do cliente: **somente owner/admin**
- Implementado como baseline para `financial/reports` no RBAC (UI/guards)

Arquivo:
- `src/hooks/usePermissions.ts`

---

### 2.7 Auditoria (owner/admin total; manager por equipe)

Definição do cliente:
- `owner/admin`: visualiza tudo
- `manager`: visualiza apenas ações de pessoas da própria equipe

Banco:
- RLS em `audit_logs` e view `audit_logs_view`:
  - `supabase/migrations/00029_audit_logs_access.sql`

Frontend:
- `src/hooks/useAuditLogs.ts`
- `src/App.tsx`

---

### 2.8 “Não carregar dados sensíveis sem permissão”

- Dashboard passou a **não buscar** dados financeiros sem `canView` do Financeiro:
  - `usePayments` e `useSupplierExpenses` aceitam `enabled`
  - UI financeira no Dashboard oculta quando não permitido

Arquivos:
- `src/hooks/useFinancial.ts`
- `src/pages/DashboardPage.tsx`

---

## 3) Checklist de “checkup completo” antes de avançar

### 3.1 Banco (Supabase) — obrigatório

- Aplicar migrações novas:
  - 00024, 00025, 00026, 00027, 00028, 00029
- Validar se RLS está ON e policies estão ativas nas tabelas:
  - `supplier_expenses`, `contracts`, `payments`, `audit_logs`
  - `job_title_*`, `*_permission_scopes`, `user_permissions`
- Testar com contas reais:
  - owner/admin/manager/member/viewer
  - em 2 equipes diferentes + usuários em múltiplas equipes

### 3.2 Frontend — comportamento

- Validar visibilidade de menu (sidebar) para cada role
- Validar bloqueio de rota via `ModuleGuard`
- Validar bloqueio por sub-opção:
  - Financeiro: `dashboard/cashflow/.../reports`
  - Equipe: `employees/teams/payroll/timeclock`
  - Configurações: `permissions/integrations/general`
- Validar que **não há fetch** de dados sensíveis quando não permitido (ex.: Dashboard com Financeiro negado)

### 3.3 Regressão e build

- Rodar:
  - `npm run lint`
  - `npm run build`
  - `npm test`

---

## 4) O que ainda falta fazer (para fechar 100%)

### 4.1 Delegação e escopo por equipe/colaborador (ETAPA 5)

Implementar regras completas de visualização/edição/exclusão para:
- **Metas (goals)**
- **Projetos (projects/tasks)**
- **Agenda (events/event_attendees)**

Hoje o banco está basicamente em escopo de `organization_id`. Precisa:
- modelar “Aplicada a” / “Responsável” e refletir em RLS (SELECT/INSERT/UPDATE/DELETE)
- garantir que `viewer` não acesse metas/projetos/agenda
- garantir que manager/member sigam regras de equipe/colaborador

### 4.2 RBAC por ação (não só por aba)

Padronizar em todos os módulos:
- botões de criar/editar/excluir
- modais e ações sensíveis
- mutations e selects (com `enabled` e/ou bloqueios)
- RLS no banco para realmente impedir via API

### 4.3 “Permissões explícitas” (ETAPA 7)

Implementar formalmente:
- permissões adicionais (ex.: “relatórios financeiros”, “dashboards estratégicos”, “metas globais”)
- enforcement em frontend + DB + backend

### 4.4 Auditoria completa (ETAPA 9)

Já existe `audit_logs` via trigger `audit_changes()`, porém ainda falta garantir:
- registro de ações sensíveis específicas (ex.: alteração de permissões, acesso ao financeiro, alterações em metas)
- incluir IP e contexto (se necessário) — normalmente via Edge Function/API

---

## 5) Planejamento recomendado dos próximos passos (econômico em créditos)

### Fase A — Consolidar o RBAC (curto e alto impacto)

1. Rodar migrações no Supabase e validar RLS com 5 contas (owner/admin/manager/member/viewer)
2. Criar uma matriz “módulo x role” com baseline confirmado (planilha simples)
3. Padronizar gating em páginas principais:
   - Dashboard, Financeiro, Equipe, Relatórios, Campanhas, WhatsApp/Meetings (quando saírem de stub)

### Fase B — Delegação (Metas/Projetos/Agenda)

1. Alterar schema para “Aplicada a” (empresa/equipe/colaborador) e responsável
2. Implementar RLS por delegação
3. Atualizar UI e hooks para respeitar escopo e não carregar dados indevidos
4. Testar casos:
   - meta da empresa
   - meta da equipe
   - meta do colaborador
   - manager vendo equipes vs member restrito

### Fase C — Permissões explícitas e auditoria reforçada

1. Definir catálogo de permissões especiais e UI de gestão
2. Implementar enforcement (frontend + DB + backend)
3. Auditoria com dados adicionais (IP/ação/origem) nas rotas sensíveis

---

## 6) Status final (hoje)

✅ Entregue:
- Base RBAC + UI completa (Cargos/Permissões/Acessos)
- Sub-opções por módulo com override
- Taxonomia de módulos expandida
- Regras definidas para Financeiro (reports/contratos/receitas/despesas) aplicadas em RLS
- Auditoria com acesso por equipe para manager

⚠️ Falta para concluir 100%:
- Delegação por equipe/colaborador em Metas/Projetos/Agenda (schema + RLS + UI)
- Padronizar enforcement por ação em todos os módulos
- Permissões explícitas (feature-level) e auditoria enriquecida

