---
inclusion: always
---

# Regra: Sincronização do bank_b_full_schema.sql

Sempre que qualquer tabela do **Banco B** for criada, alterada ou removida — seja por migration individual, por atualização de Edge Function, ou por qualquer outra razão — o arquivo `migrations/bank_b_full_schema.sql` **deve ser atualizado na mesma operação**.

## O que é o Banco B

O Banco B é o projeto Supabase individual de cada cliente do C8 Control. O schema dele é definido em `migrations/bank_b_full_schema.sql` e replicado via Edge Function `provision-client-db` (em `supabase/functions/provision-client-db/index.ts`, que contém uma cópia inline do schema).

## Regras obrigatórias

1. **Toda alteração de DDL no Banco B** (CREATE TABLE, ALTER TABLE, ADD COLUMN, DROP COLUMN, novo índice, nova constraint, nova função, novo trigger, nova view) deve ser refletida em `bank_b_full_schema.sql`.

2. **O schema inline** em `supabase/functions/provision-client-db/index.ts` (variável `BANK_B_FULL_SCHEMA`) deve ser mantido em sincronia com `bank_b_full_schema.sql`.

3. **Idempotência**: todas as instruções em `bank_b_full_schema.sql` devem usar `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`, `OR REPLACE` ou `DO $$ ... IF EXISTS ... END $$` para poder ser executadas múltiplas vezes sem erro.

4. **Migrations individuais** (arquivos `bank_b_add_*.sql`) são complementares — servem para atualizar bancos já provisionados. Não substituem a atualização do schema completo.

5. **Versão**: ao modificar `bank_b_full_schema.sql`, incremente o número da versão no final do arquivo:
   ```sql
   INSERT INTO public.schema_migrations (version)
   VALUES ('bank_b_full_schema_vN')
   ON CONFLICT (version) DO NOTHING;
   ```

## Checklist ao alterar tabelas do Banco B

- [ ] Migration individual criada em `migrations/bank_b_add_*.sql` (para bancos existentes)
- [ ] `migrations/bank_b_full_schema.sql` atualizado (para novos provisionamentos)
- [ ] Schema inline em `provision-client-db/index.ts` atualizado
- [ ] Versão incrementada no `INSERT INTO schema_migrations`
