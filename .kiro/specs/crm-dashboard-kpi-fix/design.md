# CRM Dashboard KPI Fix — Bugfix Design

## Overview

O dashboard público (`PublicDashboardPage`) e o componente `ConversationKpiDashboard` estão quebrados por três causas independentes:

1. **Views/RPC ausentes no Supabase**: `client_conversation_kpis`, `client_agent_kpis` e `get_client_data` não existem — nenhuma migration as criou. Toda requisição retorna HTTP 500.
2. **Cálculo incorreto do Tempo Médio de Atendimento**: apenas leads `status = 'fechado'` são considerados; leads `'perdido'` são ignorados.
3. **canalData ignora o filtro de período**: a query de `crm_leads` em `AtendimentoSection` não aplica `dateRange`, exibindo sempre o total histórico.

A estratégia de correção é cirúrgica: criar a migration com as views/RPC faltantes, corrigir o filtro de status no cálculo de tempo médio, e adicionar o filtro de data na query de `canalData`.

---

## Glossary

- **Bug_Condition (C)**: Condição que ativa o defeito — qualquer uma das três causas raiz descritas acima.
- **Property (P)**: Comportamento correto esperado quando a condição de bug é satisfeita.
- **Preservation**: Comportamentos existentes que NÃO devem ser alterados pela correção.
- **`client_conversation_kpis`**: View Supabase que agrega KPIs de conversas por `client_id`, `period_date`, `source` e `campaign`.
- **`client_agent_kpis`**: View Supabase que agrega KPIs por agente humano.
- **`get_client_data`**: RPC Supabase que retorna dados do cliente autenticado (já existe em `20260325000000_auth_rpcs.sql` — precisa apenas ser garantida via migration idempotente).
- **`AtendimentoSection`**: Componente interno de `PublicDashboardPage.tsx` que renderiza o dashboard de atendimento.
- **`canalData`**: Estado local em `AtendimentoSection` derivado de uma query direta a `crm_leads`.
- **`dateRange`**: Objeto `{ from: string; to: string }` (formato `yyyy-MM-dd`) controlado pelo `PeriodDropdown` no header.
- **`tempoMedioVidaDias`**: Média de dias entre `created_at` e `updated_at` para leads concluídos.

---

## Bug Details

### Bug Condition

O bug se manifesta em três cenários distintos, todos com a mesma raiz: ausência de objetos no banco ou lógica de filtragem incorreta no frontend.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input de tipo { action: string; clientId?: string; dateRange?: DateRange; leadStatus?: string }
  OUTPUT: boolean

  // Causa 1: views/RPC ausentes
  IF input.action IN ['load_atendimento_tab', 'load_dashboard']
     AND NOT viewExists('client_conversation_kpis')
     AND NOT viewExists('client_agent_kpis')
  THEN RETURN true

  // Causa 2: cálculo de tempo médio ignora 'perdido'
  IF input.action = 'compute_tempo_medio'
     AND input.leadStatus = 'perdido'
     AND leadIsExcludedFromCalculation(input.leadStatus)
  THEN RETURN true

  // Causa 3: canalData sem filtro de período
  IF input.action = 'fetch_canal_data'
     AND input.dateRange IS NOT NULL
     AND queryIgnoresDateRange(input.dateRange)
  THEN RETURN true

  RETURN false
END FUNCTION
```

### Examples

- **Causa 1**: Usuário acessa aba "Atendimento" → `useClientConversationKpis` consulta `client_conversation_kpis` → Supabase retorna `{ code: "42P01", message: "relation does not exist" }` → dashboard exibe erro 500.
- **Causa 2**: Existem 10 leads `'fechado'` (média 5 dias) e 5 leads `'perdido'` (média 20 dias). O KPI exibe 5 dias em vez de ~10 dias (média correta incluindo perdidos).
- **Causa 3**: Usuário seleciona "Últimos 7 dias" no `PeriodDropdown`. `canalData` continua mostrando todos os leads históricos (ex.: 200 leads) em vez dos 12 leads do período.
- **Edge case**: Nenhum lead `'fechado'` ou `'perdido'` no período → `tempoMedioVidaDias` deve ser `null` (sem divisão por zero).

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Cliques com mouse em botões e navegação entre abas devem continuar funcionando exatamente como antes.
- A aba "Performance" deve continuar exibindo campanhas, métricas diárias e KPIs de negócio normalmente.
- A aba "CRM" deve continuar exibindo o kanban de leads e as estatísticas do `CrmSection` normalmente.
- Leads com `status = 'fechado'` devem continuar sendo incluídos no cálculo do tempo médio.
- O hook `useClientConversationKpis` deve continuar calculando `totals`, `trend`, `byCampaign`, `bySource` e `byAgent` corretamente quando as views existirem.
- O estado vazio do `ConversationKpiDashboard` deve continuar sendo exibido sem erros quando não há dados.

**Scope:**
Todos os inputs que NÃO envolvem as três condições de bug acima devem ser completamente inalterados pela correção. Isso inclui:
- Qualquer interação com a aba "Performance"
- Qualquer interação com a aba "CRM"
- Autenticação e troca de senha
- Drag-and-drop do kanban

---

## Hypothesized Root Cause

1. **Views não criadas (Causa 1)**: As migrations existentes (`20260324000003_new_tables_and_views.sql` e posteriores) não incluem `CREATE VIEW client_conversation_kpis` nem `CREATE VIEW client_agent_kpis`. A RPC `get_client_data` existe em `20260325000000_auth_rpcs.sql` mas pode não ter sido aplicada em todos os ambientes — a nova migration deve ser idempotente com `DROP IF EXISTS` + `CREATE`.

2. **Filtro de status incompleto (Causa 2)**: Em `AtendimentoSection` (linha ~889 de `PublicDashboardPage.tsx`), o filtro é:
   ```ts
   const fechados = data.filter(l => l.status === "fechado" && l.updated_at && l.created_at);
   ```
   O requisito é incluir `'perdido'` também, pois ambos representam leads concluídos.

3. **Ausência de filtro de data na query de canalData (Causa 3)**: A query em `AtendimentoSection` (linha ~872) é:
   ```ts
   supabase.from("crm_leads").select("status, proposal_value, origin, updated_at, created_at")
   ```
   Sem cláusula `.gte("created_at", dateRange.from).lte("created_at", dateRange.to)`. O `useEffect` também não lista `dateRange` nas dependências, então não re-executa quando o período muda.

---

## Correctness Properties

Property 1: Bug Condition — Views e RPC existem e retornam dados

_For any_ requisição ao dashboard onde `isBugCondition` retorna `true` pela Causa 1 (views ausentes), após a migration ser aplicada, o sistema SHALL consultar `client_conversation_kpis` e `client_agent_kpis` com sucesso (sem erro 500) e a RPC `get_client_data` SHALL retornar os dados do cliente.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Tempo Médio inclui leads perdidos

_For any_ conjunto de leads onde existem leads com `status = 'perdido'` com `updated_at` e `created_at` válidos, o cálculo de `tempoMedioVidaDias` SHALL incluir esses leads junto com os `'fechado'`, produzindo uma média ponderada correta sobre todos os leads concluídos.

**Validates: Requirements 2.3**

Property 3: Bug Condition — canalData respeita o filtro de período

_For any_ `dateRange` selecionado pelo usuário, a query de `canalData` SHALL filtrar `crm_leads` por `created_at BETWEEN dateRange.from AND dateRange.to`, e o `useEffect` SHALL re-executar sempre que `dateRange` mudar.

**Validates: Requirements 2.4**

Property 4: Preservation — Comportamentos não afetados permanecem inalterados

_For any_ input que NÃO envolva as três condições de bug (ex.: acesso à aba Performance, CRM, autenticação, drag-and-drop), o sistema corrigido SHALL produzir exatamente o mesmo resultado que o sistema original, preservando toda a funcionalidade existente.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

---

## Fix Implementation

### Changes Required

**Arquivo 1**: `supabase/migrations/20260325000010_kpi_views.sql` *(novo)*

**Mudanças**:
1. **Criar `client_conversation_kpis`**: View que agrega dados de conversas por `client_id`, `period_date` (truncado por dia), `source` e `campaign`. Colunas: `client_id`, `period_date`, `source`, `campaign`, `conversations`, `bot_finished`, `human_transfer`, `leads_identified`, `conversions`. Assumindo tabela base `conversations` ou similar — a view deve ser criada com `CREATE OR REPLACE VIEW`.
2. **Criar `client_agent_kpis`**: View que agrega por agente. Colunas: `client_id`, `period_date`, `agent_name`, `conversations_started`, `conversations_finished`, `conversions`.
3. **Garantir `get_client_data`**: Incluir `DROP FUNCTION IF EXISTS get_client_data()` + `CREATE FUNCTION` idempotente (já existe na migration anterior, mas a nova migration garante aplicação em ambientes que pularam a anterior).

---

**Arquivo 2**: `src/pages/PublicDashboardPage.tsx`

**Função**: `AtendimentoSection` (linha ~858)

**Mudanças específicas**:

1. **Corrigir filtro de status para tempo médio** (Causa 2):
   ```ts
   // ANTES:
   const fechados = data.filter(l => l.status === "fechado" && l.updated_at && l.created_at);
   
   // DEPOIS:
   const concluidos = data.filter(l =>
     (l.status === "fechado" || l.status === "perdido") && l.updated_at && l.created_at
   );
   const tempoMedioVidaDias = concluidos.length > 0
     ? concluidos.reduce((acc, l) => {
         const dias = (new Date(l.updated_at!).getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24);
         return acc + dias;
       }, 0) / concluidos.length
     : null;
   ```

2. **Adicionar filtro de data na query de canalData** (Causa 3):
   ```ts
   // ANTES:
   supabase.from("crm_leads")
     .select("status, proposal_value, origin, updated_at, created_at")
     .then(...)
   
   // DEPOIS:
   supabase.from("crm_leads")
     .select("status, proposal_value, origin, updated_at, created_at")
     .gte("created_at", dateRange.from)
     .lte("created_at", dateRange.to + "T23:59:59")
     .then(...)
   ```

3. **Adicionar `dateRange` nas dependências do `useEffect`** (Causa 3):
   ```ts
   // ANTES:
   }, [clientId]);
   
   // DEPOIS:
   }, [clientId, dateRange.from, dateRange.to]);
   ```

---

## Testing Strategy

### Validation Approach

A estratégia segue duas fases: primeiro, executar testes exploratórios no código **não corrigido** para confirmar as causas raiz; depois, verificar que a correção resolve os bugs e não introduz regressões.

### Exploratory Bug Condition Checking

**Goal**: Confirmar as três causas raiz antes de implementar a correção.

**Test Plan**: Escrever testes que simulam as condições de bug e observar as falhas no código original.

**Test Cases**:
1. **View ausente**: Chamar `supabase.from("client_conversation_kpis").select("*")` diretamente — deve retornar erro `42P01` no código não corrigido.
2. **Tempo médio sem perdidos**: Criar dataset com leads `'fechado'` (2 dias) e `'perdido'` (10 dias) — o cálculo atual deve retornar 2 dias em vez de 6 dias.
3. **canalData sem filtro**: Criar leads fora do `dateRange` e verificar que aparecem no `canalData` no código não corrigido.
4. **useEffect sem dateRange**: Mudar `dateRange` e verificar que `canalData` não re-executa a query.

**Expected Counterexamples**:
- Query a `client_conversation_kpis` retorna `{ error: { code: "42P01" } }`.
- `tempoMedioVidaDias` ignora leads `'perdido'`, produzindo média incorreta.
- `canalData` retorna leads fora do período selecionado.

### Fix Checking

**Goal**: Verificar que para todos os inputs onde `isBugCondition` retorna `true`, a função corrigida produz o comportamento esperado.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Casos concretos**:
- Após migration: `supabase.from("client_conversation_kpis").select("*")` retorna `{ data: [...], error: null }`.
- Com leads `'fechado'` (2d) e `'perdido'` (10d): `tempoMedioVidaDias === 6`.
- Com `dateRange = { from: "2025-01-01", to: "2025-01-07" }`: `canalData` contém apenas leads criados nesse intervalo.

### Preservation Checking

**Goal**: Verificar que para todos os inputs onde `isBugCondition` retorna `false`, o sistema corrigido produz o mesmo resultado que o original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Testes baseados em propriedades são recomendados para preservation checking porque:
- Geram muitos casos de teste automaticamente no domínio de entrada.
- Capturam edge cases que testes unitários manuais podem perder.
- Fornecem garantias fortes de que o comportamento é inalterado para todos os inputs não-bugados.

**Test Cases**:
1. **Leads `'fechado'` preservados**: Verificar que leads `'fechado'` continuam incluídos no cálculo de tempo médio após a correção.
2. **Aba Performance inalterada**: Verificar que `campaignDataQuery` e `dailyMetricsQuery` retornam os mesmos dados antes e depois da correção.
3. **CrmSection inalterado**: Verificar que o kanban e as estatísticas do `CrmSection` não são afetados.
4. **Estado vazio preservado**: Quando não há dados de conversas, `ConversationKpiDashboard` deve continuar exibindo estado vazio sem erros.

### Unit Tests

- Testar `tempoMedioVidaDias` com apenas leads `'fechado'` (comportamento preservado).
- Testar `tempoMedioVidaDias` com leads `'fechado'` + `'perdido'` (comportamento corrigido).
- Testar `tempoMedioVidaDias` com lista vazia → deve retornar `null`.
- Testar que a query de `canalData` inclui filtros `.gte` e `.lte` quando `dateRange` é fornecido.
- Testar que o `useEffect` re-executa quando `dateRange.from` ou `dateRange.to` mudam.

### Property-Based Tests

- Gerar conjuntos aleatórios de leads com status `'fechado'` e `'perdido'` e verificar que `tempoMedioVidaDias` é a média aritmética correta sobre todos eles.
- Gerar `dateRange` aleatórios e verificar que nenhum lead fora do intervalo aparece em `canalData`.
- Gerar leads com status aleatórios (exceto `'fechado'`/`'perdido'`) e verificar que `tempoMedioVidaDias` é `null` quando não há concluídos.

### Integration Tests

- Fluxo completo: autenticar → acessar aba "Atendimento" → verificar que não há erro 500 (após migration).
- Selecionar período diferente no `PeriodDropdown` → verificar que `canalData` atualiza com os dados corretos do período.
- Verificar que a aba "Performance" e a aba "CRM" continuam funcionando normalmente após todas as correções.
