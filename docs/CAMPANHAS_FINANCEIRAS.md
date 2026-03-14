# Campanhas e Dados Financeiros - Vinculação ao Módulo Financeiro

## Visão Geral

O módulo de **Campanhas e Publicidade** (Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads) armazena dados de gastos com anúncios e receitas geradas. Esses dados são **consultivos e informativos** para comparativos com lançamentos financeiros, sem sincronização automática de registros.

```
Campanhas (Ad Accounts + Campaigns + Metrics)
    │
    └─→ [INFORMATIVO APENAS]
        Comparativos no Dashboard Financeiro:
        - Spend em campanhas vs Despesas lançadas em Fornecedores
        - Receita de conversão vs Pagamentos recebidos
        - ROI/ROAS por período
```

---

## Estrutura de Dados

As campanhas são organizadas em **3 camadas**:

| Nível | Tabela | Dados |
|-------|--------|-------|
| **1. Conta** | `ad_accounts` | Conexões com plataformas (Google, Meta, etc) |
| **2. Campanha** | `campaigns` | Campanha individual com orçamento definido |
| **3. Métrica** | `campaign_metrics` | Gastos e receitas DIÁRIAS de cada campanha |

---

## 1. Tabela: `ad_accounts`

**Descrição:** Contas de anúncios conectadas do Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads, etc.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `organization_id` | UUID | ✅ | Organização/empresa (FK: organizations.id) |
| `platform` | TEXT | ✅ | Plataforma: `meta_ads`, `google_ads`, `tiktok_ads`, `linkedin_ads`, `other` |
| `account_name` | VARCHAR(255) | ✅ | Nome da conta (ex: "Conta Meta Ads Principal") |
| `account_external_id` | TEXT | ✅ | ID da conta na plataforma (ex: `act_123456`) |
| `currency` | TEXT | ✅ | Moeda (padrão: `BRL`) |
| `timezone` | TEXT | ❌ | Fuso horário da conta |
| `status` | TEXT | ✅ | Status: `active`, `inactive`, `disconnected` |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |
| `updated_at` | TIMESTAMPTZ | ✅ | Data de atualização (auto, trigger) |

**Índices:**
- `idx_ad_accounts_org` → Busca por organização
- `idx_ad_accounts_platform` → Filtro por plataforma
- `idx_ad_accounts_external_id` → Sincronização com API externa

**RLS:** Ativado (isolamento por organização)

**Nota Financeira:**
- Múltiplas contas podem estar ativas na mesma organização
- Cada conta pode ter várias campanhas
- Pauta comparativa: qual plataforma gasta mais?

---

## 2. Tabela: `campaigns`

**Descrição:** Campanhas individuais importadas das plataformas de anúncios. Contém orçamento **planejado** vs **gasto real**.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `ad_account_id` | UUID | ✅ | Conta de anúncios (FK: ad_accounts.id) |
| `organization_id` | UUID | ✅ | Organização/empresa (FK: organizations.id) |
| `platform` | TEXT | ✅ | Plataforma (desnormalizada) |
| `campaign_external_id` | TEXT | ✅ | ID da campanha na plataforma |
| `name` | VARCHAR(255) | ✅ | Nome da campanha (ex: "Black Friday 2025") |
| `status` | TEXT | ✅ | Status: `active`, `paused`, `archived`, `removed` |
| `objective` | TEXT | ❌ | Objetivo: `SALES`, `LEADS`, `AWARENESS`, `ENGAGEMENT`, etc |
| `budget_type` | TEXT | ❌ | Tipo de orçamento: `daily` ou `lifetime` |
| **`budget_amount`** | NUMERIC(15,2) | ❌ | **Orçamento planejado da campanha** |
| `start_date` | DATE | ❌ | Data de início |
| `end_date` | DATE | ❌ | Data de encerramento |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |
| `updated_at` | TIMESTAMPTZ | ✅ | Data de atualização (auto, trigger) |

**Índices:**
- `idx_campaigns_account` → Associação com ad_account
- `idx_campaigns_org` → Filtro por organização
- `idx_campaigns_platform` → Filtro por plataforma
- `idx_campaigns_external_id` → Sincronização
- `idx_campaigns_status` → Campanhas ativas vs encerradas

**RLS:** Ativado (leitura por organização, edit apenas para admins)

**Campos Financeiramente Relevantes:**
- `budget_amount` → Orçamento planejado para a campanha
- `start_date` / `end_date` → Período de análise
- `status` → Campanhas ativas = gastos esperados

**Comparativa com Financeiro:**
- Budget informado na plataforma vs Spend real em `campaign_metrics`
- Orçamento mensal em campanhas vs Despesas lançadas no Financeiro para marketing

---

## 3. Tabela: `campaign_metrics`

**Descrição:** **Série temporal diária** de métricas de cada campanha. Contém gastos reais (`spend`), receita gerada (`revenue`), e indicadores de performance.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `campaign_id` | UUID | ✅ | Campanha (FK: campaigns.id) |
| `organization_id` | UUID | ✅ | Organização (desnormalizada) |
| `date` | DATE | ✅ | Data das métricas (um registro por dia/campanha) |
| **`spend`** | NUMERIC(15,2) | ✅ | **Valor gasto na campanha NESTE DIA** |
| **`revenue`** | NUMERIC(15,2) | ✅ | **Receita gerada (conversões com valor) NESTE DIA** |
| `impressions` | BIGINT | ✅ | Número de impressões |
| `clicks` | BIGINT | ✅ | Número de cliques |
| `reach` | BIGINT | ✅ | Alcance (pessoas únicas) |
| `leads` | BIGINT | ✅ | Leads gerados |
| `conversions` | BIGINT | ✅ | Conversões totais |
| **`ctr`** | NUMERIC(5,2) | ✅ | **GERADO**: CTR% = (clicks / impressions) × 100 |
| **`cpc`** | NUMERIC(10,2) | ✅ | **GERADO**: Custo por clique = spend / clicks |
| **`cpm`** | NUMERIC(10,2) | ✅ | **GERADO**: Custo por mil impressões = (spend / impressions) × 1000 |
| **`roas`** | NUMERIC(10,2) | ✅ | **GERADO**: Retorno = revenue / spend |
| **`cpa`** | NUMERIC(10,2) | ✅ | **GERADO**: Custo por aquisição = spend / conversions |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |

**Campos Gerados (não inserir):**
- `ctr`, `cpc`, `cpm`, `roas`, `cpa` → Calculados automaticamente

**Índices:**
- `idx_campaign_metrics_campaign` → Busca por campanha
- `idx_campaign_metrics_org_date` → **Critical**: Dashboards financeiros por período
- `idx_campaign_metrics_date` → Filtro por data

**RLS:** Ativado (leitura por organização)

**Campos Financeiramente Relevantes:**
- `spend` → Custo real da campanha no dia
- `revenue` → Receita gerada no dia (se houver rastreamento de conversão com valor)
- `date` → Período para comparativos mensais/diários
- `roas` → Rentabilidade: cada R$ 1 gasto gerou R$ X de receita

---

## Dados Financeiros Extraíveis

### Spend Total por Período
```sql
SELECT 
  DATE_TRUNC('month', date)::date as mes,
  SUM(spend) as gasto_total_campanhas
FROM campaign_metrics
WHERE organization_id = '{org_id}'
GROUP BY DATE_TRUNC('month', date)
ORDER BY mes DESC;
```

### Spend por Plataforma
```sql
SELECT 
  c.platform,
  DATE_TRUNC('month', m.date)::date as mes,
  SUM(m.spend) as gasto_por_plataforma
FROM campaign_metrics m
JOIN campaigns c ON m.campaign_id = c.id
WHERE m.organization_id = '{org_id}'
GROUP BY c.platform, DATE_TRUNC('month', m.date)
ORDER BY mes DESC, gasto_por_plataforma DESC;
```

### Spend vs Budget por Campanha
```sql
SELECT 
  c.name,
  c.budget_amount as orcamento_planejado,
  SUM(m.spend) as gasto_realizado,
  ROUND((SUM(m.spend) / NULLIF(c.budget_amount, 0) * 100), 2) as percentual_orçamento
FROM campaigns c
LEFT JOIN campaign_metrics m ON c.id = m.campaign_id
WHERE c.organization_id = '{org_id}'
  AND c.status != 'removed'
GROUP BY c.id, c.name, c.budget_amount
ORDER BY percentual_orçamento DESC;
```

### Receita Gerada por Campanha
```sql
SELECT 
  c.name,
  c.platform,
  SUM(m.spend) as custo_total,
  SUM(m.revenue) as receita_total,
  ROUND(AVG(m.roas), 2) as roas_medio
FROM campaign_metrics m
JOIN campaigns c ON m.campaign_id = c.id
WHERE m.organization_id = '{org_id}'
  AND m.date >= DATE_TRUNC('month', CURRENT_DATE)::date
GROUP BY c.id, c.name, c.platform
ORDER BY roas_medio DESC;
```

---

## Integração com Módulo Financeiro

### ⚠️ Sem Sincronização Automática

**Importante:** Os gastos em campanhas (`spend` em `campaign_metrics`) **NÃO geram automaticamente** lançamentos no módulo Financeiro.

Razão: Campanhas e Financeiro são sistemas separados:
- **Campanhas** = Dados de plataformas externas (Google Ads, Meta Ads, etc)
- **Financeiro** = Registros contábeis internos (supplier_expenses, payments, etc)

O usuário deve **manualmente lançar** as despesas de marketing em `Fornecedores` ou categoria de marketing.

### Caso de Uso: Comparativa de Marketing

```
1. Usuário acessa Dashboard Financeiro
2. Vê lançamentos de "Despesas com Marketing":
   ex: R$ 5.000 em supplier_expenses com description "Google Ads"
   
3. Acessa relatório de Campanhas:
   ex: SUM(spend) = R$ 5.200 em campaign_metrics no mesmo período
   
4. Identifica discrepâncias:
   - Gasto real foi R$ 5.200, mas lançou R$ 5.000
   - Diferença: R$ 200 não registrado
   
5. Corrige o lançamento no Financeiro
```

### Dados Comparáveis

| Financeiro | Campanhas | Uso |
|-----------|-----------|-----|
| `supplier_expenses.value` | `SUM(campaign_metrics.spend)` | Total gasto no período |
| `supplier_expenses.due_date` | `campaign_metrics.date` | Período de análise |
| `supplier_expenses.status = 'pago'` | `campaign_metrics` (sempre sindincado) | Despesa efetivada |
| Descrição do lançamento | `campaigns.name` + `campaigns.platform` | Rastreabilidade |

---

## Exemplo de Dashboard Comparativo

```
┌─────────────────────────────────────────────────────────────┐
│           MARKETING - Comparativa Gastos e ROI              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Período: Março 2025                                       │
│                                                             │
│  📊 CAMPANHAS (Dados de Plataformas)                       │
│  ├─ Google Ads:     R$ 3.500 (ROAS: 2.8)                  │
│  ├─ Meta Ads:       R$ 2.200 (ROAS: 1.9)                  │
│  └─ TikTok Ads:     R$ 500   (ROAS: 0.5)                  │
│     TOTAL:          R$ 6.200                               │
│                                                             │
│  💰 FINANCEIRO (Despesas Lançadas)                          │
│  ├─ Google Ads:     R$ 3.500 ✅                            │
│  ├─ Meta Ads:       R$ 2.000 ⚠️ (Faltam R$ 200)           │
│  └─ TikTok Ads:     R$ 500   ✅                            │
│     TOTAL:          R$ 6.000                               │
│                                                             │
│  ⚠️ DISCREPÂNCIA: R$ 200 não lançado                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## ROI e ROAS

**ROAS (Return on Ad Spend)** é calculado **automaticamente** em `campaign_metrics`:

```sql
roas = revenue / spend
```

### Interpretação:
- **ROAS > 1** → Ganho (a cada R$ 1 gasto, gerou mais de R$ 1)
- **ROAS = 1** → Break-even
- **ROAS < 1** → Prejuízo

### Exemplo:
```
Campanha: "Black Friday"
Spend:    R$ 1.000
Revenue:  R$ 2.800
ROAS:     2.8 (cada R$ 1 investido gerou R$ 2,80)
```

---

## Queries para Analistas Financeiros

### 1. Gastos de Marketing vs Receitas Geradas
```sql
SELECT 
  DATE_TRUNC('month', m.date)::date as periodo,
  SUM(m.spend) as gasto_campanhas,
  SUM(m.revenue) as receita_campanhas,
  ROUND(AVG(m.roas), 2) as roas_medio
FROM campaign_metrics m
WHERE m.organization_id = '{org_id}'
GROUP BY DATE_TRUNC('month', m.date)
ORDER BY periodo DESC;
```

### 2. Campanhas Mais Rentáveis
```sql
SELECT 
  c.name,
  c.platform,
  SUM(m.spend) as custo,
  SUM(m.revenue) as receita,
  ROUND(AVG(m.roas), 2) as roas
FROM campaign_metrics m
JOIN campaigns c ON m.campaign_id = c.id
WHERE m.organization_id = '{org_id}'
  AND m.date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY c.id, c.name, c.platform
HAVING SUM(m.spend) > 0
ORDER BY m.roas DESC;
```

### 3. Eficiência de Gasto por Plataforma (Últimos 30 Dias)
```sql
SELECT 
  c.platform,
  COUNT(DISTINCT c.id) as num_campanhas,
  SUM(m.spend) as gasto_total,
  SUM(m.conversions) as conversoes_totais,
  ROUND(SUM(m.spend) / NULLIF(SUM(m.conversions), 0), 2) as cpa_medio,
  ROUND(AVG(m.roas), 2) as roas_medio
FROM campaign_metrics m
JOIN campaigns c ON m.campaign_id = c.id
WHERE m.organization_id = '{org_id}'
  AND m.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.platform
ORDER BY cpa_medio ASC;
```

---

## Notas Importantes

### 1️⃣ Dados Importados de APIs Externas

Os dados em `campaigns` e `campaign_metrics` são **sincronizados automaticamente** de APIs externas (Google Ads, Meta Ads, etc). Não devem ser editados manualmente.

### 2️⃣ Revenue = Conversões Rastreáveis

O campo `revenue` em `campaign_metrics` é **zero se a plataforma não tiver conversão com valor configurada**. É preciso:
- Google Ads: Configurar "Conversão com valor"
- Meta: Ativar Pixel com eventos de compra
- TikTok: Ativar Conversão com valor

### 3️⃣ Sem Geração Automática de Lançamentos

**Gastos em campanhas ≠ Lançamentos no Financeiro**

Para conformidade contábil:
- Importar relatório de campapaigns
- Lançar manualmente em `supplier_expenses` ou categoria específica de marketing
- Comparar totalizações periodicamente

### 4️⃣ Colunas Geradas

Nunca insira/ atualize manualmente:
- `ctr`, `cpc`, `cpm`, `roas`, `cpa` → PostgreSQL calcula

### 5️⃣ Isolamento por Organização

Cada organização vê apenas suas campanhas (RLS ativado).

---

## Último Update
**Data:** Março 2026  
**Tabelas Versão:** 003 (marketing_tables.sql)
