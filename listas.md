# 📋 Listas Module - Status & Roadmap

> **Última atualização**: 09/06/2026  
> **Status Geral**: Etapas 1-5 Concluídas | Etapa 6 Pendente

---

## 📊 Resumo Executivo

| Etapa | Nome | Status | Progresso |
|-------|------|--------|-----------|
| 1 | Schema & Migrations | ✅ Concluído | 100% |
| 2 | Auto-Linking Engine | ✅ Concluído | 100% |
| 3 | Gerenciamento de Listas | ✅ Concluído | 100% |
| 4 | Leads Pendentes | ✅ Concluído | 100% |
| 5 | Closer Performance | ✅ Concluído | 100% |
| 6 | Commercial Intelligence | ⏳ Planejado | 0% |

---

## ✅ CONCLUÍDO: Etapa 1 - Schema & Migrations

### Arquivo
- `supabase/migrations/00022_listas_campaigns_setup.sql`

### O Que Foi Feito

**Tabelas Criadas:**
- `listas`: Armazena listas de leads por (cidade, nicho)
  - Campos: id, organization_id, nome, cidade, estado, nicho, versao, responsavel_id, origem_principal, data_criacao, status, observacoes
  - Constraint único: (organization_id, cidade, nicho, versao)
  - Status: ativa | pausada | encerrada
  
- `lead_lista_history`: Auditoria de vinculações
  - Rastreia: lead_id, lista_id_from, lista_id_to, changed_by, changed_at, reason
  - Permite análise histórica de movimentações

**Funções RPC Criadas:**
- `link_lead_to_lista(p_lead_id, p_organization_id)`: Vincula um lead à lista por matching (cidade + nicho)
- `auto_link_pending_leads(p_organization_id)`: Batch operation para vincular todos os leads sem lista

**Políticas RLS:**
- SELECT: todos os membros da organização
- INSERT/UPDATE: owner + admin
- DELETE: owner apenas

**Indexação:**
- Índices em organization_id, status, lead_id para performance

---

## ✅ CONCLUÍDO: Etapa 2 - Auto-Linking Engine

### Arquivos Modificados
- `src/hooks/useLeadsKanban.ts`
- `src/types/database.ts` (adicionado `lista_id` e `closer_id` em Lead)

### O Que Foi Feito

**Integração em `useLeadsKanban`:**
- `createLead()`: Auto-link acionado após criação (se cidade + nicho)
- `importLeadsBatch()`: Auto-link para cada lead importado
- Erros de auto-link não bloqueiam a criação (logged, silencioso)

**Type Updates:**
- `interface Lead` atualizada com:
  - `lista_id: string | null` (antes: campaign_id)
  - `closer_id: string | null` (novo campo)

**Tratamento de Erros:**
- Auto-link falha silenciosamente (log warning)
- Lead continua sendo criado mesmo se matching falhar

---

## ✅ CONCLUÍDO: Etapa 3 - Gerenciamento de Listas

### Arquivos Criados
- `src/hooks/useListasManager.ts` (210 linhas)
- `src/pages/ListasPage.tsx` (380+ linhas)

### Funcionalidades Implementadas

**Hook `useListasManager` - 11 Operações:**
1. `fetchListas(filters)`: Listar com filtro por status/cidade/nicho
2. `getLista(cidade, nicho)`: Buscar uma lista específica
3. `createLista(input)`: Criar com detecção de duplicata
4. `createListaVersion(cidade, nicho, input)`: Criar versão nova (versao++)
5. `updateLista(listaId, input)`: Editar propriedades
6. `deleteLista(listaId)`: Deletar sem cascata para leads
7. `linkLeadToLista(leadId, listaId)`: Vincular manualmente
8. `unlinkLeadFromLista(leadId)`: Remover vínculo
9. `autoLinkLead(leadId)`: Chamar RPC individual
10. `autoLinkPendingLeads()`: Chamar RPC batch
11. `getListaHistory(leadId)`: Recuperar auditoria

**Página `ListasPage` - UI Completa:**
- Tabela com 8 colunas: nome, cidade, nicho, versão, status, responsável, data criação, ações
- Filtros: status (ativa/pausada/encerrada), cidade, nicho
- Dialog "Criar Lista" com warnings de duplicata:
  - "Usar Existente" vs "Criar Versão"
- Dialog "Editar Lista": nome, status, responsável, observações
- Ações: Edit, Delete
- Loader states e toast notifications

---

## ✅ CONCLUÍDO: Etapa 4 - Leads Pendentes

### Arquivo Criado
- `src/pages/LeadsPendingPage.tsx` (350+ linhas)

### Funcionalidades Implementadas

**Visualização:**
- Lista todos os leads com `lista_id IS NULL`
- Colunas: checkbox, empresa, nicho, cidade, responsável, valor, listas compatíveis, ações

**Ações de Vinculação:**
1. **Auto-Link Automático**: Botão para batch RPC `auto_link_pending_leads()`
2. **Multi-Select**: Selecionar N leads
   - Dropdown para escolher lista destino
   - Botão "Vincular X Lead(s) Para [Lista]"
3. **Individual**: Vincular um lead por vez
   - Dialog com seletor de lista + opção "Criar Nova"
4. **Criar Lista Inline**: Pre-preenchida com cidade + nicho do lead

**Listas Compatíveis:**
- Mostra todas as listas que combinam (cidade + nicho) do lead
- Facilita seleção rápida

---

## ✅ CONCLUÍDO: Etapa 5 - Closer Performance

### Arquivos Criados
- `src/hooks/useCloserPerformance.ts` (210 linhas)
- `src/pages/ClosersPerformancePage.tsx` (380+ linhas)

### Modificações
- `src/App.tsx`: Adicionado import + rota `/closers-performance`
- `src/components/layout/AppSidebar.tsx`: Adicionado menu item "Performance Closers"

### Funcionalidades Implementadas

**Hook `useCloserPerformance` - Métricas Calculadas:**

| Métrica | Descrição |
|---------|-----------|
| `leads_recebidos` | Total atribuído ao closer |
| `contatos_efetivos` | Saíram de "leads_recebidos" |
| `leads_qualificados` | Em etapas intermediárias |
| `reunioes_agendadas` | Total agendadas |
| `reunioes_realizadas` | Que geraram propostas/fechamentos |
| `propostas_enviadas` | Propostas emitidas |
| `clientes_fechados` | Deals fechados |
| `receita_gerada` | Total em vendas |
| `taxa_contato` | contatos / leads * 100 |
| `taxa_reuniao` | reunioes / leads * 100 |
| `taxa_cliente` | clientes / leads * 100 |
| `taxa_pos_reuniao` | clientes / reunioes * 100 |

**Página `ClosersPerformancePage` - Dashboard:**

**Filtros:**
- PeriodSelector (mês atual, últimos 3 meses, etc)
- Dropdown de closer (admin/manager only)

**KPI Cards (4):**
- Leads Recebidos (+ taxa contato)
- Clientes Fechados (+ taxa conversão)
- Receita Gerada (+ ticket médio)
- Taxa Pós-Reunião

**Gráficos:**
- Funil de Vendas: 6 etapas (Leads → Fechados)
- Taxas de Conversão: Contato, Reunião, Cliente

**Tabela Comparativa (Admin Only):**
- Ranking de closers quando selecionado "Todos"
- Colunas: Nome, Leads, Contatos, Taxa Contato, Qualificados, Reuniões, Taxa Reunião, Fechados, Taxa Cliente, Receita
- Linha TOTAL com agregações
- Badges coloridas: verde (alto), cinza (médio), outline (baixo)

**Detalhes Expandidos:**
- Contatos Efetivos
- Leads Qualificados
- Reuniões Agendadas
- Reuniões Realizadas
- Propostas Enviadas
- Ticket Médio

**Controles de Acesso:**
- Closers: veem apenas seus dados (auto-filtrado)
- Admin/Manager: veem filtro dropdown para comparar closers

**Rota:** `/closers-performance`  
**Menu:** "Performance Closers" com ícone TrendingUp

---

## ⏳ PENDENTE: Etapa 6 - Commercial Intelligence

### Status
- **Início**: Não iniciado
- **Prioridade**: Alta (completa a visão de BI)
- **Estimativa**: 3-4 horas

### O Que Precisa Ser Feito

**1. Hook `useCommercialIntelligence.ts`**
```typescript
interface CommercialMetrics {
  // Por Nicho
  topNichos: Array<{
    nicho: string;
    leads: number;
    conversao: number;
    receita: number;
    ticket_medio: number;
  }>;

  // Por Cidade
  topCities: Array<{
    cidade: string;
    estado: string;
    leads: number;
    conversao: number;
    receita: number;
  }>;

  // Por Origem
  byOrigin: Array<{
    origem: string;
    leads: number;
    qualificacao: number;
  }>;

  // Por Closer x Nicho (matriz)
  closerNichoMatrix: Array<{
    closer_id: string;
    closer_name: string;
    nicho: string;
    leads: number;
    conversao: number;
  }>;
}
```

**2. SQL View ou RPC**
- Materializar agregações para performance
- Views: `vw_niche_performance`, `vw_city_performance`, etc
- Alternativa: RPC com CTEs complexas

**3. Página `CommercialIntelligencePage.tsx`**

**Seções:**
- **Top Nichos**: Tabela com melhores niches por conversão/receita
- **Geographic Heat**: Mapa de cidades mais lucrativas
- **Origem Performance**: Qualidade de leads por origem
- **Closer Performance Matrix**: Heatmap de conversão (closer x nicho)
- **Time-Series Trends**: Gráfico de receita ao longo do tempo
- **Comparativo**: Mês atual vs mês anterior

**Filtros:**
- PeriodSelector
- Período customizado para análise histórica

**Componentes:**
- Tabelas com sorting
- Heatmap (recharts com cells coloridas)
- Line chart para trends
- Cards de resumo

---

## 🔗 Arquivos do Projeto

### Arquivos Criados
```
src/hooks/
  - useListasManager.ts ✅
  - useCloserPerformance.ts ✅
  - useCommercialIntelligence.ts ⏳

src/pages/
  - ListasPage.tsx ✅
  - LeadsPendingPage.tsx ✅
  - ClosersPerformancePage.tsx ✅
  - CommercialIntelligencePage.tsx ⏳

supabase/migrations/
  - 00022_listas_campaigns_setup.sql ✅
```

### Arquivos Modificados
```
src/App.tsx ✅
src/types/database.ts ✅
src/hooks/useLeadsKanban.ts ✅
src/components/layout/AppSidebar.tsx ✅
```

---

## 🚀 Como Continuar (Etapa 6)

### Passo 1: Criar Hook de Inteligência Comercial
```bash
# Estrutura básica em useCommercialIntelligence.ts
- Queries agregadas por nicho, cidade, origem
- Cálculos de taxa de conversão
- Análise de ticket médio
```

### Passo 2: Adicionar SQL Views
```sql
-- supabase/migrations/00023_commercial_intelligence_views.sql
CREATE VIEW vw_niche_performance AS (...)
CREATE VIEW vw_city_performance AS (...)
CREATE VIEW vw_origin_quality AS (...)
```

### Passo 3: Criar Página de BI
```
CommercialIntelligencePage.tsx
- Importar useCommercialIntelligence
- Renderizar seções de BI
- Charts com recharts
- Heatmaps e matrizes
```

### Passo 4: Integrar no App
```
1. Adicionar import em App.tsx
2. Adicionar rota: /commercial-intelligence
3. Adicionar menu em AppSidebar.tsx
4. Icon: Compass ou BarChart3
```

---

## 📋 Checklist Final

**Concluído:**
- [x] Schema completo com RLS e triggers
- [x] Auto-linking em criação de leads
- [x] CRUD de listas com deduplicação
- [x] Visualização de leads pendentes
- [x] Dashboard de closer performance
- [x] Roteirização e menu

**Próximo:**
- [ ] Hook de inteligência comercial
- [ ] Views SQL de agregação
- [ ] Dashboard de BI
- [ ] Integração de rota e menu
- [ ] Testes E2E

---

## 💡 Notas Técnicas

### Padrões Utilizados
- **PeriodSelector Component**: Reutilizável em todos os dashboards
- **useQuery Hook**: Caching automático com @tanstack/react-query
- **RLS Policies**: Segurança multi-tenant por organization_id
- **Metric Aggregation**: Pattern de cálculo per-entity → totals

### Performance
- Índices em organization_id, status, lead_id
- RPC para batch operations
- Queries materializadas (views) para BI
- Caching via @tanstack/react-query

### Segurança
- RLS policies em todas as tabelas
- Role-based visibility (closer vê só seus dados)
- Auditoria em lead_lista_history
- Organização_id em todos os queries

---

## 📞 Contato & Suporte

Para continuar a implementação da Etapa 6:
1. Executar o passo a passo acima
2. Testar com dados reais do banco
3. Validar performance com large datasets
4. Deploy e monitoramento

**Data de início da Etapa 6**: A confirmar

---

*Documento mantido como single source of truth para o módulo Listas*
