# Workflow de Automação de Coleta de Dados de Campanhas (n8n)

Este documento descreve a estrutura lógica e técnica para criar um workflow no n8n que automatiza a coleta diária de dados de performance de campanhas do Google Ads e Meta Ads, consolidando-os no banco de dados Supabase do CRM.

## 1. Visão Geral

*   **Objetivo:** Centralizar métricas de marketing (Impressões, Cliques, Custo, Leads, ROAS) no CRM para alimentar dashboards executivos.
*   **Frequência:** Diária (Execução agendada para 03:00 AM, processando dados do dia anterior `D-1`).
*   **Fontes de Dados:**
    *   Google Ads API (Reporting Service)
    *   Meta Graph API (Marketing API - Insights)
*   **Destino:** Supabase (PostgreSQL) - Tabelas `campaigns` e `campaign_daily_metrics`.

## 2. Estrutura do Banco de Dados (Destino)

O workflow deve popular duas tabelas principais:

1.  **`campaigns` (Dimensão):** Armazena os metadados da campanha.
    *   Chave de Unicidade (Upsert): `organization_id`, `platform`, `external_id`.
    *   Campos: `name`, `status`, `budget`, `account_id`.
2.  **`campaign_daily_metrics` (Fato):** Armazena os números diários.
    *   Chave de Unicidade (Upsert): `campaign_id`, `date`.
    *   Campos: `impressions`, `clicks`, `spend`, `leads` (conversões), `revenue` (valor de conversão).

## 3. Fluxo do Workflow (Passo a Passo)

### Passo 1: Gatilho (Trigger)
*   **Node:** `Schedule Trigger`
*   **Configuração:** Repetir a cada dia às 03:00 AM.
*   **Saída:** Timestamp da execução.

### Passo 2: Definição de Data (Set Date)
*   **Node:** `Date & Time` ou `Code`
*   **Ação:** Calcular a data de ontem (`yesterday`).
*   **Formato:** `YYYY-MM-DD` (ex: `2024-03-10`).
*   **Variável:** `target_date`.

### Passo 3: Buscar Organizações e Credenciais
*   **Node:** `Supabase` (ou `Postgres`)
*   **Ação:** `Execute Query`
*   **Query:**
    ```sql
    SELECT id as org_id, google_ads_customer_id, meta_ads_account_id, meta_access_token, google_refresh_token 
    FROM organizations 
    WHERE status = 'active'
    ```
*   **Nota:** Assume-se que as credenciais estão salvas na tabela de organizações ou em uma tabela separada de integrações (`integrations`).

### Passo 4: Loop por Organização
*   **Node:** `Split In Batches`
*   **Ação:** Processar uma organização por vez para evitar rate limits e facilitar debugging.

### --- Ramo A: Google Ads ---

1.  **Autenticação (Se necessário):**
    *   **Node:** `HTTP Request` (OAuth2 Refresh Token) se não usar a credencial nativa do n8n.
2.  **Buscar Relatório de Campanhas:**
    *   **Node:** `Google Ads` (ou `HTTP Request` para `googleAds/v14/customers/{customerId}/googleAds:search`)
    *   **Query (GAQL):**
        ```sql
        SELECT 
          campaign.id, 
          campaign.name, 
          campaign.status, 
          campaign.amount_budget,
          metrics.impressions, 
          metrics.clicks, 
          metrics.cost_micros, 
          metrics.conversions, 
          metrics.conversions_value
        FROM campaign 
        WHERE segments.date = '{target_date}'
        ```
3.  **Processar Dados (Function/Code):**
    *   Converter `cost_micros` para valor decimal (dividir por 1.000.000).
    *   Mapear status (ENABLED -> active, PAUSED -> paused).
4.  **Upsert Campanha (Supabase):**
    *   **Tabela:** `campaigns`
    *   **Match:** `organization_id`, `platform='google_ads'`, `external_id`.
5.  **Upsert Métricas (Supabase):**
    *   **Tabela:** `campaign_daily_metrics`
    *   **Match:** `campaign_id` (recuperado do passo anterior), `date`.

### --- Ramo B: Meta Ads (Facebook/Instagram) ---

1.  **Buscar Campanhas e Insights:**
    *   **Node:** `HTTP Request` (Graph API)
    *   **URL:** `https://graph.facebook.com/v19.0/{meta_ads_account_id}/campaigns`
    *   **Parâmetros:**
        *   `fields`: `id,name,status,daily_budget,insights.date_preset(yesterday){impressions,clicks,spend,actions,action_values}`
        *   `access_token`: `{meta_access_token}`
2.  **Processar Dados (Function/Code):**
    *   Extrair métricas do array `insights.data[0]`.
    *   Filtrar conversões (ex: eventos de 'lead' ou 'purchase' no array `actions`).
3.  **Upsert Campanha (Supabase):**
    *   **Tabela:** `campaigns`
    *   **Match:** `organization_id`, `platform='meta_ads'`, `external_id`.
4.  **Upsert Métricas (Supabase):**
    *   **Tabela:** `campaign_daily_metrics`
    *   **Match:** `campaign_id`, `date`.

## 4. Tratamento de Erros

*   **Node:** `Error Trigger` (Global)
*   **Ação:** Se qualquer nó falhar, enviar notificação (Email, Slack ou Telegram) para o administrador do sistema com o ID da execução e a mensagem de erro.
*   **Retry:** Configurar os nós de HTTP Request para tentar novamente (3x) em caso de falha de rede ou timeout.

## 5. Variáveis de Ambiente Necessárias (n8n)

*   `SUPABASE_URL`: URL do projeto Supabase.
*   `SUPABASE_SERVICE_ROLE`: Chave de API com permissão de escrita (bypass RLS).
*   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Para OAuth do Google.
*   `META_APP_ID` / `META_APP_SECRET`: Para API do Facebook.
