# Maestr.IA - Modelagem de Banco de Dados

## Visão Geral

Modelagem Supabase para CRM/ERP de agências. Multi-tenant preparado via `organization_id` em todas as tabelas principais.

---

## 1. Diagrama de Relacionamentos (Simplificado)

```
organizations
    ├── profiles (usuários)
    ├── teams
    │   └── team_members
    ├── lead_pipelines
    │   └── leads
    ├── clients
    │   ├── client_contacts
    │   └── whatsapp_contacts
    ├── contracts ─────────────────── projects
    │   └── payments              ├── project_members
    ├── suppliers                 └── tasks
    │   └── supplier_expenses
    ├── goals
    │   └── goal_progress
    ├── events
    │   └── event_attendees
    ├── whatsapp_contacts
    │   └── whatsapp_conversations
    │       └── whatsapp_messages
    └── report_templates
        └── report_snapshots
```

---

## 2. Tabelas e Campos Principais

| Tabela | Campos Chave | Propósito |
|--------|--------------|-----------|
| **organizations** | name, slug, settings | Tenant principal |
| **profiles** | full_name, email, role, organization_id | Usuários (extensão de auth.users) |
| **teams** | name, lead_id | Equipes de trabalho |
| **leads** | stage_id, pipeline_id, assigned_to, position | Kanban - coluna e ordem |
| **clients** | name, document, company | Clientes convertidos |
| **contracts** | client_id, value, status, start_date | Contratos |
| **payments** | contract_id, value, due_date, status | Pagamentos (entrada) |
| **suppliers** | name, document | Fornecedores |
| **supplier_expenses** | supplier_id, value, due_date | Despesas |
| **goals** | target_value, period, period_start/end | Metas e indicadores |
| **projects** | client_id, start_date, end_date | Projetos |
| **tasks** | project_id, parent_id, dependencies | Tarefas (Gantt) |
| **events** | start_at, end_at, event_type | Agenda |
| **whatsapp_conversations** | contact_id, assigned_to | Conversas |
| **whatsapp_messages** | conversation_id, direction | Mensagens |
| **report_templates** | report_type, config | Templates de relatório |

---

## 3. Índices Criados

- **organization_id** em todas as tabelas principais (filtro RLS e multi-tenant)
- **pipeline_id + stage_id + position** em leads (Kanban)
- **start_date, end_date** em projects/tasks/events (Gantt, agenda)
- **conversation_id + created_at** em whatsapp_messages
- **due_date, status** em payments e supplier_expenses

---

## 4. Estratégia RLS

| Nível | Permissões |
|-------|------------|
| **owner** | CRUD total na organização |
| **admin** | CRUD total (exceto billing) |
| **manager** | CRUD operacional, pode gerenciar equipes |
| **member** | CRUD em leads, tasks, eventos; leitura em metas |
| **viewer** | Somente leitura |

**Funções helper:**
- `get_user_organization_id()` – retorna org do usuário logado
- `user_has_role(roles[])` – verifica role
- `user_can_access(org_id)` – verifica se pertence à org

Todas as policies usam `organization_id = get_user_organization_id()` para garantir isolamento por tenant.

---

## 5. Realtime

Tabelas na publication `supabase_realtime`:

| Tabela | Uso |
|--------|-----|
| leads | Atualização em tempo real do Kanban |
| tasks | Sincronização do Gantt |
| events | Agenda colaborativa |
| whatsapp_conversations | Novas conversas |
| whatsapp_messages | Mensagens em tempo real |
| payments | Notificações de pagamento |

Para usar no frontend: `supabase.channel().on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, callback)`.

---

## 6. Preparação Multi-Tenant

- Todas as tabelas possuem `organization_id` (exceto profiles, que usa via FK)
- Filtros RLS garantem isolamento
- Queries devem sempre incluir `WHERE organization_id = :org_id` em joins complexos
- Para escalar: partition por `organization_id` em tabelas muito grandes no futuro

---

## 7. Setup Inicial

O primeiro `organization` e `profile` (owner) precisam ser criados manualmente ou via script, pois as policies RLS exigem um usuário já vinculado à org. Opções:

- **Opção A:** Usar o SQL Editor do Supabase (sem RLS) com um script de bootstrap
- **Opção B:** Trigger em `auth.users` que cria org + profile no primeiro signup
- **Opção C:** Endpoint backend com service role para onboarding

---

## 8. Execução

```bash
# Via Supabase CLI
supabase db push

# Ou executar manualmente no SQL Editor do Supabase:
# 1. 00001_maestr_ia_schema.sql
# 2. 00002_indexes_rls_realtime.sql
```

**Ordem:** executar migrações na sequência numérica.
