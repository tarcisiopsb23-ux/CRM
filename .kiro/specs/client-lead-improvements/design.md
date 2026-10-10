# Design: Client & Lead Improvements

## Overview

Este documento descreve o design técnico para as melhorias no CRM React/TypeScript com Supabase. As mudanças abrangem oito áreas funcionais: persistência de estado de UI, campos dropdown padronizados, unificação de campos de contato, faturamento dinâmico, gestão de indicadores, independência do dashboard do cliente, correção de dados reais nos dashboards e vinculação de blocos com tabelas Supabase.

O sistema já possui a infraestrutura de dados necessária (tabelas `client_kpis`, `client_kpi_history`, `hub_performance_daily_metrics`, `hub_performance_reports`, `conversation_kpis`). As mudanças são predominantemente de camada de apresentação e lógica de negócio no frontend.

## Architecture

```mermaid
graph TD
    subgraph "Frontend (React/TypeScript)"
        A[useFormPersistence hook] --> B[sessionStorage]
        C[ClientForm / LeadForm] --> A
        D[useClientKPIHistory] --> E[Faturamento Dinâmico]
        F[PublicDashboardPage] --> G[localStorage per slug]
        F --> H[useClientReports]
        F --> I[useClientConversationKpis]
    end

    subgraph "Supabase"
        H --> J[hub_performance_daily_metrics]
        H --> K[hub_performance_reports]
        I --> L[conversation_kpis]
        D --> M[client_kpi_history]
        N[clients table] --> O[origin / niche columns]
        P[leads table] --> O
    end

    subgraph "Auth"
        Q[Supabase Auth - sistema principal]
        R[localStorage client_auth_{slug} - dashboard público]
        Q -.independente.-> R
    end
```

## Components and Interfaces

### 1. Hook `useFormPersistence`

Hook genérico para persistir estado de formulário no `sessionStorage` por chave de rota/modal.

```typescript
function useFormPersistence<T>(key: string, initialValue: T): [T, (v: T) => void, () => void]
// retorna: [state, setState, clear]
```

- Salva automaticamente no `sessionStorage` a cada mudança de estado
- `clear()` remove a chave do `sessionStorage`
- Integrado ao evento `beforeunload` para limpar em refresh
- Integrado ao listener de logout do `AuthContext` para limpar todas as chaves `form_*`
- Integrado ao `useEffect` de navegação "back" via `popstate`

### 2. Constantes de Dropdown

```typescript
// src/constants/crmOptions.ts
export const ORIGEM_OPTIONS = [
  "Indicação", "Prospecção", "Tráfego Pago", "Tráfego Orgânico", "Outra"
] as const;

export const NICHO_OPTIONS = [
  "Restaurante", "Clínica", "Autônomo(a)", "Academia", "Oficina",
  "Varejo", "E-commerce", "Advocacia", "Infoproduto", "SaaS", "Outro"
] as const;
```

Substituem os campos `<Input>` livres de origem e nicho em `NovoLeadDialog`, `LeadDetailsModal` e `ClientsPage` (formulário de cliente).

### 3. Formulário de Cliente — Campos Unificados

Remoção de `responsible_name` / `responsible_phone` do estado do formulário e da UI. Manutenção de `decision_maker_name` / `decision_maker_phone`. Função de migração aplicada ao popular o formulário com dados existentes:

```typescript
function migrateResponsibleToDecisionMaker(client: Client): Partial<Client> {
  return {
    ...client,
    decision_maker_name: client.decision_maker_name ?? client.responsible_name,
    decision_maker_phone: client.decision_maker_phone ?? client.responsible_phone,
  };
}
```

### 4. Hook `useDynamicRevenue`

```typescript
function useDynamicRevenue(organizationId?: string, clientId?: string): {
  dynamicRevenue: number | null;  // null = sem histórico
  isLoading: boolean;
}
```

Busca `client_kpi_history` filtrando pelo KPI de nome "Faturamento" (ou `unit === 'currency'`), filtra valores `> 0`, calcula média arredondada a 2 casas decimais. Retorna `null` quando não há histórico válido.

### 5. Gestão de Indicadores — `useClientKPIHistory` (extensão)

Adicionar mutações `update` e `remove` ao hook existente `useClientKPIHistory` em `src/hooks/useClientKPIs.ts`:

```typescript
const update = useMutation({ /* PATCH client_kpi_history by id */ });
const remove = useMutation({ /* DELETE client_kpi_history by id */ });
```

O componente `KPIPreviousHistory` recebe as novas ações e renderiza botões Editar/Excluir por linha, com dialog de confirmação para exclusão.

### 6. Dashboard Público — Autenticação por Slug

Sem alterações na lógica existente (já usa `localStorage` com chave `client_auth_${slug}`). Garantir que:
- O handler de logout do `AuthContext` não toca chaves `client_auth_*`
- O `PublicDashboardLoginPage` valida contra `metadata.dashboard_password`

### 7. Correção de Queries no Dashboard Público

O `PublicDashboardPage` já usa `useClientReports` e `useClientConversationKpis`. O problema está nas tabelas consultadas dentro de `useHubPerformance.ts`:

| Hook atual | Tabela errada | Tabela correta |
|---|---|---|
| `useClientReports` → `campaignDataQuery` | `campaign_data` | `hub_performance_reports` |
| `useClientReports` → `dailyMetricsQuery` | `daily_metrics` | `hub_performance_daily_metrics` |

Atualizar as queries para usar os nomes corretos das tabelas.

## Data Models

### Tabela `clients` (existente — sem migração necessária)

Os campos `origin` e `niche` já existem. Os campos `responsible_name` e `responsible_phone` permanecem no banco (sem DROP) para compatibilidade, mas são removidos da UI. A migração de dados é feita em runtime via `migrateResponsibleToDecisionMaker`.

### Tabela `leads` (existente)

Os campos `source` (origem) e `nicho` já existem no schema. O formulário `NovoLeadDialog` já tem os campos, mas como `<Input>` livre — serão convertidos para `<Select>` com as opções padronizadas.

### `hub_performance_daily_metrics` — Colunas mapeadas

| Bloco UI | Coluna | Cálculo |
|---|---|---|
| Investimento | `total_spend` | soma do período |
| Leads | `total_leads` | soma do período |
| Vendas | `total_sales` | soma do período |
| Faturamento | `revenue` | soma do período |
| ROAS | — | `revenue / total_spend` |
| Taxa de Conversão | — | `total_sales / total_leads × 100` |

### `sessionStorage` — Esquema de chaves

```
form_client_{clientId|"new"}   → Partial<Client>
form_lead_{leadId|"new"}       → CreateLeadInput
form_contract_{contractId|"new"} → Partial<Contract>
```

### `localStorage` — Dashboard público

```
client_auth_{slug}  → { id, name, company, organization_id, metadata, ... }
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Persistência de formulário é round-trip

*Para qualquer* conjunto de valores de formulário e qualquer chave de rota, salvar os valores via `useFormPersistence` e depois ler do `sessionStorage` deve retornar os mesmos valores.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Logout limpa todas as chaves de formulário

*Para qualquer* conjunto de chaves `form_*` presentes no `sessionStorage`, após disparar o evento de logout, nenhuma chave com prefixo `form_` deve permanecer no `sessionStorage`.

**Validates: Requirements 1.4**

### Property 3: Opções de dropdown são completas e fixas

*Para qualquer* instância dos componentes de formulário de cliente ou lead, o conjunto de opções exibidas para Origem deve ser exatamente `["Indicação", "Prospecção", "Tráfego Pago", "Tráfego Orgânico", "Outra"]` e para Nicho deve ser exatamente `["Restaurante", "Clínica", "Autônomo(a)", "Academia", "Oficina", "Varejo", "E-commerce", "Advocacia", "Infoproduto", "SaaS", "Outro"]`.

**Validates: Requirements 2.5, 2.6**

### Property 4: Conversão de lead preserva origem e nicho

*Para qualquer* lead com valores de `source` e `nicho` definidos, o cliente criado a partir da conversão desse lead deve ter `origin === lead.source` e `niche === lead.nicho`.

**Validates: Requirements 2.8**

### Property 5: Migração de responsável para decisor é não-destrutiva

*Para qualquer* cliente com `responsible_name` preenchido e `decision_maker_name` nulo, a função `migrateResponsibleToDecisionMaker` deve retornar um objeto onde `decision_maker_name === responsible_name`. Se `decision_maker_name` já estiver preenchido, deve ser preservado sem alteração.

**Validates: Requirements 3.9**

### Property 6: Cálculo de faturamento dinâmico filtra e arredonda corretamente

*Para qualquer* lista de registros de histórico de KPI, a função de cálculo de faturamento dinâmico deve: (a) ignorar valores `<= 0`, (b) retornar `null` se não houver valores válidos, e (c) retornar a média arredondada a exatamente 2 casas decimais quando houver valores válidos.

**Validates: Requirements 4.1, 4.7, 4.8**

### Property 7: Recálculo após mutação de indicador é consistente

*Para qualquer* estado de histórico de KPI, após uma operação de edição ou exclusão de um registro, o valor de `dynamicRevenue` retornado pelo hook deve refletir o novo estado do histórico (sem o registro excluído ou com o valor atualizado).

**Validates: Requirements 5.7**

### Property 8: Sessão do dashboard público é isolada por slug

*Para qualquer* slug de cliente, a chave de armazenamento usada deve ser `client_auth_${slug}`, e operações de logout no sistema principal não devem remover ou modificar essa chave.

**Validates: Requirements 6.3, 6.4**

### Property 9: Cálculos de métricas de performance são corretos

*Para qualquer* conjunto de valores de `total_spend`, `total_leads`, `total_sales` e `revenue` maiores que zero, os cálculos derivados devem satisfazer: `ROAS = revenue / total_spend` e `taxa_conversao = (total_sales / total_leads) * 100`.

**Validates: Requirements 8.5, 8.6**

### Property 10: Dados temporais são agrupados por data corretamente

*Para qualquer* lista de registros de `hub_performance_daily_metrics` com datas repetidas, a agregação por data deve somar os valores de cada coluna numérica para registros com a mesma data, sem duplicar ou perder registros.

**Validates: Requirements 8.7**

## Error Handling

| Cenário | Comportamento |
|---|---|
| `sessionStorage` indisponível (modo privado/quota) | Capturar exceção, operar sem persistência (degradação graciosa) |
| KPI history vazio ao calcular faturamento dinâmico | Retornar `null`, exibir campo manual |
| Query Supabase falha no dashboard público | Exibir zero nos cards, log de erro no console |
| Slug inválido no dashboard público | Redirecionar para `/public/dashboard/${slug}/login` |
| Confirmação de exclusão cancelada | Nenhuma ação, fechar dialog |
| Tabela `hub_performance_daily_metrics` sem dados no período | Exibir zeros e mensagem "Sem dados para o período" |

## Testing Strategy

### Abordagem Dual

Testes unitários cobrem exemplos específicos, edge cases e integrações. Testes de propriedade cobrem invariantes universais com inputs gerados aleatoriamente.

### Testes Unitários (exemplos e edge cases)

- `useFormPersistence`: verificar que chave correta é usada no sessionStorage, que `clear()` remove a chave
- `migrateResponsibleToDecisionMaker`: exemplo com `responsible_name` preenchido e `decision_maker_name` nulo; exemplo com ambos preenchidos (preserva decision_maker)
- `ORIGEM_OPTIONS` e `NICHO_OPTIONS`: verificar que as constantes contêm exatamente os valores especificados
- `useDynamicRevenue`: edge case com lista vazia (retorna null), edge case com todos os valores zero (retorna null)
- Formulário de cliente: verificar que `responsible_name`/`responsible_phone` não aparecem no estado inicial
- Dashboard público: verificar que logout do sistema principal não remove `client_auth_*` do localStorage
- Queries Supabase: verificar que `useClientReports` usa `hub_performance_reports` e `hub_performance_daily_metrics`

### Testes de Propriedade (property-based testing)

Biblioteca: **fast-check** (já compatível com o ecossistema Vitest/TypeScript do projeto).

Configuração mínima: **100 iterações** por propriedade.

Cada teste deve incluir comentário de rastreabilidade:
`// Feature: client-lead-improvements, Property N: <texto da propriedade>`

| Propriedade | Geradores fast-check |
|---|---|
| P1: Round-trip sessionStorage | `fc.record({ empresa: fc.string(), nicho: fc.option(fc.string()) })` |
| P2: Logout limpa form_* | `fc.array(fc.string({ minLength: 1 }))` para chaves |
| P3: Opções de dropdown | Verificação estática (sem gerador necessário) |
| P4: Conversão lead→cliente | `fc.record({ source: fc.constantFrom(...ORIGEM_OPTIONS), nicho: fc.constantFrom(...NICHO_OPTIONS) })` |
| P5: Migração responsável→decisor | `fc.record({ responsible_name: fc.option(fc.string()), decision_maker_name: fc.option(fc.string()) })` |
| P6: Cálculo de média | `fc.array(fc.float({ min: -1000, max: 100000 }), { minLength: 0, maxLength: 50 })` |
| P7: Recálculo após mutação | `fc.array(fc.record({ value: fc.float({ min: 0.01, max: 100000 }) }))` |
| P8: Isolamento de sessão por slug | `fc.string({ minLength: 1 })` para slug |
| P9: Cálculos ROAS e conversão | `fc.record({ spend: fc.float({ min: 0.01 }), revenue: fc.float({ min: 0 }), leads: fc.integer({ min: 1 }), sales: fc.integer({ min: 0 }) })` |
| P10: Agrupamento por data | `fc.array(fc.record({ date: fc.string(), total_spend: fc.float({ min: 0 }) }))` |
