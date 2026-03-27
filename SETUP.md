# Client Dashboard — Guia de Setup

Projeto independente de dashboard para clientes. Single-tenant (um cliente por deploy).
O n8n alimenta o banco de dados Supabase e o dashboard consome os dados.

---

## 1. Estrutura do Projeto

```
src/
  pages/
    PublicDashboardLoginPage.tsx  — Login com slug + senha
    PublicDashboardPage.tsx       — Dashboard de Performance + Atendimento
    CrmPage.tsx                   — CRM Kanban simples
  hooks/
    useClientKPIs.ts              — KPIs manuais (sem organization_id)
    useClientConversationKpis.ts  — KPIs de atendimento (sem organization_id)
    useHubPerformance.ts          — Campanhas e metricas diarias (sem organization_id)
  lib/
    supabase.ts                   — Cliente Supabase
    utils.ts                      — Utilitario cn()
  components/
    ui/                           — Componentes shadcn/ui
    whatsapp/
      ConversationKpiDashboard.tsx — Dashboard de atendimento
  App.tsx                         — Rotas: /dashboard/:slug/login, /dashboard/:slug, /crm
```

---

## 2. Variaveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

Obtenha esses valores em: Supabase -> Settings -> API

---

## 3. Instalacao e Execucao

```bash
npm install
npm run dev        # desenvolvimento
npm run build      # producao
npm run preview    # preview do build
```

---

## 4. Schema do Banco de Dados (Supabase)

Execute no SQL Editor do Supabase:

### 4.1 Tabela de Clientes

```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  dashboard_slug TEXT UNIQUE NOT NULL,
  favicon_url TEXT,
  dashboard_performance BOOLEAN DEFAULT true,
  dashboard_atendimento BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_clients_slug ON clients(dashboard_slug);
```

### 4.2 Contratos (para "Impacto da Parceria")

```sql
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 KPIs Manuais

```sql
CREATE TABLE client_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  unit TEXT CHECK (unit IN ('currency','percentage','number')) DEFAULT 'number',
  is_predefined BOOLEAN DEFAULT false,
  target_value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_kpi_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  kpi_id UUID REFERENCES client_kpis(id) ON DELETE CASCADE,
  month_year DATE NOT NULL,
  value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(kpi_id, month_year)
);
```

### 4.4 Metricas de Campanhas (alimentadas pelo n8n)

```sql
CREATE TABLE campaign_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  spend NUMERIC DEFAULT 0,
  leads INTEGER,
  sales INTEGER,
  revenue NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_spend NUMERIC DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, date)
);
```

### 4.5 KPIs de Atendimento (alimentados pelo n8n)

```sql
CREATE TABLE client_conversation_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  source TEXT NOT NULL,
  campaign TEXT,
  conversations INTEGER DEFAULT 0,
  bot_finished INTEGER DEFAULT 0,
  human_transfer INTEGER DEFAULT 0,
  leads_identified INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_agent_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  agent_name TEXT NOT NULL,
  conversations_started INTEGER DEFAULT 0,
  conversations_finished INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.6 CRM Simples

```sql
CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  proposal_value NUMERIC,
  notes TEXT,
  status TEXT CHECK (status IN ('novo','contato','proposta','negociacao','fechado','perdido')) DEFAULT 'novo',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. Funcoes RPC (Supabase)

### 5.1 Buscar cliente por slug

```sql
CREATE OR REPLACE FUNCTION get_client_by_slug(p_slug TEXT)
RETURNS TABLE (
  id UUID, name TEXT, company TEXT, dashboard_slug TEXT,
  has_temp_password BOOLEAN, favicon_url TEXT,
  dashboard_performance BOOLEAN, dashboard_atendimento BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.company, c.dashboard_slug,
    COALESCE((c.metadata->>'has_temp_password')::BOOLEAN, false),
    c.favicon_url,
    COALESCE(c.dashboard_performance, true),
    COALESCE(c.dashboard_atendimento, false)
  FROM clients c WHERE c.dashboard_slug = p_slug LIMIT 1;
END; $$;
```

### 5.2 Validar senha

```sql
CREATE OR REPLACE FUNCTION validate_client_dashboard_password(p_slug TEXT, p_password TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE stored_password TEXT;
BEGIN
  SELECT metadata->>'dashboard_password' INTO stored_password
  FROM clients WHERE dashboard_slug = p_slug;
  RETURN stored_password = p_password;
END; $$;
```

### 5.3 Atualizar senha

```sql
CREATE OR REPLACE FUNCTION update_client_dashboard_password(p_client_id UUID, p_new_password TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE clients SET metadata = jsonb_set(
    jsonb_set(metadata, '{dashboard_password}', to_jsonb(p_new_password)),
    '{has_temp_password}', 'false'
  ) WHERE id = p_client_id;
END; $$;
```

### 5.4 Recuperar senha (reset)

```sql
CREATE OR REPLACE FUNCTION recover_client_password(p_slug TEXT, p_email TEXT, p_new_temp_password TEXT)
RETURNS TABLE (id UUID) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE clients SET metadata = jsonb_set(
    jsonb_set(metadata, '{dashboard_password}', to_jsonb(p_new_temp_password)),
    '{has_temp_password}', 'true'
  ) WHERE dashboard_slug = p_slug AND email = p_email
  RETURNING clients.id;
END; $$;
```

---

## 6. RLS (Row Level Security)

```sql
-- Opcao simples: desabilitar RLS (OK para projetos single-tenant)
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_kpis DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_kpi_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_conversation_kpis DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_agent_kpis DISABLE ROW LEVEL SECURITY;
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads DISABLE ROW LEVEL SECURITY;
```

---

## 7. Cadastrar o Primeiro Cliente

No Supabase -> Table Editor -> clients, insira:

```json
{
  "name": "Nome do Cliente",
  "company": "Empresa do Cliente",
  "email": "cliente@email.com",
  "dashboard_slug": "meu-cliente",
  "dashboard_performance": true,
  "dashboard_atendimento": false,
  "metadata": {
    "dashboard_password": "senha123",
    "has_temp_password": true
  }
}
```

O cliente acessa: `https://seu-dominio.com/dashboard/meu-cliente/login`

---

## 8. Configurar Rota Padrao

Em `src/App.tsx`, altere o slug na linha de redirect:

```tsx
<Route path="/" element={<Navigate to="/dashboard/nome-do-cliente/login" replace />} />
```

---

## 9. Payloads do n8n

### 9.1 Metricas Diarias

```json
{
  "client_id": "uuid-do-cliente",
  "date": "2024-01-15",
  "total_spend": 1500.00,
  "total_leads": 45,
  "total_sales": 8,
  "revenue": 24000.00,
  "impressions": 15000,
  "clicks": 320
}
```

Endpoint:
```
POST https://SEU_PROJETO.supabase.co/rest/v1/daily_metrics
Headers:
  apikey: sua_anon_key
  Authorization: Bearer sua_anon_key
  Content-Type: application/json
  Prefer: resolution=merge-duplicates
```

### 9.2 Dados de Campanhas

```json
{
  "client_id": "uuid-do-cliente",
  "date": "2024-01-15",
  "platform": "Meta Ads",
  "name": "Campanha Black Friday",
  "spend": 800.00,
  "leads": 25,
  "sales": 4,
  "revenue": 12000.00
}
```

Endpoint: `POST .../rest/v1/campaign_data`

### 9.3 KPIs de Atendimento

```json
{
  "client_id": "uuid-do-cliente",
  "period_date": "2024-01-15",
  "source": "whatsapp",
  "campaign": "Campanha Verao",
  "conversations": 120,
  "bot_finished": 85,
  "human_transfer": 35,
  "leads_identified": 60,
  "conversions": 12
}
```

Endpoint: `POST .../rest/v1/client_conversation_kpis`

### 9.4 Performance de Atendentes

```json
{
  "client_id": "uuid-do-cliente",
  "period_date": "2024-01-15",
  "agent_name": "Joao Silva",
  "conversations_started": 35,
  "conversations_finished": 30,
  "conversions": 8
}
```

Endpoint: `POST .../rest/v1/client_agent_kpis`

---

## 10. Deploy

### Vercel

1. Push para GitHub
2. Importe em https://vercel.com/new
3. Adicione as variaveis de ambiente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
4. Deploy automatico a cada push

Crie `vercel.json` na raiz:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### Netlify

1. Push para GitHub
2. Importe em https://app.netlify.com/start
3. Build command: `npm run build` | Publish directory: `dist`
4. Adicione as variaveis de ambiente

Crie `public/_redirects`:
```
/*  /index.html  200
```

---

## 11. Envio de E-mail na Recuperacao de Senha

O arquivo `PublicDashboardLoginPage.tsx` tem um comentario marcando onde implementar.

Exemplo com Resend:

```bash
npm install resend
```

```typescript
// src/lib/email.ts
import { Resend } from "resend";
const resend = new Resend(import.meta.env.VITE_RESEND_API_KEY);

export async function sendRecoveryEmail(to: string, tempPassword: string) {
  await resend.emails.send({
    from: "noreply@seudominio.com",
    to,
    subject: "Recuperacao de Acesso",
    html: `<p>Sua nova senha temporaria: <strong>${tempPassword}</strong></p>`,
  });
}
```

Substitua o comentario em `handleRecovery` por: `sendRecoveryEmail(email, newTempPassword)`

---

## 12. Multiplos Clientes no Mesmo Deploy

Cada cliente tem seu proprio `dashboard_slug`. Os dados sao isolados por `client_id`.

- `https://seu-dominio.com/dashboard/cliente-a/login`
- `https://seu-dominio.com/dashboard/cliente-b/login`

---

## 13. Personalizacao Visual

- Cor principal: `#2D8CC7` — busque e substitua por outra cor hex
- Logo/favicon: campo `favicon_url` na tabela `clients`
- Rodape "Agencia C8": altere em `PublicDashboardPage.tsx` e `PublicDashboardLoginPage.tsx`
