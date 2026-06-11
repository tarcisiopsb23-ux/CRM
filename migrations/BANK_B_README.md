# Banco B — Schema e Provisionamento por Cliente

## Arquivo principal

**`bank_b_full_schema.sql`** — schema completo do Banco B, idempotente.

Contém tudo de uma vez: tabelas, índices, RLS, triggers, RPCs e seed.
Pode ser executado quantas vezes quiser sem erro ou efeito colateral.

---

## Fluxo de execução via n8n

### 1. Novo cliente com Supabase configurado

Trigger: campo `client_supabase_url` preenchido na tabela `clients` do Banco A.

```
Webhook (Banco A) → detecta UPDATE em clients
  → client_supabase_url IS NOT NULL AND client_supabase_service_key IS NOT NULL
  → HTTP POST /functions/v1/provision-client-db
      body: { "client_id": "uuid-do-cliente" }
  → Edge Function aplica bank_b_full_schema.sql no Banco B do cliente
```

### 2. Atualização do schema para todos os clientes

Trigger: arquivo `bank_b_full_schema.sql` modificado (manual ou via commit).

```
Trigger manual no n8n (botão) ou webhook de CI/CD
  → SELECT id FROM clients WHERE client_supabase_url IS NOT NULL
  → Para cada cliente:
      HTTP POST /functions/v1/provision-client-db
          body: { "client_id": "uuid" }
  → Aguarda resposta antes de ir para o próximo (evitar rate limit)
```

---

## Bootstrap inicial (primeiro provisionamento manual)

Na **primeira vez** que um banco de cliente é criado, a RPC `exec_sql` ainda não existe.
Execute `bank_b_full_schema.sql` manualmente uma vez pelo Supabase Dashboard do cliente:

1. Acesse o Supabase do cliente → SQL Editor
2. Cole e execute o conteúdo de `bank_b_full_schema.sql`
3. A partir daí, todas as atualizações futuras rodam automaticamente via n8n

---

## Campos necessários na tabela `clients` (Banco A)

| Campo | Descrição |
|-------|-----------|
| `client_supabase_url` | URL do projeto Supabase do cliente |
| `client_supabase_anon_key` | Chave anon do projeto (usada pelo frontend) |
| `client_supabase_service_key` | Service role key (usada pelo n8n e provision-client-db) |

> `client_supabase_service_key` deve ser tratada como secret — nunca exposta ao frontend.

---

## Migrations individuais (referência histórica)

Os arquivos `034_bank_b_*.sql`, `038_*.sql`, `039_*.sql`, `041_*.sql`, `044_*.sql`
são mantidos apenas para referência histórica. **Não é necessário executá-los** —
tudo já está consolidado em `bank_b_full_schema.sql`.

---

## Versão atual do schema

`bank_b_full_schema_v1` — registrada na tabela `schema_migrations` do Banco B.

Ao atualizar o schema, incremente a versão no final do arquivo SQL
(`bank_b_full_schema_v2`, etc.) para rastrear qual versão está em cada cliente.
