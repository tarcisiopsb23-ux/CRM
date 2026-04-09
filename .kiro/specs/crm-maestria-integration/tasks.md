# Implementation Plan: Integração Maestr.ia ↔ C8 Control

## Overview

Implementação da integração unidirecional entre Maestr.ia (controle financeiro e limites) e C8 Control (CRM multi-tenant). O Maestr.ia publica configurações via Edge Function autenticada por API key. O C8 Control consome e cacheia localmente, verificando status no login e a cada 30 minutos.

O usuário `suporte@agenciac8.com.br` com `role = 'support'` bypassa todas as verificações de status — nunca é bloqueado por restrições de contrato de nenhum tenant.

A implementação segue a ordem de dependência: banco Maestr.ia → API Maestr.ia → banco C8 Control → Edge Function C8 Control → frontend C8 Control → módulo gerencial Maestr.ia.

## Tasks

- [ ] 1. Maestr.ia — Tabelas de controle de tenants e pagamentos
  - [ ] 1.1 Criar migration `maestria/migrations/001_crm_tenant_config.sql`
    - Criar tabela `crm_tenant_config` com todos os campos especificados no design
    - Criar índices `idx_crm_tenant_config_tenant_id` e `idx_crm_tenant_config_status`
    - Criar função e trigger `trg_crm_tenant_config_updated_at` para atualizar `updated_at`
    - Habilitar RLS com política `crm_tenant_config_agency_only` (apenas `is_agency_admin = true`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ] 1.2 Criar migration `maestria/migrations/002_crm_payments.sql`
    - Criar tabela `crm_payments` com FK para `crm_tenant_config.tenant_id`
    - Criar índices `idx_crm_payments_tenant_id`, `idx_crm_payments_status`, `idx_crm_payments_due_date`
    - Habilitar RLS com política `crm_payments_agency_only` (apenas `is_agency_admin = true`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 1.3 Escrever property tests para tabelas do Maestr.ia (Properties 1, 2, 3)
    - **Property 1:** trigger `updated_at` sempre atualiza após UPDATE
    - **Property 2:** RLS bloqueia usuários sem `is_agency_admin = true`
    - **Property 3:** defaults corretos no INSERT sem valores explícitos
    - Usar pgTAP no banco do Maestr.ia
    - Tag: `// Feature: crm-maestria-integration, Property 1/2/3`

- [ ] 2. Maestr.ia — Edge Function `crm-tenant-api`
  - [ ] 2.1 Criar `supabase/functions/crm-tenant-api/index.ts` no projeto Maestr.ia
    - Validar header `x-crm-api-key` → retornar 401 se ausente ou incorreto
    - Implementar GET `?tenant_id=<uuid>` → retornar config do tenant ou defaults
    - Implementar GET `?action=list` → retornar array ordenado por `client_name`
    - Usar service role key para acessar `crm_tenant_config`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 2.2 Configurar secret `CRM_API_KEY` no projeto Maestr.ia
    - Gerar UUID aleatório como valor da chave
    - Configurar via Supabase Dashboard → Edge Functions → Secrets
    - Documentar o valor para uso no C8 Control (Fase 4)
    - _Requirements: 11.1, 11.6_

  - [ ]* 2.3 Escrever property tests para `crm-tenant-api` (Properties 4, 5, 6)
    - **Property 4:** rejeita requisições sem chave válida (100 chaves aleatórias)
    - **Property 5:** retorna apenas dados do tenant solicitado
    - **Property 6:** lista é completa e ordenada por `client_name`
    - Usar fast-check com mocks do Supabase client
    - Tag: `// Feature: crm-maestria-integration, Property 4/5/6`

- [x] 3. C8 Control — Tabela `tenant_config_cache`
  - [x] 3.1 Criar migration `supabase/migrations/20260502000000_tenant_config_cache.sql`
    - Criar tabela `tenant_config_cache` com campos: `tenant_id` (PK), `status`, `max_users`, `plan_name`, `blocked_reason`, `contract_end`, `synced_at`
    - Habilitar RLS com política SELECT por `tenant_id` ou `role = 'support'`
    - Não criar políticas INSERT/UPDATE para usuários autenticados (apenas service role escreve)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 3.2 Escrever property tests para `tenant_config_cache` (Properties 10, 11)
    - **Property 10:** RLS isola tenants e permite support
    - **Property 11:** escrita bloqueada para usuários autenticados via anon key
    - Usar pgTAP no banco do C8 Control
    - Tag: `// Feature: crm-maestria-integration, Property 10/11`

- [-] 4. C8 Control — Edge Function `tenant-status`
  - [x] 4.1 Criar `supabase/functions/tenant-status/index.ts` no projeto C8 Control
    - Extrair `tenant_id` do JWT → retornar 401 se ausente ou `role = 'support'`
    - Chamar `crm-tenant-api` com header `x-crm-api-key` e parâmetro `tenant_id`
    - UPSERT em `tenant_config_cache` via service role key com `synced_at = now()`
    - Retornar 503 sem sobrescrever cache se `crm-tenant-api` falhar
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 4.2 Configurar secrets no projeto C8 Control
    - `MAESTRIA_CRM_API_URL` = URL completa da `crm-tenant-api` no Maestr.ia
    - `CRM_API_KEY` = mesma chave configurada no Maestr.ia (Tarefa 2.2)
    - Configurar via Supabase Dashboard → Edge Functions → Secrets
    - _Requirements: 6.5, 11.1, 11.2_

  - [ ]* 4.3 Escrever property tests para `tenant-status` (Properties 12, 13)
    - **Property 12:** retorna 401 para JWT sem `tenant_id`
    - **Property 13:** preserva cache em caso de falha do Maestr.ia
    - Usar fast-check com mocks de fetch e Supabase client
    - Tag: `// Feature: crm-maestria-integration, Property 12/13`

- [ ] 5. Checkpoint — Validar integração entre sistemas antes do frontend
  - Testar chamada manual à `crm-tenant-api` com `CRM_API_KEY` correta → deve retornar dados
  - Testar chamada manual à `crm-tenant-api` com chave errada → deve retornar 401
  - Testar invocação da `tenant-status` com JWT válido → deve popular `tenant_config_cache`
  - Verificar que `tenant_config_cache` tem RLS correta (tenant A não vê dados do tenant B)
  - Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 6. C8 Control — Hook `useTenantStatus`
  - [x] 6.1 Criar `src/hooks/useTenantStatus.ts`
    - Expor: `{ status, maxUsers, planName, blockedReason, contractEnd, isNearExpiry, loading, lastSyncedAt }`
    - Sincronizar imediatamente ao montar se `tenant_id` presente e `role !== 'support'`
    - Intervalo de 30 minutos com `clearInterval` no cleanup
    - `isNearExpiry = true` quando `contract_end` dentro dos próximos 30 dias e não-null
    - `isNearExpiry = false` quando `contract_end` é null
    - Nunca executar para `role = 'support'`
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 9.1, 9.4, 10.1, 10.2_

  - [x] 6.2 Integrar detecção de mudança de status no `useTenantStatus`
    - Quando sync periódica detecta `status` mudou para `bloqueado`, `suspenso` ou `cancelado`
    - Chamar `signOut()` e exibir mensagem correspondente ao status
    - _Requirements: 8.3_

  - [ ]* 6.3 Escrever property tests para `useTenantStatus` (Properties 9, 14, 15, 17, 18)
    - **Property 9:** `isNearExpiry` calculado corretamente para qualquer `contract_end`
    - **Property 14:** status não-ativo encerra sessão
    - **Property 15:** Support_User bypassa todas as verificações
    - **Property 17:** intervalo cancelado ao desmontar
    - **Property 18:** todos os campos do cache expostos corretamente
    - Usar fast-check com mocks do Supabase client e `supabaseAuth`
    - Tag: `// Feature: crm-maestria-integration, Property 9/14/15/17/18`

- [x] 7. C8 Control — Verificação de status no login
  - [x] 7.1 Atualizar `src/pages/PublicDashboardLoginPage.tsx`
    - Após `signInWithPassword` bem-sucedido, verificar `tenant_config_cache` antes de redirecionar
    - Se cache vazio: invocar `tenant-status` para popular antes de verificar
    - Se `status = 'bloqueado'`: `signOut()` + exibir `"Acesso bloqueado: {blocked_reason}"`
    - Se `status = 'cancelado'`: `signOut()` + exibir `"Contrato cancelado. Entre em contato com a agência."`
    - Se `status = 'suspenso'`: `signOut()` + exibir `"Acesso suspenso. Entre em contato com a agência."`
    - Não aplicar verificação para `role = 'support'`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 7.2 Integrar `useTenantStatus` no `PublicDashboardPage.tsx`
    - Chamar hook no componente principal do dashboard
    - Passar `maxUsers` para `useTenantUsers` substituindo a consulta ao Maestr.ia
    - _Requirements: 8.1, 8.2_

  - [x] 7.3 Criar componente `src/components/ContractExpiryBanner.tsx`
    - Exibir banner quando `isNearExpiry = true` e `role !== 'support'`
    - Mostrar data de vencimento e orientação para contato com a agência
    - Integrar no `PublicDashboardPage.tsx` acima do conteúdo principal
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 7.4 Escrever property tests para verificação de status no login (Property 14)
    - **Property 14:** qualquer status não-ativo encerra sessão e exibe mensagem correta
    - Usar fast-check: para qualquer `status` em `['bloqueado', 'suspenso', 'cancelado']`, verificar que `signOut()` é chamado e mensagem correta é exibida
    - Arquivo: `src/tests/properties/login-status-check.property.test.ts`
    - Tag: `// Feature: crm-maestria-integration, Property 14`

- [ ] 8. Checkpoint — Validar fluxo completo de login e bloqueio
  - Testar login com tenant ativo → deve redirecionar para dashboard
  - Testar login com tenant bloqueado → deve exibir mensagem e encerrar sessão
  - Testar login com `suporte@agenciac8.com.br` → deve ir direto para TenantSelector sem verificação de status
  - Testar sincronização periódica: bloquear tenant no Maestr.ia → aguardar 30min → verificar encerramento de sessão
  - Perguntar ao usuário se há dúvidas antes de prosseguir.

- [ ] 9. Maestr.ia — Módulo Gerencial `/admin/c8control`
  - [ ] 9.1 Criar proteção de rota e estrutura base
    - Verificar `user_metadata.is_agency_admin === true` antes de renderizar
    - Redirecionar para `/dashboard` se não autorizado
    - Criar rotas `/admin/c8control` e `/admin/c8control/:tenantId`
    - _Requirements: 4.1_

  - [ ] 9.2 Criar `TenantListPage` — lista de tenants
    - Tabela com colunas: nome, plano, status, vencimento, ações
    - Filtro por status e busca por nome (case-insensitive)
    - Badge visual `ContractExpiryBadge` para contratos vencendo em ≤ 30 dias
    - _Requirements: 4.2, 4.3, 4.8_

  - [ ] 9.3 Criar `TenantFormModal` — cadastro e edição de tenant
    - Campos: `tenant_id` (UUID), nome, plano, `max_users`, `monthly_value`, `contract_start`, `contract_end`, notas
    - Validação: `tenant_id` obrigatório e formato UUID válido
    - Ao salvar: INSERT ou UPDATE em `crm_tenant_config`
    - _Requirements: 4.4_

  - [ ] 9.4 Criar `BlockReasonModal` — bloqueio com motivo obrigatório
    - Exibido ao alterar status para `bloqueado`
    - Campo `blocked_reason` obrigatório (não permite salvar se vazio)
    - _Requirements: 4.5_

  - [ ] 9.5 Criar `TenantDetailPage` — gestão individual
    - Exibir dados do tenant com opções: alterar status, alterar plano, renovar contrato, cancelar
    - Seção de pagamentos: lista de pagamentos com filtro por status
    - Alerta visual para pagamentos vencidos
    - _Requirements: 4.6, 4.9_

  - [ ] 9.6 Criar `PaymentFormModal` — registro de pagamento manual
    - Campos: descrição, valor, data de vencimento, método de pagamento, notas
    - Ao marcar como `pago`: preencher `paid_at` com timestamp atual
    - _Requirements: 4.7_

  - [ ]* 9.7 Escrever property tests para módulo gerencial (Properties 7, 8)
    - **Property 7:** filtros retornam apenas itens com status/nome corretos
    - **Property 8:** bloqueio sem `blocked_reason` é rejeitado
    - Usar fast-check com mocks do Supabase client
    - Tag: `// Feature: crm-maestria-integration, Property 7/8`

- [ ] 10. Checkpoint final — Validar integração completa
  - Testar ciclo completo: cadastrar tenant no Maestr.ia → fazer login no C8 Control → verificar status ativo
  - Testar bloqueio: bloquear no Maestr.ia → aguardar sync → verificar encerramento de sessão no C8 Control
  - Testar renovação: renovar contrato no Maestr.ia → verificar `isNearExpiry = false` no C8 Control
  - Testar Support_User: login com `suporte@agenciac8.com.br` → verificar que nenhuma verificação de status é executada
  - Verificar que `CRM_API_KEY` não aparece em nenhum arquivo de código-fonte ou variável de ambiente do frontend
  - Perguntar ao usuário se há dúvidas antes de encerrar.

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- O `tenant_id` no Maestr.ia deve ser o mesmo UUID do `clients.id` no C8 Control — informado manualmente no cadastro inicial
- Antes de ativar a verificação de status no login (Tarefa 7.1), garantir que todos os tenants existentes têm registro em `crm_tenant_config` com `status = 'ativo'` para evitar bloqueio por cache vazio
- A `CRM_API_KEY` deve ser gerada uma única vez (UUID v4 aleatório) e configurada simultaneamente nos dois projetos Supabase
- O Support_User (`suporte@agenciac8.com.br`, `role = 'support'`) nunca é afetado por verificações de status — identificado exclusivamente pelo claim JWT
- A sincronização periódica de 30 minutos é suficiente para a maioria dos casos; bloqueios urgentes podem ser propagados manualmente via logout forçado no Maestr.ia (funcionalidade futura)
