# ANÁLISE TÉCNICA – HOOKS, TIPOS E ARQUITETURA
## Projeto Maestr.IA CRM/ERP

**Data:** 06/03/2026  
**Escopo:** Hooks, tipagem, Supabase, páginas duplicadas, TanStack Query, melhorias arquiteturais.

---

## 1. RESUMO EXECUTIVO

A análise identificou **27 ocorrências** de `(supabase as any)`, **1 hook** fora do padrão TanStack Query, **várias inconsistências** entre tipos do banco e tipos usados nos hooks, **8 páginas duplicadas/órfãs** e oportunidades de refatoração arquitetural.

---

## 2. HOOKS – TIPAGEM E CONSISTÊNCIA

### 2.1 Inventário de Hooks

| Hook | Usa TanStack Query | Usa `(supabase as any)` | Retorno tipado |
|------|--------------------|--------------------------|----------------|
| useClients | ✅ | ✅ (3x) | `Client` (types/crm) |
| useSuppliers | ✅ | ✅ (2x) | `Supplier` (types/crm) |
| useFinancial (payments) | ✅ | ✅ (1x) | `Payment` + join |
| useFinancial (expenses) | ✅ | ✅ (1x) | `SupplierExpense` |
| useGoalsCRUD | ✅ | ✅ (2x) | `Goal` (local) |
| useProjects | ✅ | ✅ (4x) | `Project`, `Task` (local) |
| useEvents | ✅ | ✅ (4x) | `EventRow` (local) |
| useTeams | ✅ | ✅ (6x) | `TeamRow`, `TeamMemberRow` (local) |
| useProfiles | ✅ | ✅ (2x) | `ProfileRow` (local) |
| useLeadsKanban | ❌ | ❌ | `Lead` (types/database) |
| useDashboard | ✅ | ❌ | Tipos locais |
| useSettings (useIntegration) | ✅ | ❌ | `IntegrationRow` (local) |
| useProfile | ❌ (useState) | ❌ | `Profile` (types/auth) |
| useOrganization | N/A | N/A | string \| undefined |
| useRequireRole | N/A | N/A | boolean |

### 2.2 Problemas de Tipagem nos Hooks

1. **useClients**  
   - Usa `Client` de `types/crm` com campos (`registration_type`, `niche`, `origin`, etc.) que não existem em `types/supabase` (clients Row).  
   - O banco tem esses campos (migration 00011), mas os tipos Supabase estão desatualizados.

2. **useSuppliers**  
   - Usa `data as unknown as Supplier[]` — cast duplo indica incompatibilidade de tipos.  
   - `(supabase as any)` em create e update.

3. **useGoalsCRUD**  
   - Define `Goal` localmente com `indicator`; tipos Supabase podem não refletir.

4. **useProjects / useTasks**  
   - Define `Project` e `Task` localmente; não usa tipos do Supabase.  
   - Quatro usos de `(supabase as any)` em create/update.

5. **useEvents**  
   - Define `EventRow` local; sem uso dos tipos gerados do Supabase.

6. **useTeams / useProfiles**  
   - Tipos locais `TeamRow`, `ProfileRow` etc.; sem vínculo com `Database` do Supabase.

7. **useLeadsKanban**  
   - Retorna `Lead[]` com join `profiles:assigned_to(full_name)`.  
   - O tipo `Lead` em `database.ts` não inclui `profiles`; a resposta real tem formato diferente.

8. **useProfile**  
   - Usa `useState`/`useEffect` em vez de TanStack Query, divergindo do padrão do projeto.

---

## 3. USO DE `(supabase as any)`

### 3.1 Ocorrências por Arquivo

| Arquivo | Quantidade | Operações |
|---------|------------|-----------|
| useTeams.ts | 6 | from, insert, update, delete |
| useEvents.ts | 4 | from, insert, update, delete |
| useProjects.ts | 4 | from (projects, tasks), update |
| useClients.ts | 3 | from, insert, update |
| useGoalsCRUD.ts | 2 | from, insert, update |
| useSuppliers.ts | 2 | from, insert, update |
| useFinancial.ts | 2 | from (payments, supplier_expenses), insert |
| useProfiles.ts | 2 | from, update |
| CompleteRegistrationPage.tsx | 1 | rpc |
| **Total** | **26** | |

### 3.2 Motivo do Uso

O cliente Supabase é tipado com `Database` em `lib/supabase.ts`. O uso de `(supabase as any)` indica que:

1. Os tipos em `Database` não cobrem colunas/tabelas adicionadas nas migrations.  
2. Há conflito entre o tipo esperado e o retorno real (joins, RPC, etc.).  
3. O desenvolvedor evitou erros de TypeScript com cast em vez de corrigir os tipos.

---

## 4. INCONSISTÊNCIAS ENTRE TIPOS DO BANCO E HOOKS

### 4.1 `types/supabase.ts` vs migrations

| Entidade | Em supabase.ts | Nas migrations | Observação |
|----------|----------------|----------------|------------|
| clients | Sem `registration_type`, `niche`, `origin`, `revenue`, `responsible_name`, `responsible_phone`, `address` | 00011 adiciona | **Tipos desatualizados** |
| suppliers | Tem `address_*` | 00011 adiciona `service_category`, `pix` | Possível desatualização |
| contracts | Campos básicos | 00011 adiciona `service_contracted`, `contract_type`, `periodicity`, `contract_date` | Possível desatualização |
| goals | — | 00011 adiciona `indicator` | Verificar se existe em supabase.ts |
| events | — | 00011 | Tabela em supabase.ts? |
| projects, tasks | — | 00011 | Tabelas em supabase.ts? |
| report_templates, report_snapshots | — | 00012 | Tabelas em supabase.ts? |

### 4.2 `types/crm.ts` vs `types/supabase.ts`

- **Client**: `crm.ts` tem campos extras que `supabase.ts` não tem.  
- **Contract, Payment, Supplier, SupplierExpense**: definidos em `crm.ts`; relação com `supabase.ts` não verificada de forma consistente.

### 4.3 Tipos locais nos hooks

- **useProfiles**: `ProfileRow` local; poderia usar `Database['public']['Tables']['profiles']['Row']`.  
- **useTeams**: `TeamRow`, `TeamMemberRow` locais.  
- **useEvents**: `EventRow` local.  
- **useGoalsCRUD**: `Goal` local.  
- **useProjects**: `Project`, `Task` locais.

Risco de divergência com o schema real ao longo do tempo.

---

## 5. PÁGINAS DUPLICADAS E ÓRFÃS

### 5.1 Páginas em uso vs. não utilizadas

| Rota | Página usada | Página não usada | Status |
|------|--------------|------------------|--------|
| /leads | — | Leads.tsx (Stub) | Stub em uso; Kanban em /kanban |
| /kanban | LeadsKanbanPage | — | ✅ Em uso |
| /clients | ClientsPage | Clients.tsx (Stub) | Stub não usado |
| /suppliers | SuppliersPage | Suppliers.tsx (Stub) | Stub não usado |
| /projects | ProjectsPage | Projects.tsx (Stub) | Stub não usado |
| / | DashboardPage | Dashboard.tsx, Index.tsx | Index e Dashboard não usados |
| /financial | FinancialPage | Financial.tsx | Financial.tsx não usado |
| /goals | GoalsPage | Goals.tsx | Goals.tsx não usado |

### 5.2 Kanban – duas implementações

| Arquivo | Componentes | Uso |
|---------|-------------|-----|
| LeadsKanbanPage | KanbanBoard, LeadsKanbanColumn, LeadCard, LeadDetailsModal | ✅ Em /kanban |
| KanbanPage | KanbanColumn, KanbanCard, LeadDetailModal | ❌ Órfã |

`KanbanPage` usa stages em inglês (`received`, `qualified`, etc.); `LeadsKanbanPage` usa `EtapaKanban` em português. Duas implementações paralelas.

### 5.3 Lista de arquivos órfãos

- `Leads.tsx` — Stub em /leads  
- `Clients.tsx` — Stub não referenciado  
- `Suppliers.tsx` — Stub não referenciado  
- `Projects.tsx` — Stub não referenciado  
- `Dashboard.tsx` — Não referenciado  
- `Index.tsx` — Não referenciado  
- `Financial.tsx` — Não referenciado  
- `Goals.tsx` — Não referenciado  
- `KanbanPage.tsx` — Não referenciado  
- `KanbanColumn.tsx`, `KanbanCard.tsx`, `LeadDetailModal.tsx` — Usados apenas por KanbanPage órfã  

---

## 6. TANSTACK QUERY

### 6.1 Padrão atual

Hooks com TanStack Query costumam:

- `useQuery` com `queryKey` e `queryFn`  
- `useMutation` para create/update/remove  
- `useQueryClient().invalidateQueries()` em `onSuccess`  
- `enabled: !!organizationId` (ou similar) para queries condicionais  

### 6.2 Exceções

1. **useLeadsKanban**  
   - Usa `useState` + `useEffect` + `useCallback`.  
   - Implementa refetch manual e subscription Realtime.  
   - Não usa TanStack Query.  
   - Dificulta cache, invalidação e consistência com outros módulos.

2. **useProfile**  
   - Usa `useState` + `useEffect`.  
   - Alternativa: `useQuery` com `queryKey: ['profile', userId]`.

### 6.3 Boas práticas já em uso

- `staleTime: 30_000` no `QueryClient`  
- `queryKey` estruturado (`["clients", organizationId]`, etc.)  
- Uso de `enabled` para evitar queries desnecessárias  

---

## 7. PROBLEMAS IDENTIFICADOS

### 7.1 Críticos

| # | Problema | Impacto |
|---|----------|---------|
| 1 | 26 usos de `(supabase as any)` | Perda de type-safety, erros em runtime |
| 2 | Tipos Supabase desatualizados em relação às migrations | Dados reais podem não bater com tipos |
| 3 | useLeadsKanban fora do TanStack Query | Sem cache, invalidação e padrão unificado |
| 4 | Duas implementações de Kanban (LeadsKanbanPage vs KanbanPage) | Confusão e manutenção duplicada |

### 7.2 Moderados

| # | Problema | Impacto |
|---|----------|---------|
| 5 | Vários tipos definidos nos hooks em vez de `Database` | Risco de divergência com o schema |
| 6 | Páginas stub duplicadas (Leads, Clients, etc.) | Código morto e confusão |
| 7 | useProfile sem TanStack Query | Padrão inconsistente |
| 8 | `data as unknown as T` em alguns hooks | Indício de tipos inadequados |

### 7.3 Menores

| # | Problema | Impacto |
|---|----------|---------|
| 9 | `noImplicitAny: false`, `strictNullChecks: false` no tsconfig | Menos checagens estáticas |
| 10 | Tipos `Client`, `Payment` etc. em `crm.ts` sem derivação explícita do `Database` | Possível desalinhamento com schema |

---

## 8. MELHORIAS SUGERIDAS

### 8.1 Prioridade alta

1. **Regenerar tipos Supabase**  
   ```bash
   npx supabase gen types typescript --local > src/types/supabase.ts
   ```  
   (ou com `--project-id` para remoto.)

2. **Remover `(supabase as any)`**  
   - Após regenerar tipos, ajustar queries para usar tipos do `Database`.  
   - Para joins/RPC, definir tipos auxiliares quando necessário.

3. **Migrar useLeadsKanban para TanStack Query**  
   - Usar `useQuery` para fetch inicial.  
   - Manter subscription Realtime para invalidação via `queryClient.invalidateQueries`.  
   - Usar `useMutation` para `updateEtapaKanban`.

4. **Resolver duplicação de páginas**  
   - Decidir: manter `/leads` como stub ou redirecionar para `/kanban`.  
   - Remover páginas stub órfãs (Clients, Suppliers, Projects, etc.) ou consolidar em uma única abordagem.

### 8.2 Prioridade média

5. **Remover KanbanPage e componentes associados**  
   - Se não houver uso futuro: KanbanPage, KanbanColumn, KanbanCard, LeadDetailModal.

6. **Alinhar tipos dos hooks ao `Database`**  
   - Preferir `Database['public']['Tables']['X']['Row']` em vez de interfaces locais.  
   - Criar tipos derivados apenas quando houver joins (ex.: `Lead & { profiles: ... }`).

7. **Migrar useProfile para TanStack Query**  
   - Usar `useQuery` com `queryKey: ['profile', userId]`.

8. **Unificar fontes de tipo**  
   - Revisar `types/crm.ts` e `types/database.ts` para derivar de `Database` ou manter como extensões explícitas.

### 8.3 Prioridade baixa

9. **Habilitar strict mode no TypeScript**  
   - `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, em etapas.

10. **Padronizar nomenclatura**  
    - Ex.: LeadDetailsModal vs LeadDetailModal; escolher um padrão e remover o outro.

---

## 9. SUGESTÕES DE REFATORAÇÃO

### 9.1 useLeadsKanban → TanStack Query

```
Estrutura sugerida:
- useQuery para fetch (queryKey: ["leads", organizationId])
- useMutation para updateEtapaKanban
- useEffect para subscription Realtime que chama queryClient.invalidateQueries
- Retorno: { data, isLoading, error, updateEtapaKanban, refetch }
```

### 9.2 Tipagem do Supabase

```
Fluxo sugerido:
1. supabase gen types
2. Garantir que Database inclui todas as tabelas das migrations
3. Nos hooks, usar: supabase.from("clients").select<"*", ClientRow>("*")
4. Para joins, definir: type ClientWithRelations = ClientRow & { clients: {...} }
```

### 9.3 Consolidação de páginas

```
Opções:
A) Remover stubs órfãos (Clients, Suppliers, Projects, Financial, Goals, Dashboard, Index)
B) Redirecionar /leads → /kanban
C) Remover KanbanPage e KanbanColumn/Card/LeadDetailModal antigos
```

### 9.4 Camada de serviços (opcional)

```
Estrutura sugerida:
src/
  services/
    clients.ts    # fetchClients, createClient, updateClient, deleteClient
    leads.ts
    ...
  hooks/
    useClients.ts # useQuery/useMutation que chamam services
```

Separa responsabilidades e facilita testes, mas exige refatoração maior.

---

## 10. CHECKLIST DE AÇÕES

- [ ] Regenerar `src/types/supabase.ts`  
- [ ] Remover todos os `(supabase as any)`  
- [ ] Refatorar useLeadsKanban para TanStack Query  
- [ ] Remover ou redirecionar páginas duplicadas/stub  
- [ ] Remover KanbanPage e componentes antigos  
- [ ] Migrar useProfile para TanStack Query  
- [ ] Derivar tipos dos hooks de `Database`  
- [ ] Revisar e alinhar `types/crm.ts` com `Database`  
- [ ] Documentar decisões (ex.: stub vs redirecionamento em /leads)

---

*Relatório gerado por análise estática do código. Recomenda-se validação em ambiente de desenvolvimento antes de aplicar refatorações.*
