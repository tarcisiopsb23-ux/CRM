# SaaS DB — Migrations

Este diretório contém as migrations do banco SaaS (Supabase da agência), responsável por autenticação, planos e limites de usuários.

## Estrutura

```
saas_db/
└── migrations/
    ├── 001_plans_and_subscriptions.sql   # Tabelas plans e tenant_subscriptions
    └── 002_custom_access_token_hook.sql  # Hook JWT para custom claims
```

## Como aplicar as migrations

As migrations devem ser aplicadas manualmente no SQL Editor do projeto SaaS no Supabase Dashboard, na ordem numérica.

### Via Supabase Dashboard

1. Acesse [app.supabase.com](https://app.supabase.com) e abra o projeto SaaS
2. Vá em **SQL Editor**
3. Execute cada arquivo na ordem:
   - `001_plans_and_subscriptions.sql`
   - `002_custom_access_token_hook.sql`

### Via Supabase CLI

Se o projeto SaaS estiver configurado localmente com a CLI:

```bash
supabase db push --db-url "postgresql://postgres:<senha>@<host>:5432/postgres"
```

Ou execute diretamente com `psql`:

```bash
psql "$DATABASE_URL" -f saas_db/migrations/001_plans_and_subscriptions.sql
psql "$DATABASE_URL" -f saas_db/migrations/002_custom_access_token_hook.sql
```

> As migrations são idempotentes (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `CREATE OR REPLACE FUNCTION`), portanto podem ser re-executadas sem efeitos colaterais.

## Configuração do JWT Secret Compartilhado

Para que o CRM_DB aceite JWTs emitidos pelo SaaS Auth, o JWT secret precisa ser o mesmo nos dois projetos Supabase.

### Como configurar

1. No **SaaS Dashboard**: vá em **Settings > API > JWT Settings** e copie o **JWT Secret**
2. No **CRM Dashboard**: vá em **Settings > API > JWT Settings** e cole o mesmo valor

> Isso substitui o JWT secret padrão do CRM pelo do SaaS, fazendo o CRM aceitar tokens emitidos pelo SaaS Auth.

### Secrets das Edge Functions

No **CRM Dashboard > Edge Functions > Secrets**, adicione:

| Variável | Valor |
|---|---|
| `SAAS_JWT_SECRET` | JWT Secret do projeto SaaS |
| `SAAS_URL` | `https://<saas-ref>.supabase.co` |
| `SAAS_SERVICE_ROLE_KEY` | Service Role Key do projeto SaaS |

> **Nota:** `ALTER DATABASE postgres SET "app.settings.jwt_secret"` **não funciona** no Supabase hospedado — use o Dashboard conforme acima.

O hook `custom_access_token_hook` injeta `tenant_id` e `role` como custom claims em todos os JWTs emitidos pelo SaaS Auth. Sem ele, o CRM_DB não consegue identificar o tenant nas políticas RLS.

### Passos

1. Aplique a migration `002_custom_access_token_hook.sql` (cria a função no banco)
2. No Supabase Dashboard do projeto SaaS, vá em **Authentication > Hooks**
3. Localize a seção **Custom Access Token Hook**
4. Configure:
   - **Schema:** `public`
   - **Function:** `custom_access_token_hook`
5. Clique em **Save**

### Verificação

Após registrar o hook, faça login com um usuário que tenha `tenant_id` no `user_metadata` e decodifique o JWT retornado (ex: em [jwt.io](https://jwt.io)). O payload deve conter:

```json
{
  "tenant_id": "<uuid-do-tenant>",
  "role": "admin",
  ...
}
```

Para usuários de suporte (sem `tenant_id` no `user_metadata`):

```json
{
  "tenant_id": null,
  "role": "support",
  ...
}
```

## Planos iniciais

A migration `001` insere os seguintes planos:

| Nome       | Máx. usuários | Preço (BRL) |
|------------|---------------|-------------|
| Starter    | 3             | R$ 0,00     |
| Pro        | 10            | R$ 197,00   |
| Enterprise | 50            | R$ 497,00   |

Para associar um tenant a um plano, insira um registro em `tenant_subscriptions`:

```sql
INSERT INTO tenant_subscriptions (tenant_id, plan_id)
SELECT '<uuid-do-tenant>', id FROM plans WHERE name = 'Starter';
```
