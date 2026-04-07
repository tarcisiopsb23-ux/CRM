# Implementation Plan: CRM Multi-Tenant

## Overview

Transformação do CRM single-tenant em multi-tenant usando duas instâncias Supabase (SaaS_DB para auth, CRM_DB para dados), RLS por `tenant_id` extraído do JWT, e Edge Function `validate-access` para controle de limites e convites.

A implementação segue a ordem de dependência: banco → auth → frontend → edge functions → limpeza → testes.

## Tasks

- [x] 1. SaaS_DB — Tabelas de planos e hook de JWT
  - [x] 1.1 Criar migration `saas_db/migrations/001_plans_and_subscriptions.sql`
    - Criar tabela `plans` (id, name, max_users, price_brl, created_at)
    - Criar tabela `tenant_subscriptions` (id, tenant_id UNIQUE, plan_id FK, status CHECK, started_at, expires_at, created_at, updated_at)
    - Criar índice `idx_tenant_subscriptions_tenant_id`
    - Inserir planos iniciais: Starter (max_users=3), Pro (max_users=10), Enterprise (max_users=50)
    - _Requirements: 5.1, 5.4_

  - [x] 1.2 Criar migration `saas_db/migrations/002_custom_access_token_hook.sql`
    - Criar função `custom_access_token_hook(event JSONB) RETURNS JSONB`
    - Extrair `tenant_id` e `role` de `event->'claims'->'user_metadata'`
    - Injetar ambos como custom claims no JWT retornado
    - Registrar o hook em `supabase_functions.hooks` (ou via dashboard)
    - _Requirements: 2.2, 3.1_

  - [ ]* 1.3 Escrever property test para o hook JWT (Property 3)
    - **Property 3: JWT contém tenant_id e role válidos após login**
    - **Validates: Requirements 2.2, 3.1**
    - Usar fast-check: para qualquer `{ tenant_id: UUID, role: string }` em `user_metadata`, o JWT resultante deve conter os mesmos valores
    - Arquivo: `src/tests/properties/jwt-claims.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 3: JWT contém tenant_id e role válidos após login`

- [x] 2. CRM_DB — Fase 1 a 3: Adicionar tenant_id nas tabelas existentes
  - [x] 2.1 Criar migration `20260501000000_add_tenant_id_columns.sql`
    - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS tenant_id UUID` nas tabelas: `clients`, `campaign_data`, `daily_metrics`, `client_kpis`, `client_kpi_history`, `crm_leads`, `ad_click_sessions`, `client_conversation_kpis`, `oauth_tokens`, `contracts`
    - `ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE`
    - _Requirements: 1.1, 8.1, 8.3_

  - [x] 2.2 Criar migration `20260501000001_backfill_tenant_id.sql`
    - Bloco `DO $$ DECLARE v_tenant_id UUID; BEGIN SELECT id INTO v_tenant_id FROM clients LIMIT 1; ...`
    - `UPDATE` idempotente (`WHERE tenant_id IS NULL`) em todas as tabelas listadas em 2.1
    - Incluir `crm_leads`: setar `tenant_id = v_tenant_id` e `client_id = v_tenant_id`
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [ ]* 2.3 Escrever property test para idempotência da migração (Property 5)
    - **Property 5: Idempotência da migração**
    - **Validates: Requirements 8.4, 8.5**
    - Usar fast-check: simular execução dupla do backfill sobre conjunto arbitrário de registros e verificar que o resultado é idêntico
    - Arquivo: `src/tests/properties/migration-idempotency.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 5: Idempotência da migração`

  - [ ]* 2.4 Escrever property test para preservação de registros no backfill (Property 6)
    - **Property 6: Backfill preserva todos os registros existentes**
    - **Validates: Requirements 8.2, 8.4**
    - Usar fast-check: para qualquer conjunto de N registros pré-migração, COUNT pós-backfill deve ser igual a N em cada tabela
    - Arquivo: `src/tests/properties/backfill-preservation.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 6: Backfill preserva todos os registros existentes`

  - [x] 2.5 Criar migration `20260501000002_tenant_id_not_null.sql`
    - `ALTER TABLE ... ALTER COLUMN tenant_id SET NOT NULL` em todas as tabelas
    - Criar índices `idx_*_tenant_id` em todas as tabelas
    - _Requirements: 1.1, 8.1_

- [x] 3. CRM_DB — Fase 4: RLS multi-tenant em todas as tabelas
  - [x] 3.1 Criar migration `20260501000003_rls_multi_tenant.sql`
    - Para cada tabela (`clients`, `campaign_data`, `daily_metrics`, `client_kpis`, `client_kpi_history`, `crm_leads`, `ad_click_sessions`, `client_conversation_kpis`, `oauth_tokens`, `contracts`):
      - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
      - `DROP POLICY IF EXISTS "anon_all_*"`
      - `CREATE POLICY "*_tenant_isolation" FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') = 'support') WITH CHECK (...)`
    - _Requirements: 1.2, 1.3, 1.4, 7.4_

  - [ ]* 3.2 Escrever property test para isolamento de dados entre tenants (Property 1)
    - **Property 1: Isolamento de dados entre tenants**
    - **Validates: Requirements 1.2, 1.4**
    - Usar fast-check: para qualquer par de tenant_ids distintos A e B, query com JWT de A não deve retornar registros com `tenant_id = B`
    - Arquivo: `src/tests/properties/tenant-isolation.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 1: Isolamento de dados entre tenants`

  - [ ]* 3.3 Escrever property test para query sem tenant_id retorna zero registros (Property 2)
    - **Property 2: Query sem tenant_id retorna zero registros**
    - **Validates: Requirements 1.3, 3.4**
    - Usar fast-check: para qualquer tabela protegida por RLS, query sem JWT válido deve retornar array vazio
    - Arquivo: `src/tests/properties/no-tenant-empty-result.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 2: Query sem tenant_id retorna zero registros`

- [x] 4. CRM_DB — Fase 5: Tabela tenant_users e configuração JWT
  - [x] 4.1 Criar migration `20260501000004_tenant_users.sql`
    - Criar tabela `tenant_users` (id, user_id UUID NOT NULL, tenant_id UUID NOT NULL, role TEXT CHECK ('admin','member'), created_at, UNIQUE(user_id, tenant_id))
    - Criar índices `idx_tenant_users_tenant_id` e `idx_tenant_users_user_id`
    - `ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY`
    - `CREATE POLICY "tenant_users_isolation"` com bypass para `role = 'support'`
    - Comentário explícito: usuário de suporte NUNCA é inserido nesta tabela
    - _Requirements: 4.1, 4.3, 7.1_

  - [x] 4.2 Configurar JWT secret compartilhado no CRM_DB
    - Documentar em `supabase/config.toml` (ou `.env.example`) a variável `SAAS_JWT_SECRET`
    - Adicionar instrução de configuração: `ALTER DATABASE postgres SET "app.settings.jwt_secret" TO '<SAAS_JWT_SECRET>'`
    - _Requirements: 3.1, 3.2_

- [ ] 5. Checkpoint — Validar banco antes de tocar no frontend
  - Garantir que todas as migrations rodam sem erro em ambiente de teste
  - Verificar que RLS bloqueia queries anon em todas as tabelas
  - Garantir que todos os testes de propriedade de banco passam
  - Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 6. CRM Frontend — Duas instâncias Supabase
  - [x] 6.1 Criar `src/lib/supabase-auth.ts`
    - `export const supabaseAuth = createClient(VITE_SAAS_URL, VITE_SAAS_ANON_KEY)` com `persistSession: true`, `storageKey: 'c8control-saas-auth'`
    - Adicionar `VITE_SAAS_URL` e `VITE_SAAS_ANON_KEY` ao `.env.example`
    - _Requirements: 2.1, 2.3_

  - [x] 6.2 Refatorar `src/lib/supabase.ts` → `src/lib/supabase-crm.ts`
    - Renomear export para `supabaseCrm`
    - Configurar `global.headers` para injetar `Authorization: Bearer <token>` dinamicamente via `getSessionToken()` (função auxiliar que lê sessão do `supabaseAuth`)
    - Manter `src/lib/supabase.ts` como re-export de `supabaseCrm` para compatibilidade temporária com hooks existentes
    - _Requirements: 2.3, 3.1_

- [x] 7. CRM Frontend — Hook useAuth()
  - [x] 7.1 Criar `src/hooks/useAuth.ts`
    - Assinar `supabaseAuth.auth.onAuthStateChange` para manter sessão reativa
    - Extrair `tenant_id` e `role` do JWT via `session.access_token` (decode sem verificação — validação é feita pelo CRM_DB)
    - Expor: `{ session, user, tenantId, role, isSupport, loading, signIn, signOut }`
    - `isSupport = role === 'support'`
    - _Requirements: 2.2, 2.3, 2.4, 7.1_

  - [x] 7.2 Criar `src/hooks/useTenantUsers.ts`
    - Query `supabaseCrm.from('tenant_users').select('*').eq('tenant_id', tenantId)`
    - Expor lista de usuários, `currentCount`, `maxUsers` (via `validate-access` check-limit)
    - Funções `inviteUser(email)` e `removeUser(userId)` que chamam a Edge Function `validate-access`
    - _Requirements: 4.1, 4.2, 4.3, 5.2, 6.1, 6.2, 6.3, 6.5_

- [x] 8. CRM Frontend — Substituir login legado
  - [x] 8.1 Refatorar `src/pages/PublicDashboardLoginPage.tsx`
    - Substituir chamadas `supabase.rpc('get_client_data')` e `supabase.rpc('validate_dashboard_user')` por `supabaseAuth.auth.signInWithPassword({ email, password })`
    - Remover lógica de `has_temp_password` e `first-access` view (fluxo de reset passa a ser via SaaS Auth)
    - Redirecionar para `/dashboard` após login bem-sucedido
    - Exibir mensagem genérica em caso de erro (sem revelar se email ou senha estão errados)
    - _Requirements: 2.1, 2.5, 2.6, 7.6_

  - [x] 8.2 Refatorar `src/pages/PublicDashboardPage.tsx` — remover auth legado
    - Substituir leitura de `localStorage.getItem('client_auth')` por `useAuth()`
    - Substituir `clientId` hardcoded por `tenantId` do hook `useAuth()`
    - Remover chamada a `supabase.rpc('get_client_data')` (dados vêm via RLS agora)
    - Remover `isSupportSession` baseado em `parsedData.is_support` — usar `isSupport` do `useAuth()`
    - _Requirements: 2.3, 2.4, 4.2_

- [x] 9. CRM Frontend — Sessão de suporte
  - [x] 9.1 Criar componente `src/components/auth/SupportBanner.tsx`
    - Banner fixo no topo com texto "SESSÃO DE SUPORTE — Tenant: {tenantName}"
    - Visível apenas quando `isSupport === true`
    - _Requirements: 7.5_

  - [x] 9.2 Criar componente `src/components/auth/TenantSelector.tsx`
    - Exibido quando `isSupport === true` e nenhum tenant foi selecionado
    - Query `supabaseCrm.from('clients').select('id, name')` (sem filtro — bypass RLS para suporte)
    - Ao selecionar, armazena `selectedTenantId` em estado local e injeta como `X-Tenant-Override` nas requisições do `supabaseCrm`
    - _Requirements: 7.2, 7.3_

  - [x] 9.3 Integrar `SupportBanner` e `TenantSelector` em `PublicDashboardPage.tsx`
    - Renderizar `<TenantSelector>` quando `isSupport && !selectedTenantId`
    - Renderizar `<SupportBanner>` quando `isSupport && selectedTenantId`
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [x] 10. CRM Frontend — Tela de gerenciamento de usuários do tenant
  - [x] 10.1 Criar página `src/pages/TenantUsersPage.tsx`
    - Acessível apenas para `role === 'admin'`
    - Listar usuários via `useTenantUsers()`: nome/email, role, data de criação
    - Exibir contador "X de Y usuários" com base em `currentCount` e `maxUsers`
    - Exibir nome do plano atual
    - _Requirements: 6.1, 5.3_

  - [x] 10.2 Adicionar formulário de convite em `TenantUsersPage.tsx`
    - Input de email + botão "Convidar"
    - Chamar `inviteUser(email)` do `useTenantUsers()`
    - Desabilitar botão quando `currentCount >= maxUsers`
    - Exibir mensagem de erro retornada pela Edge Function (ex: "Limite atingido", "Email já cadastrado")
    - _Requirements: 6.2, 6.3, 6.4, 5.2, 5.3_

  - [x] 10.3 Adicionar botão de remoção de usuário em `TenantUsersPage.tsx`
    - Botão "Remover" por linha de usuário
    - Chamar `removeUser(userId)` do `useTenantUsers()`
    - Confirmar antes de remover (dialog de confirmação)
    - _Requirements: 6.5_

- [ ] 11. Checkpoint — Validar frontend antes das edge functions
  - Garantir que login, logout e refresh de sessão funcionam via SaaS Auth
  - Verificar que `tenant_id` é propagado corretamente para o CRM_DB
  - Verificar que sessão de suporte exibe banner e seletor
  - Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 12. Edge Function: validate-access (nova)
  - [x] 12.1 Criar `supabase/functions/validate-access/index.ts`
    - Estrutura base: CORS headers, parse do body `{ action, tenant_id, email?, user_id? }`
    - Autenticar chamada via JWT do header `Authorization` (verificar que o caller é do tenant correto ou suporte)
    - _Requirements: 5.1, 5.2, 6.2, 6.5_

  - [x] 12.2 Implementar action `check-limit` em `validate-access`
    - Conectar ao SaaS_DB via `SAAS_SERVICE_ROLE_KEY`
    - Query: `SELECT p.max_users FROM tenant_subscriptions ts JOIN plans p ON p.id = ts.plan_id WHERE ts.tenant_id = ? AND ts.status = 'active'`
    - Query: `SELECT COUNT(*) FROM tenant_users WHERE tenant_id = ?` no CRM_DB
    - Retornar `{ allowed: boolean, current_users, max_users, plan_name }`
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 12.3 Implementar action `invite` em `validate-access`
    - Chamar `check-limit` internamente; rejeitar com `{ allowed: false, error: "Limite de usuários atingido" }` se cheio
    - Chamar SaaS Admin API: `POST /auth/v1/admin/users` com `{ email, user_metadata: { tenant_id, role: 'member' } }`
    - Em caso de sucesso: `INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (new_user_id, tenant_id, 'member')`
    - Repassar erros da Admin API ao frontend (ex: email duplicado)
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 12.4 Implementar action `remove` em `validate-access`
    - `DELETE FROM tenant_users WHERE user_id = ? AND tenant_id = ?` no CRM_DB
    - Chamar SaaS Admin API: `DELETE /auth/v1/admin/users/{user_id}` para revogar acesso
    - Garantir atomicidade: se a deleção no SaaS falhar, fazer rollback do DELETE no CRM_DB
    - _Requirements: 6.5_

  - [ ]* 12.5 Escrever property test para limite de usuários (Property 4)
    - **Property 4: Limite de usuários é respeitado e suporte não é contabilizado**
    - **Validates: Requirements 5.2, 5.3**
    - Usar fast-check: para qualquer N (max_users do plano), após N registros em `tenant_users`, `check-limit` deve retornar `allowed: false`; usuário de suporte nunca aparece na contagem
    - Arquivo: `src/tests/properties/user-limit.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 4: Limite de usuários é respeitado e suporte não é contabilizado`

  - [ ]* 12.6 Escrever property test para consistência de remoção (Property 9)
    - **Property 9: Remoção de usuário do tenant é consistente entre SaaS e CRM**
    - **Validates: Requirements 6.5**
    - Usar fast-check: após remoção, `tenant_users` não deve conter o registro E o acesso no SaaS deve estar revogado — ambos simultaneamente
    - Arquivo: `src/tests/properties/user-removal-consistency.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 9: Remoção de usuário do tenant é consistente entre SaaS e CRM`

  - [ ]* 12.7 Escrever property test para atualização de plano (Property 10)
    - **Property 10: Atualização de plano reflete novo limite imediatamente**
    - **Validates: Requirements 5.4**
    - Usar fast-check: para qualquer N' (novo max_users), após UPDATE em `tenant_subscriptions`, próxima chamada a `check-limit` deve retornar `max_users = N'`
    - Arquivo: `src/tests/properties/plan-update-immediate.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 10: Atualização de plano reflete novo limite imediatamente`

- [x] 13. Edge Functions existentes — Substituir LIMIT 1 por filtro tenant_id
  - [x] 13.1 Refatorar `supabase/functions/meta-ads-metrics/index.ts`
    - Extrair `tenant_id` do JWT do header `Authorization` (decode do payload)
    - Substituir `.eq('client_id', clientId).single()` por `.eq('tenant_id', tenantId).eq('provider', 'meta').single()`
    - Retornar 404 descritivo se token não encontrado para o tenant
    - _Requirements: 9.2, 9.3, 1.5_

  - [x] 13.2 Refatorar `supabase/functions/gads-metrics/index.ts`
    - Mesma lógica de 13.1: extrair `tenant_id` do JWT, filtrar por `tenant_id` em vez de `client_id`
    - _Requirements: 9.2, 9.3, 1.5_

  - [x] 13.3 Refatorar `supabase/functions/ga4-metrics/index.ts`
    - Mesma lógica de 13.1
    - _Requirements: 9.2, 9.3, 1.5_

  - [x] 13.4 Refatorar `supabase/functions/oauth-exchange/index.ts`
    - Extrair `tenant_id` do JWT do header `Authorization`
    - Substituir `client_id: clientId` por `tenant_id: tenantId` no upsert
    - Atualizar `onConflict` para `"tenant_id,provider"`
    - _Requirements: 9.4_

  - [ ]* 13.5 Escrever property test para isolamento de tokens OAuth (Property 7)
    - **Property 7: Edge Functions isolam tokens OAuth por tenant**
    - **Validates: Requirements 9.2, 9.3**
    - Usar fast-check: para qualquer `tenant_id` válido, a edge function deve retornar apenas o token associado a esse tenant — nunca tokens de outros tenants
    - Arquivo: `src/tests/properties/oauth-token-isolation.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 7: Edge Functions isolam tokens OAuth por tenant`

- [x] 14. CRM_DB — Fase 6: Remover RPCs legados
  - [x] 14.1 Criar migration `20260501000005_drop_legacy_rpcs.sql`
    - `DROP FUNCTION IF EXISTS validate_client_dashboard_password(TEXT, TEXT)`
    - `DROP FUNCTION IF EXISTS validate_support_password(TEXT)`
    - `DROP FUNCTION IF EXISTS get_client_data()`
    - Comentário: manter `update_client_dashboard_password` e `recover_client_password` até confirmação de desuso
    - _Requirements: 2.6, 7.6_

- [ ] 15. Testes de propriedade — Sessão de suporte e hooks frontend
  - [ ]* 15.1 Escrever property test para sessão de suporte (Property 8)
    - **Property 8: Sessão de suporte acessa qualquer tenant sem restrição de RLS**
    - **Validates: Requirements 7.3, 7.4**
    - Usar fast-check: para qualquer JWT com `role = 'support'` e qualquer `tenant_id` arbitrário, queries ao CRM_DB devem retornar dados do tenant especificado
    - Arquivo: `src/tests/properties/support-session-bypass.property.test.ts`
    - Tag: `// Feature: crm-multi-tenant, Property 8: Sessão de suporte acessa qualquer tenant sem restrição de RLS`

  - [ ]* 15.2 Escrever unit tests para `useAuth()`
    - Testar extração correta de `tenant_id` e `role` do JWT
    - Testar `isSupport = true` quando `role = 'support'`
    - Testar redirecionamento para login quando sessão expira
    - Arquivo: `src/hooks/useAuth.test.ts`
    - _Requirements: 2.2, 2.4, 7.1_

  - [ ]* 15.3 Escrever unit tests para `useTenantUsers()`
    - Testar que convite com limite atingido exibe mensagem correta
    - Testar que remoção chama `validate-access` com `action: 'remove'`
    - Arquivo: `src/hooks/useTenantUsers.test.ts`
    - _Requirements: 5.2, 5.3, 6.4, 6.5_

- [ ] 16. Checkpoint final — Garantir integração completa
  - Garantir que todos os testes de propriedade passam (fast-check, 100 iterações mínimas)
  - Verificar que nenhuma query usa `LIMIT 1` como substituto de isolamento
  - Verificar que usuário de suporte não aparece em `tenant_users` de nenhum tenant
  - Perguntar ao usuário se há dúvidas antes de encerrar.

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental antes de avançar para a próxima camada
- Usuário de suporte: identificado EXCLUSIVAMENTE por `role='support'` no JWT — nunca registrado em `tenant_users`, nunca contabilizado em limites de plano
- A contagem de usuários ativos usa sempre `COUNT(*) FROM tenant_users WHERE tenant_id = ?`
- `supabase.ts` mantém re-export temporário de `supabaseCrm` para não quebrar hooks existentes durante a migração incremental
