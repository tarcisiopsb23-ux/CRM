# AUDITORIA TÉCNICA DO PROJETO – MAESTR.IA CRM/ERP

**Repositório:** `C:\automacoes\CRM`  
**Data da análise:** 06/03/2026  
**Objetivo:** Documento de contexto completo para continuidade do desenvolvimento.

---

## CONTEXTO DO PROJETO

O **Maestr.IA** é um SaaS de CRM/ERP para agências e equipes comerciais.

### Stack Principal

| Tecnologia | Uso |
|------------|-----|
| React 18 | Framework UI |
| TypeScript | Tipagem |
| Vite | Build tool |
| Tailwind CSS | Estilização |
| shadcn/ui + Radix UI | Componentes |
| Supabase | Auth, Postgres, Realtime, Edge Functions |
| TanStack Query | Cache e fetching de dados |
| dnd-kit | Kanban drag-and-drop |
| Recharts | Dashboards e gráficos |
| React Hook Form + Zod | Formulários e validação |

### Integrações Planejadas

- **n8n** – Automações e workflows
- **WhatsApp Cloud API** – Conversas
- **Google Calendar API** – Agenda
- **Resend** – E-mails (convites)

### Design System

| Elemento | Valor |
|----------|-------|
| Roxo primário | `#6A2DBD` (HSL 265 62% 46%) |
| Cinza azulado escuro | `#1E2A38` (sidebar) |
| Branco acinzentado | `#F6F7FB` (background) |
| Fontes | Inter (sans), Space Grotesk (display), Lora (serif) |

Variáveis CSS em `src/index.css`; tema claro e escuro.

---

## 1. ESTRUTURA DO REPOSITÓRIO

### Árvore de Pastas

```
CRM/
├── docs/                        # Documentação
│   ├── AUTH_EMAIL_SETUP.md
│   ├── AUTH.md
│   ├── CRM_MODULOS_SETUP.md
│   ├── INVITE_BY_EMAIL.md
│   ├── N8N_AI_WORKFLOWS_DESIGN.md
│   ├── N8N_INTEGRATION_DESIGN.md
│   ├── PLANEJAMENTO_REGULARIZACAO.md
│   └── AUDITORIA_TECNICA_MAESTRIA.md  (este documento)
├── public/
│   ├── robots.txt
│   └── placeholder.svg
├── src/
│   ├── components/
│   │   ├── auth/                # ProtectedRoute, proteção por role
│   │   ├── dashboard/           # KanbanFunnelWidget, StatWidget
│   │   ├── kanban/              # KanbanBoard, LeadCard, LeadDetailsModal, LeadsKanbanColumn
│   │   ├── layout/              # AppLayout, AppHeader, AppSidebar
│   │   ├── settings/            # ApiKeysSection, InviteByEmailSection, WebhooksSection, etc.
│   │   ├── shared/              # StubPage, NavLink
│   │   ├── team/                # TeamProfilesList, TeamListSupabase
│   │   └── ui/                  # 48+ componentes shadcn/ui
│   ├── contexts/                # AuthContext
│   ├── hooks/                   # useOrganization, useAuth, useClients, useSuppliers, etc.
│   ├── lib/                     # supabase.ts, utils.ts
│   ├── pages/                   # Páginas da aplicação
│   ├── test/                    # setup.ts, example.test.ts
│   └── types/                   # auth.ts, crm.ts, database.ts, supabase.ts
├── supabase/
│   ├── functions/
│   │   └── invite-by-email/     # Edge Function para convite por e-mail
│   ├── migrations/              # 00001 a 00012
│   └── DATABASE_MODEL.md
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

### Papel das Pastas

| Pasta | Função |
|-------|--------|
| `src/components/auth` | Rotas protegidas e verificação de roles |
| `src/components/dashboard` | Widgets do dashboard (Kanban funnel, estatísticas) |
| `src/components/kanban` | Kanban de leads (drag-and-drop, cards, modal) |
| `src/components/layout` | Layout principal (sidebar, header, Outlet) |
| `src/components/settings` | Seções de Configurações (APIs, webhooks, convites) |
| `src/components/shared` | Componentes reutilizáveis (StubPage, NavLink) |
| `src/components/team` | Listagem de colaboradores e equipes |
| `src/components/ui` | Componentes base shadcn/ui |
| `src/contexts` | Contextos globais (Auth) |
| `src/hooks` | Hooks customizados (dados, auth, organização) |
| `src/lib` | Cliente Supabase e utilitários |
| `src/pages` | Páginas/rotas da aplicação |
| `src/types` | Tipos TypeScript e definições de banco |

### Arquivos de Configuração

| Arquivo | Função |
|---------|--------|
| `vite.config.ts` | Build, alias `@`, porta 8080 |
| `tsconfig.json` | Configuração TypeScript |
| `tailwind.config.ts` | Tema, cores, fontes |
| `package.json` | Dependências e scripts |

### Providers Globais

- **QueryClientProvider** – TanStack Query
- **AuthProvider** – Autenticação e perfil
- **TooltipProvider** – Tooltips
- **Toaster** e **Sonner** – Notificações

---

## 2. MÓDULOS DO SISTEMA

### CRM (Kanban, Pipeline, Leads)

| Item | Status | Descrição |
|------|--------|-----------|
| Kanban de leads | ✅ | `LeadsKanbanPage` com dnd-kit, colunas por etapa |
| Pipeline comercial | ✅ | Etapas: leads_recebidos → efetivados |
| Cards de leads | ✅ | `LeadCard` com drag-and-drop |
| Modal de detalhes | ✅ | `LeadDetailsModal` |
| Realtime | ✅ | Subscription em `leads` |
| Lista de leads | ⚠️ | Rota `/leads` é Stub; Kanban em `/kanban` é o principal |
| Criação de lead | ⚠️ | Não há botão "Novo lead" no Kanban |

### Clientes

| Item | Status | Descrição |
|------|--------|-----------|
| Cadastro | ✅ | CRUD completo em `ClientsPage` |
| Conversão do Kanban | ✅ | Leads efetivados → clientes |
| Dados de contrato | ✅ | `contracts` no banco; não há tela dedicada |
| Contatos do cliente | ✅ | `client_contacts` e campos em clients |

### Financeiro

| Item | Status | Descrição |
|------|--------|-----------|
| Contas a receber | ✅ | Lista, criação, registro de pagamento |
| Contas a pagar | ✅ | Lista, criação, registro de pagamento |
| Registro de pagamentos | ✅ | Botão "Registrar" marca como pago |

### Fornecedores

| Item | Status | Descrição |
|------|--------|-----------|
| Cadastro | ✅ | CRUD completo |
| Categorias | ✅ | Campo `service_category` |
| Pix | ✅ | Campo `pix` |

### Projetos

| Item | Status | Descrição |
|------|--------|-----------|
| Lista e criação | ✅ | `ProjectsPage` |
| Tarefas | ✅ | Tabela `tasks`; sem UI de tarefas na página |
| Gantt | ❌ | Estrutura de dados pronta; visualização não implementada |
| Responsáveis | ✅ | `project_members` e `assigned_to` em tasks |

### Agenda

| Item | Status | Descrição |
|------|--------|-----------|
| Eventos | ✅ | CRUD básico em `Agenda` |
| Tipos | ✅ | reuniao, ligacao, entrega, lembrete, outro |
| Google Calendar | ❌ | Seção em Configurações; integração não feita |
| Participantes | ⚠️ | `event_attendees` no banco; sem UI |

### Metas

| Item | Status | Descrição |
|------|--------|-----------|
| CRUD | ✅ | `GoalsPage` |
| Indicadores | ✅ | inadimplência, efetivações, faturamento, contatos |
| Períodos | ✅ | diário, semanal, mensal, trimestral, anual |

### Usuários e Equipe

| Item | Status | Descrição |
|------|--------|-----------|
| Login/logout | ✅ | `AuthContext` |
| Roles | ✅ | owner, admin, manager, member, viewer |
| Colaboradores | ✅ | Lista de profiles |
| Equipes | ✅ | CRUD de teams e team_members |
| Folha de pagamento | ❌ | Stub "em desenvolvimento" |

### WhatsApp

| Item | Status | Descrição |
|------|--------|-----------|
| Página | ⚠️ | Stub |
| Tabelas | ✅ | whatsapp_contacts, conversations, messages |
| Integração real | ❌ | Não implementada |

### Configurações

| Item | Status | Descrição |
|------|--------|-----------|
| API Keys | ✅ | Seção em `ApiKeysSection` |
| Webhooks | ✅ | `WebhooksSection` |
| n8n | ✅ | `N8nSection` |
| WhatsApp | ✅ | `WhatsAppSection` |
| Google Calendar | ✅ | `GoogleCalendarSection` |
| Convite por e-mail | ✅ | `InviteByEmailSection` |
| Acesso | ✅ | Apenas owner/admin |

---

## 3. INTEGRAÇÃO COM SUPABASE

### Configuração do Cliente

```typescript
// src/lib/supabase.ts
const supabase = createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
```

Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### Tabelas Utilizadas

| Tabela | Hook / Uso |
|--------|------------|
| `profiles` | useAuth, useProfile, useProfiles |
| `organizations` | useOrganization |
| `leads` | useLeadsKanban |
| `clients` | useClients |
| `client_contacts` | ClientsPage (indireto) |
| `contracts` | Schema; sem hook dedicado |
| `payments` | usePayments |
| `suppliers` | useSuppliers |
| `supplier_expenses` | useSupplierExpenses |
| `goals`, `goal_progress` | useGoalsCRUD |
| `projects` | useProjects |
| `tasks` | useProjects (useTasks) |
| `project_members` | Schema |
| `events` | useEvents |
| `event_attendees` | Schema |
| `teams`, `team_members` | useTeams, useTeamMembers |
| `organization_integrations` | useSettings |
| `invitation_tokens` | Fluxo de convite |
| `registration_codes` | Registro |
| `report_templates`, `report_snapshots` | Schema; sem uso no front |

### Hooks Relacionados ao Supabase

| Hook | Tabelas | Operações |
|------|---------|-----------|
| useAuth | profiles | Leitura de perfil |
| useOrganization | profiles | Leitura de org |
| useLeadsKanban | leads | CRUD, Realtime |
| useClients | clients | CRUD |
| useSuppliers | suppliers | CRUD |
| usePayments | payments | CRUD, registerPayment |
| useSupplierExpenses | supplier_expenses | CRUD, registerPayment |
| useGoalsCRUD | goals | CRUD |
| useProjects | projects, tasks | CRUD |
| useEvents | events | CRUD |
| useTeams | teams | CRUD |
| useTeamMembers | team_members | CRUD |
| useProfiles | profiles | Leitura, update |
| useDashboard | múltiplas | Queries agregadas |
| useSettings | organization_integrations | CRUD |

### Realtime

- **leads**: `postgres_changes` em `useLeadsKanban` com filtro `organization_id`
- Tabelas na publicação: leads, tasks, events, whatsapp_conversations, whatsapp_messages, payments

---

## 4. ESTADO DO BANCO DE DADOS

### Migrations

| # | Arquivo | Conteúdo |
|---|---------|----------|
| 01 | `00001_maestr_ia_schema` | Enums, organizations, profiles, teams, lead_pipelines, leads, clients, contracts, payments, whatsapp_* |
| 02 | `00002_indexes_rls_realtime` | Índices, funções RLS, policies, Realtime |
| 03 | `00003_leads_kanban_fields` | etapa_kanban, nicho, prioridade em leads |
| 04 | `00004_auth_setup` | Trigger handle_new_user, RLS profiles |
| 05 | `00005_role_based_rls` | RLS leads (viewer read-only) |
| 06 | `00006_dashboard_tables` | suppliers, supplier_expenses, goals, goal_progress |
| 07 | `00007_settings_module` | organization_integrations |
| 08 | `00008_security_audit_registration` | registration_codes, audit_logs |
| 09 | `00009_validate_registration_code` | Função validate_registration_code |
| 10 | `00010_invitation_tokens` | invitation_tokens, create/validate token |
| 11 | `00011_extended_crm_tables` | client_contacts, projects, tasks, events, event_attendees, colunas extras |
| 12 | `00012_report_tables_realtime` | report_templates, report_snapshots, policies teams, realtime tasks/events |

### Enums

- `user_role`, `lead_status`, `contract_status`, `payment_status`, `task_status`, `task_priority`, `event_type`, `conversation_status`, `report_type`, `goal_period`, `integration_type`, `registration_type`, `contract_type_enum`, `payment_periodicity`, `goal_indicator`

### Relacionamentos Principais

```
organizations
├── profiles
├── teams
│   └── team_members (→ profiles)
├── lead_pipelines
├── leads (→ profiles assigned_to)
├── clients
│   └── client_contacts
├── contracts (→ clients)
├── payments (→ clients, contracts)
├── suppliers
│   └── supplier_expenses
├── goals (→ teams, profiles)
├── projects (→ clients)
│   ├── tasks (→ profiles, teams)
│   └── project_members (→ profiles)
├── events
│   └── event_attendees (→ profiles, teams)
├── organization_integrations
├── report_templates
└── report_snapshots
```

---

## 5. COMPONENTES DE INTERFACE

### Layout

- **AppLayout**: Sidebar + Header + `<Outlet />`
- **AppSidebar**: 15 itens de menu, logo, botão de collapse
- **AppHeader**: Busca, notificações, menu do usuário

### Páginas

| Rota | Página | Tipo |
|------|--------|------|
| / | DashboardPage | Funcional |
| /kanban | LeadsKanbanPage | Funcional |
| /leads | Leads | Stub |
| /clients | ClientsPage | CRUD |
| /suppliers | SuppliersPage | CRUD |
| /financial | FinancialPage | CRUD |
| /agenda | Agenda | CRUD básico |
| /projects | ProjectsPage | CRUD |
| /goals | GoalsPage | CRUD |
| /team | TeamPage | Funcional |
| /settings | SettingsPage | Funcional (admin) |
| /whatsapp | WhatsApp | Stub |
| /meetings | Meetings | Stub |
| /campaign-reports | CampaignReports | Mock |
| /general-reports | GeneralReports | Mock |

### Componentes UI (shadcn)

Accordion, alert, alert-dialog, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, dropdown-menu, form, hover-card, input, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, tooltip, etc.

---

## 6. FUNCIONALIDADES – RESUMO

### Já Funcionais

- Login, logout, signup com token de convite
- Dashboard com KPIs reais
- Kanban de leads com Realtime
- CRUD clientes, fornecedores, projetos, metas, eventos
- Financeiro: contas a pagar/receber, criação e registro
- Equipe: colaboradores e equipes
- Configurações: integrações, convites
- Proteção de rotas por role

### Parcialmente Implementadas

- Projetos: sem Gantt
- Agenda: sem Google Calendar e participantes
- Equipe: sem folha de pagamento
- Kanban: sem botão "Novo lead"
- Relatórios: mock data

### Não Iniciadas

- Leads (lista): stub
- WhatsApp: stub
- Reuniões IA: stub
- Integração Google Calendar
- Integração WhatsApp real
- Integração n8n

---

## 7. INTEGRAÇÕES EXTERNAS

| Integração | Status | Observação |
|------------|--------|------------|
| Supabase | ✅ Ativo | Auth, Postgres, Realtime |
| Resend | ⚠️ Opcional | Edge Function invite-by-email |
| Google Calendar | 📋 Planejado | Schema e seção em Config |
| WhatsApp | 📋 Planejado | Schema e design docs |
| n8n | 📋 Planejado | Seção em Config, design docs |

---

## 8. PADRÕES DE ARQUITETURA

- **Estado remoto:** TanStack Query
- **Estado local:** useState em modais e formulários
- **Auth:** AuthContext
- **Dados:** Hooks por domínio (useClients, useSuppliers, etc.)
- **Sem camada de services:** Hooks chamam Supabase diretamente

---

## 9. DÍVIDAS TÉCNICAS

1. **Tipagem:** `(supabase as any)` em vários hooks
2. **TypeScript:** `strict`, `noImplicitAny`, `noUnusedLocals` desativados
3. **Páginas duplicadas:** Leads vs LeadsKanbanPage, Clients vs ClientsPage
4. **useLeadsKanban:** Usa useState/useEffect em vez de TanStack Query
5. **Relatórios:** Mock; não consomem Supabase
6. **Leads:** Sem botão "Novo lead" no Kanban

---

## 10. PRÓXIMOS PASSOS RECOMENDADOS

### Prioridade Alta

1. Regenerar tipos Supabase e remover `(supabase as any)`
2. Adicionar "Novo lead" no Kanban
3. Unificar rotas Leads / Kanban
4. Garantir role owner/admin para acessar Configurações

### Prioridade Média

5. Gantt em Projetos
6. Integração Google Calendar na Agenda
7. Participantes em eventos (event_attendees)
8. Conectar relatórios a dados reais

### Prioridade Baixa

9. WhatsApp real via n8n
10. Reuniões IA
11. Folha de pagamento
12. Habilitar strict mode no TypeScript gradualmente
