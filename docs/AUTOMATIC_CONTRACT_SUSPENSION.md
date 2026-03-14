# Automação de Suspensão de Contratos

Este documento descreve como configurar a rotina automática de suspensão de contratos com atraso superior a 30 dias (ou o valor configurado).

## 1. Funcionamento

A suspensão é realizada pela função RPC `sync_contract_suspensions` no banco de dados Supabase. Esta função:
1. Identifica contratos com status `ativo`.
2. Verifica se existem pagamentos pendentes (não pagos e não cancelados) com data de vencimento inferior a `NOW() - overdue_days`.
3. Altera o status do contrato para `suspenso`.
4. Atualiza o `metadata` do contrato com `suspended_at` e `suspended_reason`.

## 2. Como automatizar (Scheduler)

Como o Supabase não possui um scheduler nativo (pg_cron) habilitado por padrão em todos os planos, recomendamos o uso do **n8n** ou um serviço de **Cron externo**.

### Opção A: n8n (Recomendado)

1. Crie um novo workflow no n8n.
2. Adicione um nó **Schedule Trigger** configurado para executar diariamente (ex: às 03:00 AM).
3. Adicione um nó **Supabase** (ou HTTP Request):
   - **Resource:** Custom query (se usar nó Supabase) ou RPC call.
   - **URL:** `https://<PROJECT_REF>.supabase.co/rest/v1/rpc/sync_contract_suspensions`
   - **Method:** POST
   - **Headers:**
     - `apikey`: `<SERVICE_ROLE_KEY>`
     - `Authorization`: `Bearer <SERVICE_ROLE_KEY>`
     - `Content-Type`: `application/json`
   - **Body:**
     ```json
     {
       "p_org_id": "UUID_DA_ORGANIZACAO",
       "p_overdue_days": 30
     }
     ```
   *Nota: Se você tiver múltiplas organizações, precisará iterar sobre elas ou criar um loop no n8n.*

### Opção B: GitHub Actions (Gratuito para repos públicos/limite em privados)

Crie um arquivo `.github/workflows/suspend-contracts.yml`:

```yaml
name: Suspend Overdue Contracts
on:
  schedule:
    - cron: '0 3 * * *' # Diariamente às 03:00 UTC
jobs:
  suspend:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase RPC
        run: |
          curl -X POST "https://${{ secrets.SUPABASE_PROJECT_ID }}.supabase.co/rest/v1/rpc/sync_contract_suspensions" \
          -H "apikey: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
          -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
          -H "Content-Type: application/json" \
          -d '{"p_overdue_days": 30}'
```

## 3. Considerações de Segurança

- A função RPC `sync_contract_suspensions` possui `SECURITY DEFINER`, o que significa que ela executa com privilégios de quem a criou (normalmente o owner do banco).
- O acesso via `authenticated` role está habilitado, mas para automação recomenda-se o uso da **Service Role Key** para ignorar políticas de RLS e garantir que a execução ocorra sem um contexto de usuário logado.
