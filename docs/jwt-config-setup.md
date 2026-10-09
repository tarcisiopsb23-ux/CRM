# Configuração do JWT Secret Compartilhado

Este documento descreve como configurar o JWT secret compartilhado entre SaaS_DB e CRM_DB.

O arquivo `supabase/migrations/20260501000005_jwt_config.sql` foi intencionalmente deixado sem SQL executável — a configuração é feita via Dashboard, não via migration.

## Opção 1 — Supabase Dashboard (recomendada)

No projeto CRM_DB:
1. Acesse **Settings > API > JWT Settings**
2. Substitua o JWT Secret pelo valor do projeto SaaS (encontrado em SaaS Dashboard > Settings > API > JWT Secret)

Isso faz o CRM_DB aceitar tokens emitidos pelo SaaS Auth diretamente via RLS (`auth.jwt()`).

## Opção 2 — Variável de ambiente nas Edge Functions

Para validação manual de assinatura nas Edge Functions (já implementado):

```
SAAS_JWT_SECRET = <jwt-secret-do-saas>
```

Configurar em: **Supabase Dashboard > Edge Functions > Secrets**

Todas as Edge Functions deste projeto usam `verifyJwt()` de `_shared/jwt.ts` com este secret.

## Secrets necessários nas Edge Functions do CRM

| Variável | Descrição |
|---|---|
| `SAAS_JWT_SECRET` | JWT Secret do projeto SaaS (para verificar assinatura dos tokens) |
| `SAAS_URL` | URL do projeto SaaS (`https://<ref>.supabase.co`) |
| `SAAS_SERVICE_ROLE_KEY` | Service Role Key do SaaS (para Admin API) |
| `APP_URL` | URL pública do frontend (para restringir CORS em produção) |

## Verificação

Após configurar, faça login via SaaS Auth, decodifique o JWT em [jwt.io](https://jwt.io) e confirme que o payload contém:

```json
{
  "tenant_id": "<uuid-do-tenant>",
  "role": "admin"
}
```
