# CRM Multi-Tenant — Visão Geral do Projeto

## Objetivo

Transformar o CRM da agência de **single-tenant** para **multi-tenant**, permitindo que múltiplos clientes (tenants) utilizem a mesma plataforma com isolamento total de dados, autenticação centralizada e controle de limites por plano.

---

## Contexto

O CRM existente operava com um único cliente no banco. A evolução para SaaS exige que cada cliente da agência tenha seu próprio espaço isolado, com múltiplos usuários, sem compartilhar dados com outros tenants.

---

## Arquitetura

O projeto usa **dois projetos Supabase distintos**:

| Projeto | Responsabilidade |
|---|---|
| **SaaS_DB** | Autenticação, planos e limites de usuários |
| **CRM_DB** | Dados dos clientes (campanhas, leads, KPIs, OAuth tokens) |

O isolamento de dados é garantido por **Row Level Security (RLS)** no CRM_DB, alimentado pelo `tenant_id` extraído do JWT emitido pelo SaaS Auth. O CRM_DB valida o JWT via **JWT secret compartilhado** — sem chamadas extras ao SaaS em cada requisição.

---

## O que foi feito

### Banco de Dados — SaaS_DB

- Tabelas `plans` e `tenant_subscriptions` para controle de planos e limites
- Planos iniciais: Starter (3 usuários), Pro (10), Enterprise (50)
- Hook `custom_access_token_hook` que injeta `tenant_id` e `role` como custom claims em todos os JWTs emitidos pelo SaaS Auth

### Banco de Dados — CRM_DB (migrations em `supabase/migrations/`)

- Adição da coluna `tenant_id UUID NOT NULL` em todas as tabelas de dados: `clients`, `campaign_data`, `daily_metrics`, `client_kpis`, `client_kpi_history`, `crm_leads`, `ad_click_sessions`, `client_conversation_kpis`, `oauth_tokens`, `contracts`
- Backfill idempotente: todos os registros existentes receberam o `tenant_id` do único cliente atual
- Constraints `NOT NULL` e índices em todas as colunas `tenant_id`
- RLS multi-tenant em todas as tabelas: cada query retorna apenas dados do tenant autenticado no JWT
- Tabela `tenant_users` para associar usuários do SaaS Auth a tenants no CRM
- Remoção das RPCs legadas: `validate_client_dashboard_password`, `validate_support_password`, `get_client_data`
- Configuração do JWT secret compartilhado entre SaaS_DB e CRM_DB

### Frontend (React + TypeScript)

- Duas instâncias Supabase: `supabaseAuth` (SaaS) e `supabaseCrm` (CRM)
- Hook `useAuth()`: gerencia sessão, extrai `tenant_id` e `role` do JWT, expõe `isSupport`
- Hook `useTenantUsers()`: lista usuários do tenant, convida e remove via Edge Function
- Login refatorado para usar `supabaseAuth.signInWithPassword()` — removida autenticação via RPC com senha em `clients.metadata`
- Componente `TenantSelector`: exibido para agentes de suporte escolherem qual tenant visualizar
- Componente `SupportBanner`: banner visual permanente durante sessão de suporte
- Página `TenantUsersPage`: gerenciamento de usuários com contador de limite do plano

### Edge Functions (Supabase Deno)

- **`validate-access`** (nova): verifica limite de usuários do plano, convida novos usuários via SaaS Admin API e remove usuários com consistência entre SaaS e CRM
- **`meta-ads-metrics`**, **`gads-metrics`**, **`ga4-metrics`**: refatoradas para filtrar tokens OAuth por `tenant_id` extraído do JWT (removido o `LIMIT 1` que simulava isolamento)
- **`oauth-exchange`**: associa novos tokens OAuth ao `tenant_id` correto do JWT

---

## Sessão de Suporte

Usuários de suporte da agência são identificados exclusivamente pelo claim `role = 'support'` no JWT. Eles:

- **Nunca** são registrados em `tenant_users` de nenhum tenant
- **Nunca** são contabilizados no limite de usuários de nenhum plano
- Acessam qualquer tenant via bypass de RLS
- Veem um seletor de tenant e um banner visual permanente durante a sessão

---

## Estrutura de Arquivos Relevantes

```
saas_db/
└── migrations/
    ├── 001_plans_and_subscriptions.sql
    └── 002_custom_access_token_hook.sql

supabase/
├── migrations/
│   ├── 20260501000000_add_tenant_id_columns.sql
│   ├── 20260501000001_backfill_tenant_id.sql
│   ├── 20260501000002_tenant_id_not_null.sql
│   ├── 20260501000003_rls_multi_tenant.sql
│   ├── 20260501000004_tenant_users.sql
│   ├── 20260501000005_jwt_config.sql
│   └── 20260501000006_drop_legacy_rpcs.sql
└── functions/
    ├── validate-access/
    ├── meta-ads-metrics/
    ├── gads-metrics/
    ├── ga4-metrics/
    └── oauth-exchange/

src/
├── lib/
│   ├── supabase-auth.ts       # cliente SaaS (autenticação)
│   └── supabase-crm.ts        # cliente CRM (dados)
├── hooks/
│   ├── useAuth.ts
│   └── useTenantUsers.ts
├── components/auth/
│   ├── SupportBanner.tsx
│   └── TenantSelector.tsx
└── pages/
    ├── PublicDashboardLoginPage.tsx
    └── TenantUsersPage.tsx
```

---

## O que ainda falta (pendente)

- Testes de propriedade com `fast-check` (marcados como opcionais para MVP):
  - Isolamento de dados entre tenants (Property 1)
  - Query sem tenant retorna zero registros (Property 2)
  - JWT contém claims corretos após login (Property 3)
  - Limite de usuários respeitado (Property 4)
  - Idempotência da migração (Property 5)
  - Backfill preserva registros (Property 6)
  - Isolamento de tokens OAuth (Property 7)
  - Bypass de RLS para suporte (Property 8)
  - Consistência na remoção de usuário (Property 9)
  - Atualização de plano reflete imediatamente (Property 10)
- Checkpoints de validação manual (tasks 5, 11, 16)

---

## Como configurar o ambiente

1. Copie `.env.example` para `.env` e preencha as variáveis do SaaS Supabase
2. Aplique as migrations do `saas_db/` no SQL Editor do projeto SaaS (na ordem numérica)
3. Configure o hook `custom_access_token_hook` em **Authentication > Hooks** no dashboard do SaaS
4. Aplique as migrations do `supabase/migrations/` no projeto CRM
5. Configure o JWT secret compartilhado conforme `saas_db/README.md`
6. Adicione os secrets `SAAS_JWT_SECRET`, `SAAS_URL` e `SAAS_SERVICE_ROLE_KEY` nas Edge Functions do CRM
