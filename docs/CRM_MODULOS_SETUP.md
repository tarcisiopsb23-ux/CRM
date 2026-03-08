# Módulos CRM - Setup e Execução

## O que foi implementado

### 1. Migration 00011 (`supabase/migrations/00011_extended_crm_tables.sql`)

- **client_contacts** – contatos por cliente
- **Colunas adicionais em clients**: registration_date, registration_type, niche, origin, revenue, priority, responsible_name, responsible_phone
- **Colunas adicionais em contracts**: service_contracted, contract_type, periodicity, contract_date
- **Colunas adicionais em suppliers**: service_category, pix
- **Coluna em goals**: indicator (inadimplencia, efetivacoes, faturamento, numero_contatos, outro)
- **projects** – projetos
- **tasks** – tarefas (Gantt)
- **project_members** – membros do projeto
- **events** – eventos da agenda
- **event_attendees** – participantes (pessoa/equipe)

### 2. Páginas com Supabase

| Módulo | Arquivo | Funcionalidades |
|--------|---------|-----------------|
| **Clientes** | `ClientsPage.tsx` | Cadastro manual + conversão do Kanban (etapa Efetivados) |
| **Fornecedores** | `SuppliersPage.tsx` | CRUD completo (nome, CPF/CNPJ, endereço, telefone, e-mail, categoria, Pix) |
| **Financeiro** | `FinancialPage.tsx` | Contas a pagar (supplier_expenses) e a receber (payments), botão para registrar pagamento |
| **Projetos** | `ProjectsPage.tsx` | Lista e criação de projetos, contagem de tarefas |
| **Metas** | `GoalsPage.tsx` | CRUD com indicadores (inadimplência, efetivações, faturamento, contatos) |

### 3. Hooks criados

- `useClients`, `useSuppliers`, `usePayments`, `useSupplierExpenses`, `useProjects`, `useTasks`, `useGoals`

---

## Próximos passos

### 1. Rodar a migration

```bash
supabase db push
```

Ou, no Supabase local: `supabase migration up`

### 2. Páginas ainda como stub (podem ser evoluídas)

- **Agenda** – integração com Google Calendar e delegação
- **Equipe** – gestão de usuários (convite já em Settings)
- **Leads, WhatsApp, Reuniões, Campanhas, Relatórios** – continuam como stub

### 3. Funcionalidades pendentes

- **Clientes**: dados do contrato e lista de pagamentos no detalhe (requisito 4)
- **Financeiro**: modal de detalhes com cancelar, alterar, concluir (requisito 6)
- **Projetos**: gráfico de Gantt e atribuição por pessoa/equipe (requisito 8)
- **Agenda**: integração Google Calendar e delegação (requisito 7)
- **Equipe**: tela de gestão de usuários e níveis (requisito 9)

---

## Rotas atualizadas

- `/clients` → ClientsPage (Supabase)
- `/suppliers` → SuppliersPage (Supabase)
- `/financial` → FinancialPage (Supabase)
- `/projects` → ProjectsPage (Supabase)
- `/goals` → GoalsPage (Supabase)
