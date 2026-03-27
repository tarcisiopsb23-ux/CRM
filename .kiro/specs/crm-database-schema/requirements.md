# Requirements Document

## Introduction

Criação das migrations SQL para o Supabase (PostgreSQL) que estruturam o banco de dados do CRM completo. O projeto já possui um frontend React + TypeScript com Kanban funcional e tabelas básicas (`clients`, `crm_leads`, `campaign_data`, etc.). Este spec cobre a expansão dessas tabelas e a criação de novas para suportar contratos, histórico de interações, tags, follow-ups e vínculos com performance de campanhas.

Os arquivos de migration serão criados em `supabase/migrations/` seguindo a convenção do Supabase CLI (`<timestamp>_<nome_descritivo>.sql`).

## Glossary

- **Migration**: Arquivo SQL versionado executado pelo Supabase CLI para evoluir o schema do banco.
- **clients**: Tabela existente com dados básicos do cliente (id, name, company, dashboard_slug, favicon_url, metadata JSONB).
- **crm_leads**: Tabela existente com campos básicos de leads (id, name, phone, email, address, proposal_value, notes, status, created_at).
- **contracts**: Nova tabela de contratos vinculada a `clients`.
- **lead_interactions**: Nova tabela de histórico de interações com leads.
- **lead_tags**: Nova tabela de tags associadas a leads.
- **lead_followups**: Nova tabela de lembretes e agendamentos de follow-up.
- **campaign_data**: Tabela existente com dados de campanhas de marketing por cliente.
- **Lead**: Registro de oportunidade comercial na tabela `crm_leads`.
- **Pipeline**: Sequência de estágios de um lead: novo → contato → qualificado → proposta → negociação → fechado/perdido.
- **LeadStatus**: Enum dos estágios do pipeline.
- **LeadTemperature**: Enum de temperatura do lead: frio, morno, quente.
- **ContractStatus**: Enum de status do contrato: ativo, pausado, encerrado.
- **ServiceType**: Enum de tipo de serviço: trafego_pago, branding, site, social_media, consultoria, outro.
- **ClientStatus**: Enum de status do cliente: ativo, inativo, prospect.
- **TagLabel**: Enum de tags disponíveis: interessado, cliente, alto_valor, indicacao, urgente.
- **InteractionType**: Enum de tipo de interação: ligacao, whatsapp, email, reuniao, anotacao.
- **ROI_View**: View SQL que cruza dados de `crm_leads` com `campaign_data` para calcular ROI por origem.

## Requirements

---

### Requirement 1: Expansão da tabela `clients`

**User Story:** Como administrador, quero que a tabela `clients` contenha todos os campos necessários para um cadastro completo de clientes, para que eu possa gerenciar informações contratuais e de contato sem depender apenas do campo JSONB.

#### Acceptance Criteria

1. THE Migration SHALL adicionar à tabela `clients` os campos: `cnpj` (VARCHAR(18)), `segment` (VARCHAR(100)), `primary_contact` (VARCHAR(150)), `phone` (VARCHAR(30)), `email` (VARCHAR(255)), `address` (TEXT), `client_status` (ClientStatus, default `prospect`), `contract_start_date` (DATE).
2. THE Migration SHALL criar o tipo enum `client_status_enum` com os valores `ativo`, `inativo`, `prospect` antes de usá-lo na tabela.
3. WHEN um campo já existir na tabela `clients`, THE Migration SHALL usar `ADD COLUMN IF NOT EXISTS` para evitar erros em re-execuções.
4. THE Migration SHALL criar índice em `clients.client_status` para otimizar filtros por status.
5. THE Migration SHALL criar índice em `clients.segment` para otimizar filtros por segmento.

---

### Requirement 2: Criação da tabela `contracts`

**User Story:** Como administrador, quero registrar contratos vinculados a clientes, para que eu possa acompanhar valores, prazos e status de cada contrato.

#### Acceptance Criteria

1. THE Migration SHALL criar a tabela `contracts` com os campos: `id` (UUID, PK, default `gen_random_uuid()`), `client_id` (UUID, FK → `clients.id`, NOT NULL), `title` (VARCHAR(255), NOT NULL), `monthly_value` (NUMERIC(12,2)), `total_value` (NUMERIC(12,2)), `service_type` (ServiceType, NOT NULL), `start_date` (DATE, NOT NULL), `end_date` (DATE), `status` (ContractStatus, default `ativo`), `notes` (TEXT), `created_at` (TIMESTAMPTZ, default `now()`), `updated_at` (TIMESTAMPTZ, default `now()`).
2. THE Migration SHALL criar o tipo enum `service_type_enum` com os valores `trafego_pago`, `branding`, `site`, `social_media`, `consultoria`, `outro`.
3. THE Migration SHALL criar o tipo enum `contract_status_enum` com os valores `ativo`, `pausado`, `encerrado`.
4. THE Migration SHALL criar FK `contracts.client_id → clients.id` com `ON DELETE CASCADE`.
5. THE Migration SHALL criar índice em `contracts.client_id` para otimizar joins.
6. THE Migration SHALL criar índice em `contracts.status` para otimizar filtros por status.
7. THE Migration SHALL criar trigger `set_updated_at` na tabela `contracts` para atualizar `updated_at` automaticamente em cada UPDATE.
8. WHEN `end_date` for anterior a `start_date`, THE Migration SHALL criar constraint CHECK `end_date >= start_date` na tabela `contracts`.

---

### Requirement 3: Expansão da tabela `crm_leads`

**User Story:** Como usuário do CRM, quero que a tabela `crm_leads` suporte todos os campos do pipeline completo, para que eu possa registrar origem, temperatura, valor potencial e outros dados relevantes de cada lead.

#### Acceptance Criteria

1. THE Migration SHALL adicionar à tabela `crm_leads` os campos: `company` (VARCHAR(150)), `origin` (VARCHAR(100)), `is_opportunity` (BOOLEAN, default `false`), `potential_value` (NUMERIC(12,2)), `temperature` (LeadTemperature, default `frio`), `whatsapp_link` (TEXT), `last_contact_at` (TIMESTAMPTZ), `qualified_at` (TIMESTAMPTZ), `closed_at` (TIMESTAMPTZ), `lost_reason` (TEXT), `campaign_id` (UUID, FK → `campaign_data.id`), `contract_id` (UUID, FK → `contracts.id`), `updated_at` (TIMESTAMPTZ, default `now()`).
2. THE Migration SHALL criar o tipo enum `lead_temperature_enum` com os valores `frio`, `morno`, `quente`.
3. THE Migration SHALL expandir o tipo enum `lead_status_enum` (ou recriar) para incluir os valores: `novo`, `contato`, `qualificado`, `proposta`, `negociacao`, `fechado`, `perdido`.
4. WHEN o campo `status` em `crm_leads` já usar um tipo TEXT, THE Migration SHALL converter a coluna para o enum `lead_status_enum`.
5. THE Migration SHALL criar índice em `crm_leads.status` para otimizar filtros do Kanban.
6. THE Migration SHALL criar índice em `crm_leads.temperature` para otimizar filtros por temperatura.
7. THE Migration SHALL criar índice em `crm_leads.origin` para otimizar agrupamentos por origem.
8. THE Migration SHALL criar índice em `crm_leads.campaign_id` para otimizar joins com campanhas.
9. THE Migration SHALL criar trigger `set_updated_at` na tabela `crm_leads` para atualizar `updated_at` automaticamente em cada UPDATE.

---

### Requirement 4: Criação da tabela `lead_interactions`

**User Story:** Como usuário do CRM, quero registrar o histórico de interações com cada lead, para que eu possa acompanhar o progresso das conversas e anotações ao longo do tempo.

#### Acceptance Criteria

1. THE Migration SHALL criar a tabela `lead_interactions` com os campos: `id` (UUID, PK, default `gen_random_uuid()`), `lead_id` (UUID, FK → `crm_leads.id`, NOT NULL), `type` (InteractionType, NOT NULL), `content` (TEXT, NOT NULL), `interacted_at` (TIMESTAMPTZ, default `now()`), `created_at` (TIMESTAMPTZ, default `now()`).
2. THE Migration SHALL criar o tipo enum `interaction_type_enum` com os valores `ligacao`, `whatsapp`, `email`, `reuniao`, `anotacao`.
3. THE Migration SHALL criar FK `lead_interactions.lead_id → crm_leads.id` com `ON DELETE CASCADE`.
4. THE Migration SHALL criar índice em `lead_interactions.lead_id` para otimizar a busca do histórico de um lead.
5. THE Migration SHALL criar índice em `lead_interactions.interacted_at` para otimizar ordenação cronológica.

---

### Requirement 5: Criação da tabela `lead_tags`

**User Story:** Como usuário do CRM, quero associar tags a leads, para que eu possa categorizar e filtrar leads por características como "Alto valor" ou "Urgente".

#### Acceptance Criteria

1. THE Migration SHALL criar a tabela `lead_tags` com os campos: `id` (UUID, PK, default `gen_random_uuid()`), `lead_id` (UUID, FK → `crm_leads.id`, NOT NULL), `tag` (TagLabel, NOT NULL), `created_at` (TIMESTAMPTZ, default `now()`).
2. THE Migration SHALL criar o tipo enum `tag_label_enum` com os valores `interessado`, `cliente`, `alto_valor`, `indicacao`, `urgente`.
3. THE Migration SHALL criar FK `lead_tags.lead_id → crm_leads.id` com `ON DELETE CASCADE`.
4. THE Migration SHALL criar constraint UNIQUE em `(lead_id, tag)` para evitar tags duplicadas no mesmo lead.
5. THE Migration SHALL criar índice em `lead_tags.lead_id` para otimizar a busca de tags de um lead.
6. THE Migration SHALL criar índice em `lead_tags.tag` para otimizar filtros por tag.

---

### Requirement 6: Criação da tabela `lead_followups`

**User Story:** Como usuário do CRM, quero agendar lembretes de follow-up para leads, para que eu não esqueça de retornar contatos importantes.

#### Acceptance Criteria

1. THE Migration SHALL criar a tabela `lead_followups` com os campos: `id` (UUID, PK, default `gen_random_uuid()`), `lead_id` (UUID, FK → `crm_leads.id`, NOT NULL), `scheduled_at` (TIMESTAMPTZ, NOT NULL), `note` (TEXT), `is_done` (BOOLEAN, default `false`), `done_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ, default `now()`).
2. THE Migration SHALL criar FK `lead_followups.lead_id → crm_leads.id` com `ON DELETE CASCADE`.
3. THE Migration SHALL criar índice em `lead_followups.lead_id` para otimizar a busca de follow-ups de um lead.
4. THE Migration SHALL criar índice em `lead_followups.scheduled_at` para otimizar a consulta de lembretes do dia.
5. THE Migration SHALL criar índice em `lead_followups.is_done` para otimizar filtros de pendentes vs. concluídos.
6. WHEN `done_at` for preenchido, THE Migration SHALL garantir via constraint CHECK que `is_done = true`.

---

### Requirement 7: View de ROI por origem de lead

**User Story:** Como gestor, quero uma view que relacione leads fechados com campanhas de marketing, para que eu possa calcular o ROI por origem e tomar decisões baseadas em dados.

#### Acceptance Criteria

1. THE Migration SHALL criar a view `lead_campaign_roi` que cruza `crm_leads` com `campaign_data` via `crm_leads.campaign_id = campaign_data.id`.
2. THE `lead_campaign_roi` view SHALL expor os campos: `lead_id`, `lead_name`, `lead_origin`, `lead_status`, `potential_value`, `campaign_id`, `campaign_name`, `platform`, `campaign_spend`, `campaign_leads`, `client_id`.
3. WHEN `crm_leads.campaign_id` for NULL, THE `lead_campaign_roi` view SHALL incluir o lead com os campos de campanha como NULL (LEFT JOIN).
4. THE Migration SHALL criar a view `lead_roi_by_origin` que agrega `lead_campaign_roi` por `lead_origin`, expondo: `lead_origin`, `total_leads`, `closed_leads`, `total_potential_value`, `total_campaign_spend`, `roi_ratio` (total_potential_value / NULLIF(total_campaign_spend, 0)).
5. THE `lead_roi_by_origin` view SHALL filtrar apenas leads com `lead_status IN ('fechado')` para o cálculo de `closed_leads` e `total_potential_value`.

---

### Requirement 8: Função utilitária e trigger de `updated_at`

**User Story:** Como desenvolvedor, quero uma função SQL reutilizável para atualizar `updated_at`, para que todas as tabelas com esse campo mantenham consistência automática sem duplicar lógica.

#### Acceptance Criteria

1. THE Migration SHALL criar a função `trigger_set_updated_at()` que retorna `NEW` com `NEW.updated_at = now()`.
2. THE Migration SHALL usar `CREATE OR REPLACE FUNCTION` para que a função seja idempotente.
3. THE Migration SHALL aplicar o trigger `set_updated_at` usando a função `trigger_set_updated_at()` nas tabelas `contracts` e `crm_leads`.
4. WHEN a função `trigger_set_updated_at` já existir, THE Migration SHALL substituí-la sem erro (via `CREATE OR REPLACE`).

---

### Requirement 9: Organização e convenção dos arquivos de migration

**User Story:** Como desenvolvedor, quero que os arquivos de migration sigam a convenção do Supabase CLI, para que possam ser executados em ordem correta e rastreados pelo controle de versão.

#### Acceptance Criteria

1. THE Migration files SHALL ser criados em `supabase/migrations/` com o formato de nome `<timestamp>_<nome_descritivo>.sql`.
2. THE Migration files SHALL ser organizados em ordem de dependência: enums e funções utilitárias primeiro, depois tabelas base, depois tabelas dependentes, depois views.
3. THE Migration SHALL usar `CREATE TYPE ... IF NOT EXISTS` ou verificação equivalente para todos os enums, garantindo idempotência.
4. THE Migration SHALL incluir comentários de seção (`-- ===`) para separar blocos lógicos dentro de cada arquivo.
5. THE Migration files SHALL ser divididos em no mínimo 3 arquivos separados: (1) tipos e funções, (2) expansão de tabelas existentes, (3) novas tabelas e views.
