# Implementation Plan: CRM Database Schema Migrations

## Overview

Criar os 3 arquivos de migration SQL em `supabase/migrations/` seguindo a convenção do Supabase CLI. As migrations são não-destrutivas e idempotentes: enums com `IF NOT EXISTS`, colunas com `ADD COLUMN IF NOT EXISTS`, função com `CREATE OR REPLACE`.

## Tasks

- [x] 1. Criar a pasta e o arquivo de enums e funções
  - [x] 1.1 Criar o diretório `supabase/migrations/` e o arquivo `20260324000001_crm_enums_and_functions.sql`
    - Criar o arquivo com cabeçalho e comentários de seção (`-- ===`)
    - _Requirements: 9.1, 9.4, 9.5_

  - [x] 1.2 Declarar os 7 enums com `CREATE TYPE IF NOT EXISTS`
    - `client_status_enum`: `ativo`, `inativo`, `prospect`
    - `contract_status_enum`: `ativo`, `pausado`, `encerrado`
    - `service_type_enum`: `trafego_pago`, `branding`, `site`, `social_media`, `consultoria`, `outro`
    - `lead_status_enum`: `novo`, `contato`, `qualificado`, `proposta`, `negociacao`, `fechado`, `perdido`
    - `lead_temperature_enum`: `frio`, `morno`, `quente`
    - `interaction_type_enum`: `ligacao`, `whatsapp`, `email`, `reuniao`, `anotacao`
    - `tag_label_enum`: `interessado`, `cliente`, `alto_valor`, `indicacao`, `urgente`
    - _Requirements: 1.2, 2.2, 2.3, 3.2, 3.3, 4.2, 5.2, 9.3_

  - [x] 1.3 Criar a função `trigger_set_updated_at()` com `CREATE OR REPLACE FUNCTION`
    - Função retorna `TRIGGER`, seta `NEW.updated_at = now()` e retorna `NEW`
    - _Requirements: 8.1, 8.2, 8.4_

  - [ ]* 1.4 Escrever teste de propriedade — Property 1: Idempotência das migrations
    - **Property 1: Migration idempotency**
    - Executar cada arquivo de migration duas vezes e verificar que não lança erro
    - Usar `fc.constantFrom(migration1, migration2, migration3)` com `numRuns: 100`
    - **Validates: Requirements 1.3, 9.3, 8.2, 8.4**

- [x] 2. Criar o arquivo de expansão das tabelas existentes
  - [x] 2.1 Criar o arquivo `20260324000002_expand_existing_tables.sql` com cabeçalho e seções comentadas
    - _Requirements: 9.1, 9.4, 9.5_

  - [x] 2.2 Adicionar os 8 campos à tabela `clients` com `ADD COLUMN IF NOT EXISTS`
    - Campos: `cnpj`, `segment`, `primary_contact`, `phone`, `email`, `address`, `client_status` (default `prospect`), `contract_start_date`
    - _Requirements: 1.1, 1.3_

  - [x] 2.3 Adicionar os 13 campos à tabela `crm_leads` com `ADD COLUMN IF NOT EXISTS`
    - Campos: `company`, `origin`, `is_opportunity`, `potential_value`, `temperature`, `whatsapp_link`, `last_contact_at`, `qualified_at`, `closed_at`, `lost_reason`, `campaign_id`, `contract_id`, `updated_at`
    - Incluir bloco de normalização de valores legados antes da conversão de tipo
    - _Requirements: 3.1, 3.2_

  - [x] 2.4 Converter `crm_leads.status` de TEXT para `lead_status_enum`
    - Usar `ALTER COLUMN status TYPE lead_status_enum USING status::lead_status_enum`
    - Incluir UPDATE de limpeza de valores inválidos antes da conversão
    - _Requirements: 3.3, 3.4_

  - [x] 2.5 Criar triggers `set_updated_at` em `crm_leads`
    - Trigger BEFORE UPDATE FOR EACH ROW usando `trigger_set_updated_at()`
    - _Requirements: 3.9, 8.3_

  - [x] 2.6 Criar índices em `clients` e `crm_leads`
    - `idx_clients_status` em `clients(client_status)`
    - `idx_clients_segment` em `clients(segment)`
    - `idx_crm_leads_status` em `crm_leads(status)`
    - `idx_crm_leads_temperature` em `crm_leads(temperature)`
    - `idx_crm_leads_origin` em `crm_leads(origin)`
    - `idx_crm_leads_campaign_id` em `crm_leads(campaign_id)`
    - _Requirements: 1.4, 1.5, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 2.7 Escrever teste de propriedade — Property 3: Trigger `updated_at` atualiza automaticamente
    - **Property 3: updated_at auto-update**
    - Para qualquer UPDATE em `contracts` ou `crm_leads`, verificar que `updated_at` após >= `updated_at` antes
    - Usar `fc.constantFrom('contracts', 'crm_leads')` com `numRuns: 100`
    - **Validates: Requirements 2.7, 3.9**

- [x] 3. Criar o arquivo de novas tabelas e views
  - [x] 3.1 Criar o arquivo `20260324000003_new_tables_and_views.sql` com cabeçalho e seções comentadas
    - _Requirements: 9.1, 9.4, 9.5_

  - [x] 3.2 Criar a tabela `contracts` com todos os campos, FK, constraint CHECK e trigger
    - PK `id UUID`, FK `client_id → clients.id ON DELETE CASCADE`
    - Campos: `title`, `monthly_value`, `total_value`, `service_type`, `start_date`, `end_date`, `status`, `notes`, `created_at`, `updated_at`
    - Constraint CHECK `end_date >= start_date`
    - Trigger `set_updated_at` BEFORE UPDATE
    - Índices: `idx_contracts_client_id`, `idx_contracts_status`
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7, 2.8, 8.3_

  - [ ]* 3.3 Escrever teste de propriedade — Property 4: Constraint de data do contrato
    - **Property 4: Contract date constraint rejects end_date before start_date**
    - Para qualquer par `(start_date, end_date)` onde `end_date < start_date`, verificar que INSERT é rejeitado com SQLSTATE `23514`
    - Usar `fc.date()` e `fc.integer({ min: 1, max: 365 })` com `numRuns: 100`
    - **Validates: Requirements 2.8**

  - [x] 3.4 Adicionar FKs `campaign_id` e `contract_id` em `crm_leads`
    - `ADD CONSTRAINT fk_crm_leads_campaign FOREIGN KEY (campaign_id) REFERENCES campaign_data(id)`
    - `ADD CONSTRAINT fk_crm_leads_contract FOREIGN KEY (contract_id) REFERENCES contracts(id)`
    - _Requirements: 3.1_

  - [x] 3.5 Criar a tabela `lead_interactions` com FK e índices
    - PK `id UUID`, FK `lead_id → crm_leads.id ON DELETE CASCADE`
    - Campos: `type interaction_type_enum NOT NULL`, `content TEXT NOT NULL`, `interacted_at`, `created_at`
    - Índices: `idx_lead_interactions_lead_id`, `idx_lead_interactions_interacted_at`
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [x] 3.6 Criar a tabela `lead_tags` com FK, constraint UNIQUE e índices
    - PK `id UUID`, FK `lead_id → crm_leads.id ON DELETE CASCADE`
    - Campos: `tag tag_label_enum NOT NULL`, `created_at`
    - Constraint `UNIQUE(lead_id, tag)`
    - Índices: `idx_lead_tags_lead_id`, `idx_lead_tags_tag`
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6_

  - [x] 3.7 Criar a tabela `lead_followups` com FK, constraint CHECK e índices
    - PK `id UUID`, FK `lead_id → crm_leads.id ON DELETE CASCADE`
    - Campos: `scheduled_at TIMESTAMPTZ NOT NULL`, `note`, `is_done BOOLEAN DEFAULT false`, `done_at`, `created_at`
    - Constraint CHECK `done_at IS NULL OR is_done = true`
    - Índices: `idx_lead_followups_lead_id`, `idx_lead_followups_scheduled_at`, `idx_lead_followups_is_done`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 3.8 Escrever teste de propriedade — Property 2: Cascade delete de lead
    - **Property 2: Cascade delete on lead deletion**
    - Para qualquer lead com N interações, M tags e K follow-ups, deletar o lead deve resultar em 0 registros filhos
    - Usar `fc.record({ nInteractions: fc.nat(10), nTags: fc.nat(5), nFollowups: fc.nat(5) })` com `numRuns: 100`
    - **Validates: Requirements 4.3, 5.3, 6.2**

  - [ ]* 3.9 Escrever teste de propriedade — Property 5: Unicidade de tag por lead
    - **Property 5: Unique tag per lead**
    - Para qualquer lead e qualquer valor de `tag_label_enum`, inserir a mesma tag duas vezes deve ser rejeitado com SQLSTATE `23505`
    - Usar `fc.constantFrom('interessado','cliente','alto_valor','indicacao','urgente')` com `numRuns: 100`
    - **Validates: Requirements 5.4**

  - [ ]* 3.10 Escrever teste de propriedade — Property 6: `done_at` preenchido implica `is_done = true`
    - **Property 6: done_at filled implies is_done = true**
    - Para qualquer `done_at` não-nulo com `is_done = false`, verificar que INSERT/UPDATE é rejeitado com SQLSTATE `23514`
    - Usar `fc.date()` com `numRuns: 100`
    - **Validates: Requirements 6.6**

  - [x] 3.11 Criar a view `lead_campaign_roi` com LEFT JOIN
    - `CREATE OR REPLACE VIEW lead_campaign_roi AS SELECT ... FROM crm_leads l LEFT JOIN campaign_data c ON l.campaign_id = c.id`
    - Expor: `lead_id`, `lead_name`, `lead_origin`, `lead_status`, `potential_value`, `campaign_id`, `campaign_name`, `platform`, `campaign_spend`, `campaign_leads`, `client_id`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 3.12 Criar a view `lead_roi_by_origin` com agregação e cálculo de ROI
    - `CREATE OR REPLACE VIEW lead_roi_by_origin AS SELECT ... FROM lead_campaign_roi GROUP BY lead_origin`
    - Campos: `lead_origin`, `total_leads`, `closed_leads`, `total_potential_value`, `total_campaign_spend`, `roi_ratio`
    - Usar `FILTER (WHERE lead_status = 'fechado')` e `NULLIF(SUM(campaign_spend), 0)`
    - _Requirements: 7.4, 7.5_

  - [ ]* 3.13 Escrever teste de propriedade — Property 7: View `lead_campaign_roi` preserva leads sem campanha
    - **Property 7: lead_campaign_roi LEFT JOIN preserves leads without campaign**
    - Para qualquer lead com `campaign_id = NULL`, verificar que aparece na view com campos de campanha como NULL
    - Usar `fc.record({ name: fc.string({ minLength: 1 }), origin: fc.option(fc.string()) })` com `numRuns: 100`
    - **Validates: Requirements 7.3**

  - [ ]* 3.14 Escrever teste de propriedade — Property 8: View `lead_roi_by_origin` conta apenas leads fechados
    - **Property 8: lead_roi_by_origin counts only closed leads**
    - Para qualquer conjunto de leads com origens e status variados, verificar que `closed_leads` e `total_potential_value` consideram apenas `status = 'fechado'`
    - Usar `fc.array(fc.record({ origin, status, potential_value }), { minLength: 1, maxLength: 20 })` com `numRuns: 100`
    - **Validates: Requirements 7.4, 7.5**

- [x] 4. Checkpoint — Verificar integridade das migrations
  - Garantir que os 3 arquivos existem em `supabase/migrations/` com os timestamps corretos
  - Verificar que a ordem de execução satisfaz todas as dependências (enums → tabelas → views)
  - Garantir que todos os testes passam; perguntar ao usuário se houver dúvidas.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Os testes de propriedade requerem um banco PostgreSQL local (via `supabase start` ou Docker)
- A conversão de `crm_leads.status` (TEXT → enum) pode falhar se houver valores inválidos — o bloco de limpeza na task 2.4 é obrigatório
- Cada task referencia os requisitos específicos para rastreabilidade
