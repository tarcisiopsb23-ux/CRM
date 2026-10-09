# C8 CONTROL — FASE 0: AUDITORIA DE ARQUITETURA
## Automação Multicanal, Agentes IA, Meta e Integrações Personalizadas

**Data:** Setembro 2026
**Escopo:** Análise completa antes de qualquer alteração estrutural

---

## A. ESTADO ATUAL

### A.1 Topologia — Um único banco

O ecossistema C8 opera sobre **dois projetos distintos com um único banco de dados por projeto**:

```
┌──────────────────────────────────────────────────────────┐
│  MAESTR.IA — c:\automacoes\CRM                          │
│  Banco A (Supabase da agência)                          │
│  Multi-tenant via organization_id (equipe da agência)   │
│  Multi-tenant via client_id (clientes do C8 Control)    │
│                                                          │
│  Dados da agência:                                       │
│    organizations, profiles, leads, clients,             │
│    contracts, payments, projects, tasks, events...      │
│                                                          │
│  Dados dos clientes do C8 Control:                       │
│    client_crm_contacts, client_crm_deals,               │
│    client_crm_pipeline_stages, client_crm_products,     │
│    client_ai_settings, client_ai_events,                │
│    client_ai_promotions, client_ai_suggestions,         │
│    client_ai_notices, client_ai_reminders,              │
│    client_charges, client_whatsapp_sessions             │
│                                                          │
│  Auth: Supabase Auth com organization_id no JWT         │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  C8 CONTROL — c:\automacoes\C8 Control                  │
│  Banco SaaS (Supabase separado)                         │
│  Multi-tenant via tenant_id no JWT                      │
│                                                          │
│  Gestão de tenants: clients, tenant_users               │
│  OAuth: oauth_tokens (Google, Meta)                     │
│  CRM próprio: crm_leads, lead_interactions...           │
│  Campanhas: campaign_data, daily_metrics                │
│  Planos: clients.plan_name, max_users                   │
│                                                          │
│  Auth: SaaS Auth com tenant_id + app_role no JWT        │
│        (custom_access_token_hook)                        │
└──────────────────────────────────────────────────────────┘
```

> **Não existe mais Banco B por cliente.** A migração foi concluída. Todos os dados dos clientes do C8 Control estão no Banco A (Maestr.ia), isolados por `client_id` com RLS. O prefixo `client_` nas tabelas identifica os dados dos clientes.

---

### A.2 Módulos Existentes Relevantes

| Módulo | Projeto | Estado | Reaproveitável |
|--------|---------|--------|----------------|
| Multi-tenancy `organization_id` (equipe) | Maestr.ia | ✅ Funcional | ✅ Total |
| Multi-tenancy `client_id` (clientes C8) | Maestr.ia | ✅ Funcional | ✅ Total |
| Auth JWT com custom claims (`tenant_id`) | C8 Control | ✅ Funcional | ✅ Total |
| OAuth Exchange (Google + Meta) | C8 Control | ✅ Funcional | ✅ Ampliar |
| `oauth_tokens` com `tenant_id` | C8 Control | ✅ Funcional | ✅ Ampliar |
| `organization_integrations` (N8nConfig) | Maestr.ia | ✅ Funcional | ✅ Ampliar |
| Chat interno da equipe | Maestr.ia | ✅ Funcional | ⚠️ Manter separado do Inbox externo |
| CRM da agência (leads, pipeline) | Maestr.ia | ✅ Funcional | ✅ Total |
| CRM dos clientes (`client_crm_*`) | Maestr.ia | ✅ Schema OK | ✅ Ampliar |
| `client_crm_contacts` | Maestr.ia | ✅ Funcional | ✅ Base para contatos de canal |
| `client_ai_settings` | Maestr.ia | ✅ Funcional | ✅ Evoluir para agent_config |
| `client_whatsapp_sessions` | Maestr.ia | ⚠️ Tabela existe, sem impl real | ✅ Evoluir |
| Agenda (`client_appointments`) | Maestr.ia | ✅ Funcional | ✅ Integrar |
| Google Calendar OAuth | Maestr.ia | ✅ Funcional | Referência de padrão |
| WhatsApp (n8n + webhook externo) | Maestr.ia | ⚠️ Parcial via n8n | Evoluir |
| OpenAI GPT-4o-mini | Maestr.ia | ✅ Em uso (recrutamento) | ✅ Replicar padrão |
| **Módulo Mensagens** (sidebar C8 Control) | C8 Control | ✅ Estrutura criada (Fase 3) | 🆕 Implementar |
| **Módulo Chatbot** (sidebar C8 Control) | C8 Control | ✅ Estrutura criada (Fase 2-4) | 🆕 Implementar |
| RAG / pgvector | — | ❌ Não existe | 🆕 Criar |
| Filas persistentes | — | ❌ Não existe | 🆕 pg_cron |
| Webhook Gateway Meta | — | ❌ Não existe | 🆕 Criar |
| Automation Engine | — | ❌ Não existe | 🆕 Criar |
| Integrações Personalizadas | — | ❌ Não existe | 🆕 Criar |

---

## A.6 Estrutura de Módulos do C8 Control (Dashboard do Cliente)

Definida e implementada como estrutura base. Rotas e páginas criadas:

### Sidebar

```
Resultados
  → Dashboard Geral        /:slug
  → Performance            /:slug/performance
  → Conversas              /:slug/atendimento      (label renomeada de "Atendimento")

CRM
  → Clientes / Funis / Produtos / Campos

Agenda
  → Agendamentos / Configurar / Link Público

Mensagens                  (modules_config.messaging_enabled = true)
  → Caixa de Entrada       /:slug/mensagens
  → Histórico              /:slug/mensagens/historico

Chatbot                    (modules_config.automation_enabled = true)
  → Canais                 /:slug/chatbot/canais
  → Meu Agente             /:slug/chatbot/agente
  → Conhecimento           /:slug/chatbot/conhecimento
       tabs: Avisos | Eventos | Promoções | Sugestões
             FAQ | Políticas | Serviços | Horários | Docs (Fase 4)

Configurações              (existente — sem mudança)
```

### Flags de controle (ModulesConfig)

| Flag | Comportamento |
|------|---------------|
| `messaging_enabled` | Exibe grupo Mensagens |
| `automation_enabled` | Exibe grupo Chatbot; suprime legados WhatsApp e Conteúdo IA |
| `whatsapp_enabled` (deprecated) | Exibido apenas quando `automation_enabled = false` |
| `show_ia_content` (deprecated) | Exibido apenas quando `automation_enabled = false` |

### Permissões por rota

| Rota | Role mínimo |
|------|------------|
| `/mensagens`, `/mensagens/historico` | member |
| `/chatbot/conhecimento` | member |
| `/chatbot/agente` | manager |
| `/chatbot/canais` | admin |

### Páginas criadas

| Arquivo | Status |
|---------|--------|
| `MensagensPage.tsx` | Estrutural — Fase 3 |
| `MensagensHistoricoPage.tsx` | Estrutural — Fase 3 |
| `ChatbotCanaisPage.tsx` | Estrutural — Fase 2 |
| `ChatbotAgentePage.tsx` | Toggle `bot_active` funcional; config completa Fase 4 |
| `ChatbotConhecimentoPage.tsx` | Tabs Avisos/Eventos/Promoções/Sugestões funcionais; Fase 4 como placeholder |

### WWebJS / QR Code removido

`WhatsAppPage.tsx` e `useWhatsAppSession.ts` removidos. O método viola os Termos
de Serviço da Meta com risco real de banimento. Conexão oficial exclusivamente
via Meta Business Platform (Fase 2).

---

### A.3 Tabelas Existentes no Banco A — Relevantes para Automação

**Dados dos clientes C8 Control (prefixo `client_`, isolados por `client_id`):**

```
client_crm_contacts        — contatos por cliente (phone, email, source, tags, metadata)
client_crm_deals           — negociações (contact_id, stage_id, value, status)
client_crm_pipeline_stages — etapas do funil de vendas
client_crm_products        — produtos e serviços
client_crm_users           — usuários do C8 Control por cliente
client_ai_settings         — configuração do agente IA por cliente
  establishment_name, phone, whatsapp, instagram, address,
  opening_hours, welcome_message, auto_reply_24h, forward_to_human,
  bot_active, meta_pixel_id, google_tag_id,
  asaas_api_key (protegida via view client_ai_settings_safe)
client_ai_events           — eventos para o agente (música ao vivo, dias especiais)
client_ai_promotions       — promoções
client_ai_suggestions      — sugestões da semana
client_ai_notices          — avisos
client_ai_reminders        — lembretes rápidos
client_charges             — cobranças Asaas por cliente
client_whatsapp_sessions   — sessão WhatsApp por cliente (tabela existe, sem impl real)
client_ai_settings_safe    — view que nunca expõe asaas_api_key
```

**Dados da agência (prefixo `organization_id`):**

```
organizations           — tenants da agência
profiles                — usuários da equipe
whatsapp_contacts       — contatos WhatsApp da agência (com organization_id)
whatsapp_conversations  — conversas WhatsApp da agência
whatsapp_messages       — mensagens WhatsApp da agência
client_appointments     — agendamentos dos clientes
client_schedule_config  — configuração de horários
organization_integrations — integrações por tenant (n8n, whatsapp, google_calendar...)
```

**C8 Control (Banco SaaS):**

```
clients        — tenants (cada cliente = um registro)
crm_leads      — leads do pipeline
oauth_tokens   — tokens OAuth (Google, Meta) com tenant_id
tenant_users   — vínculo usuário ↔ tenant
```

---

### A.4 Estado das Integrações Meta

| Recurso | Estado |
|---------|--------|
| `META_APP_ID`, `META_APP_SECRET` (secrets Edge Functions) | ✅ Configurados |
| `oauth-exchange` — Meta Ads long-lived token | ✅ Funcional |
| `meta_ad_account_id` em `oauth_tokens` | ✅ Funcional |
| `meta_pixel_id` em `client_ai_settings` | ✅ Funcional |
| `track-conversion` Edge Function (CAPI) | ✅ Funcional |
| `WhatsAppSection` — expõe `access_token` no frontend | ⚠️ Vulnerabilidade ativa |
| Instagram OAuth (Messaging API) | ❌ Não implementado |
| WhatsApp Embedded Signup | ❌ Não implementado |
| Webhook Gateway central Meta | ❌ Não existe |
| Normalização de eventos Meta | ❌ Não existe |

---

### A.5 n8n Workflows Existentes

| Workflow | Função |
|----------|--------|
| `c8-provision-client.json` | Provisionar cliente (atualizado para Banco A) |
| `c8-client-ops.json` | Operações no banco do cliente |
| `c8-update-all-schemas.json` | Atualizar schema |
| `agenda-google-webhook.json` | Google Calendar → Maestr.ia |
| `agenda-manager.json` | Gerenciar horários, renovar watch channel |
| `agenda-upsert.json` | Criar/atualizar agendamentos |
| `fs-lead-*.json` | Fluxos de lead (quente, frio, universal, GMN) |

---

## B. GAPS IDENTIFICADOS

### B.1 Channel Core (Crítico)

- ❌ Sem tabela `channel_connections` (conexões Instagram/WhatsApp por cliente)
- ❌ Sem armazenamento seguro de tokens por canal no Banco A
- ❌ Sem `contact_channel_identities` (vínculo contato ↔ canal externo)
- ❌ WhatsApp Embedded Signup não implementado
- ❌ Instagram OAuth (Instagram Login API) não implementado
- ❌ Webhook Gateway central (`/api/webhooks/meta`) não existe
- ❌ Idempotência de webhooks não implementada
- ❌ Normalização de eventos Meta não existe

### B.2 Conversas Externas (Inbox)

- ⚠️ `useOmnichannelChat.ts` no C8 Control é 100% mock
- ⚠️ `client_whatsapp_sessions` existe mas sem implementação real de conversa/mensagem
- ❌ Sem tabelas de conversas externas no Banco A com clientes finais (WhatsApp/Instagram)
- ❌ Sem estados de atendimento (AI_ACTIVE, WAITING_HUMAN, HUMAN_ACTIVE etc.)
- ❌ Sem handoff IA → Humano
- ❌ Sem inbox real integrado ao Banco A

### B.3 Agente IA

- ⚠️ `client_ai_settings` tem config básica (nome, instruções), mas sem motor real
- ❌ Sem LLM loop com function calling
- ❌ Sem RAG (pgvector não habilitado)
- ❌ Sem tools nativas do CRM (consultar contato, criar deal, etc.)
- ❌ Sem tools para integrações personalizadas

### B.4 Base de Conhecimento / RAG

- ❌ pgvector não habilitado no Banco A
- ❌ Sem tabelas de knowledge base, chunks, embeddings
- ❌ Sem pipeline de ingestion

### B.5 Automation Engine

- ❌ Sem motor de automações (triggers, conditions, actions, runs, delays)
- ❌ Sem scheduler persistente (usar `pg_cron` via Supabase)
- ❌ Sem builder visual

### B.6 Integrações Personalizadas

- ❌ Sem área admin de registro de integrações por cliente
- ❌ Sem schema configurável por integração
- ❌ Sem tool dinâmica por `client_id` + agente
- ❌ Sem logs de execução de integração
- ❌ Sem contrato padronizado com HMAC

### B.7 Segurança

- ⚠️ `WhatsAppSection` expõe `access_token` diretamente no frontend
- ❌ Sem HMAC verification para webhooks Meta
- ❌ Sem SSRF protection para custom integrations
- ❌ Sem rate limit por client

---

## C. ARQUITETURA PROPOSTA

### C.1 Diagrama Geral

```
Instagram / WhatsApp
        │
        ▼
┌────────────────────────────────────────────────┐
│  C8 CHANNEL GATEWAY                           │
│  Edge Function: meta-webhook (Banco A)        │
│                                               │
│  • Verificar assinatura HMAC                  │
│  • Identificar cliente via channel_connections│
│  • Normalizar → ChannelEvent                  │
│  • Idempotência via external_event_id         │
│  • Persistir em channel_events                │
│  • Encaminhar ao Automation Engine            │
└─────────────────────┬──────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  AUTOMATION ENGINE (Banco A)                  │
│                                               │
│  • Avaliar triggers                           │
│  • Executar actions                           │
│  • Criar automation_runs                      │
│  • Agendar delays via channel_scheduled_jobs  │
└────────┬───────────────────────────────────────┘
         │
    ┌────┼────────────┐
    ▼    ▼            ▼
  Fluxo  Agente IA   Humano (Inbox)
         │
    ┌────┼──────────┐
    ▼    ▼          ▼
   RAG  CRM     Integrações
         (Banco A)  Personalizadas
                        │
                        ▼
                       n8n
                        │
                        ▼
                   APIs externas
```

### C.2 Onde Fica Cada Coisa no Banco A

| Dado | Tabela | Isolamento |
|------|--------|------------|
| Conexões de canal | `channel_connections` | `client_id` |
| Tokens/credenciais de canal | `channel_credentials` | `client_id` |
| Identidades externas de contatos | `contact_channel_identities` | `client_id` |
| Eventos de webhook (idempotência) | `channel_events` | `client_id` |
| Conversas com clientes finais | `channel_conversations` | `client_id` |
| Mensagens das conversas | `channel_messages` | `client_id` |
| Automações | `automations` | `client_id` |
| Nodes das automações | `automation_nodes` | `automation_id` |
| Execuções de automações | `automation_runs` | `client_id` |
| Jobs de delay persistente | `channel_scheduled_jobs` | `client_id` |
| Configuração do agente IA | `agent_configs` | `client_id` |
| Bases de conhecimento | `knowledge_bases` | `client_id` |
| Documentos do RAG | `knowledge_documents` | `client_id` |
| Chunks + embeddings | `knowledge_chunks` (pgvector) | `client_id` |
| Integrações personalizadas | `custom_integrations` | `client_id` |
| Logs de integrações | `custom_integration_logs` | `client_id` |

> Todas as tabelas novas seguirão o padrão do Banco A: `client_id UUID REFERENCES clients(id)` + `organization_id UUID REFERENCES organizations(id)` + RLS com `authenticated_access`.

---

## D. BANCO DE DADOS

### D.1 Tabelas Existentes — Reaproveitamento Direto

| Tabela | Uso nas novas funcionalidades |
|--------|-------------------------------|
| `client_crm_contacts` | Base para contatos de canal (enriquecer com `contact_channel_identities`) |
| `client_crm_deals` | Oportunidades criadas pelo agente |
| `client_crm_pipeline_stages` | Mover deals entre stages via automation |
| `client_ai_settings` | Config básica do agente (evoluir para `agent_configs`) |
| `client_whatsapp_sessions` | Substituída por `channel_connections` + `channel_conversations` |
| `whatsapp_contacts` (agência) | Referência de padrão para contatos externos |
| `whatsapp_conversations` (agência) | Referência de padrão para conversas externas |
| `oauth_tokens` (C8 Control) | Ampliar: adicionar `channel_type`, `waba_id`, `phone_number_id`, `instagram_account_id` |
| `organization_integrations` | Manter para n8n; adicionar tipos `meta_instagram`, `meta_whatsapp` |

### D.2 Novas Tabelas — Banco A (migration por migration)

```sql
-- FASE 1: Channel Core
channel_connections
  id UUID PK, client_id → clients, organization_id → organizations,
  channel_type TEXT CHECK ('instagram'|'whatsapp'|'messenger'),
  external_account_id TEXT,    -- WABA ID ou Instagram User ID
  display_name TEXT,           -- nome exibido ao usuário
  username TEXT,               -- @usuario do Instagram ou número WhatsApp
  waba_id TEXT,                -- WhatsApp Business Account ID
  phone_number_id TEXT,        -- WhatsApp Phone Number ID
  instagram_account_id TEXT,   -- Instagram Professional Account ID
  business_id TEXT,            -- Meta Business ID
  status TEXT CHECK ('connected'|'disconnected'|'error'|'reconnecting'),
  connected_at TIMESTAMPTZ, disconnected_at TIMESTAMPTZ,
  last_error TEXT, metadata JSONB, created_at, updated_at

channel_credentials
  id UUID PK, channel_connection_id → channel_connections, client_id,
  access_token TEXT NOT NULL,  -- NUNCA retornado ao frontend
  token_expires_at TIMESTAMPTZ,
  created_at, updated_at
  -- RLS: sem policy para authenticated; apenas service_role via Edge Function

contact_channel_identities
  id UUID PK, client_id, organization_id,
  contact_id → client_crm_contacts,
  channel_type TEXT, external_user_id TEXT,
  channel_connection_id → channel_connections,
  username TEXT, display_name TEXT, metadata JSONB, created_at
  UNIQUE (client_id, channel_type, external_user_id)

channel_events                 -- idempotência de webhooks
  id UUID PK, client_id, channel_connection_id,
  external_event_id TEXT,      -- ID único do evento no Meta
  event_type TEXT,             -- message.received, comment.created, etc.
  raw_payload JSONB,
  processed_at TIMESTAMPTZ, created_at
  UNIQUE (client_id, channel_type, external_event_id)

-- FASE 3: Conversas
channel_conversations
  id UUID PK, client_id, organization_id,
  channel_type TEXT, channel_connection_id → channel_connections,
  contact_id → client_crm_contacts,
  status TEXT CHECK (
    'ai_active'|'automation_active'|'waiting_customer'|
    'waiting_human'|'human_active'|'paused'|'closed'),
  assigned_user_id → profiles,
  assigned_at TIMESTAMPTZ,
  ai_enabled BOOLEAN DEFAULT true,
  automation_id → automations,
  last_message_at TIMESTAMPTZ, created_at, updated_at

channel_messages
  id UUID PK, client_id, conversation_id → channel_conversations,
  direction TEXT CHECK ('inbound'|'outbound'),
  channel_type TEXT,
  external_message_id TEXT UNIQUE per client,  -- idempotência
  content TEXT, media_url TEXT, media_type TEXT,
  status TEXT CHECK ('pending'|'sent'|'delivered'|'read'|'failed'),
  sent_by TEXT CHECK ('ai'|'human'|'automation'|'system'),
  sent_by_user_id → profiles,
  created_at

-- FASE 4: Agente IA
agent_configs
  id UUID PK, client_id, organization_id,
  name TEXT, role TEXT, description TEXT,
  personality JSONB,           -- { tone, formality, emojis, response_length }
  objective TEXT,              -- 'atendimento'|'qualificação'|'vendas'|...
  instructions TEXT,           -- regras livres
  behaviors JSONB,             -- { rag, collect_data, update_crm, create_deal, handoff }
  knowledge_base_ids UUID[],
  status TEXT CHECK ('active'|'inactive'), created_at, updated_at

knowledge_bases
  id UUID PK, client_id, organization_id,
  name TEXT, description TEXT,
  status TEXT CHECK ('active'|'inactive'), created_at, updated_at

knowledge_documents
  id UUID PK, knowledge_base_id → knowledge_bases, client_id,
  title TEXT, source_type TEXT CHECK ('text'|'url'|'pdf'|'docx'|'qa'),
  source_url TEXT, raw_content TEXT,
  status TEXT CHECK ('pending'|'processing'|'ready'|'error'),
  created_at, updated_at

knowledge_chunks               -- pgvector necessário
  id UUID PK, document_id → knowledge_documents,
  knowledge_base_id, client_id,
  content TEXT NOT NULL,
  embedding vector(1536),      -- text-embedding-3-small (OpenAI)
  token_count INTEGER, created_at

-- FASE 5: Integrações Personalizadas
custom_integrations
  id UUID PK, client_id, organization_id,
  name TEXT, identifier TEXT,  -- nome técnico da tool (ex: consultar_cardapio)
  description_user TEXT,       -- descrição amigável para o cliente
  description_ai TEXT,         -- descrição para o LLM entender quando usar
  webhook_url TEXT,
  webhook_method TEXT DEFAULT 'POST',
  webhook_secret TEXT,         -- HMAC secret
  timeout_ms INTEGER DEFAULT 30000,
  input_schema JSONB,          -- JSON Schema dos parâmetros
  output_schema JSONB,
  status TEXT CHECK ('active'|'inactive'), created_at, updated_at

custom_integration_logs
  id UUID PK, custom_integration_id, client_id,
  conversation_id, agent_id,
  input_payload JSONB, output_payload JSONB,
  http_status INTEGER, duration_ms INTEGER, error TEXT, created_at

-- FASE 6: Automation Engine
automations
  id UUID PK, client_id, organization_id,
  name TEXT, description TEXT,
  trigger_type TEXT,           -- message.received, keyword.matched, contact.created...
  trigger_config JSONB,
  status TEXT CHECK ('draft'|'published'|'paused'|'archived'),
  version INTEGER DEFAULT 1, created_at, updated_at

automation_nodes
  id UUID PK, automation_id,
  type TEXT,                   -- send_message, condition, wait, run_agent, crm...
  config JSONB,
  next_node_id UUID, condition_true_node_id UUID, condition_false_node_id UUID,
  "order" INTEGER

automation_runs
  id UUID PK, client_id, automation_id,
  conversation_id, contact_id,
  status TEXT CHECK ('running'|'completed'|'failed'|'cancelled'),
  current_node_id UUID, started_at, finished_at,
  error TEXT, context JSONB

channel_scheduled_jobs          -- delays persistentes (sem setTimeout)
  id UUID PK, client_id, automation_run_id,
  execute_at TIMESTAMPTZ, executed_at TIMESTAMPTZ,
  action_type TEXT, action_config JSONB,
  status TEXT CHECK ('pending'|'executed'|'cancelled')
```

### D.3 Alterações em Tabelas Existentes

| Tabela | Alteração | Fase |
|--------|-----------|------|
| `oauth_tokens` (C8 Control) | Adicionar `channel_type`, `waba_id`, `phone_number_id`, `instagram_account_id` | 1 |
| `client_ai_settings` | Manter intacta; `agent_configs` a substitui gradualmente | 4 |
| `client_whatsapp_sessions` | Deprecar em favor de `channel_connections` + `channel_conversations` | 3 |

---

## E. SEGURANÇA

### E.1 Credenciais de Canal

- `channel_credentials`: nenhuma policy RLS para `authenticated` — apenas `service_role` via Edge Function
- Tokens nunca retornados ao frontend em nenhuma RPC ou view
- `WhatsAppSection` atual deve ser refatorada imediatamente (Fase 1)

### E.2 RLS Padrão para Novas Tabelas

Todas as novas tabelas seguirão o padrão já estabelecido no Banco A:

```sql
ALTER TABLE nova_tabela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_access" ON nova_tabela
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "no_anon_access" ON nova_tabela
  FOR ALL TO anon USING (false);
```

Isolamento garantido via `client_id` nas queries (via RPCs `SECURITY DEFINER`).

### E.3 Webhook Security

- Validação HMAC-SHA256 com `META_APP_SECRET` em todos os webhooks Meta
- Secret individual por `custom_integration` (HMAC ou Bearer)
- SSRF protection: allowlist de domínios para custom integrations
- Rate limit por client via Edge Function middleware

### E.4 OAuth Channels

- `state` obrigatório em todos os fluxos OAuth
- State armazenado em tabela temporária: `oauth_states (state, client_id, channel, user_id, expires_at)`
- Nunca confiar em `client_id` enviado pelo browser — extrair do JWT

---

## F. META — CONFIGURAÇÃO EXTERNA NECESSÁRIA

Antes do desenvolvimento da Fase 2, configurar manualmente no Meta for Developers:

```
1. Business Portfolio: verificar empresa C8 Agency
2. App C8 Control criado
3. Produtos:
   - Instagram (Instagram API with Instagram Login)
   - WhatsApp Business Platform
4. Permissões Instagram:
   - instagram_business_basic
   - instagram_business_manage_messages
   - instagram_business_manage_comments
5. Permissões WhatsApp:
   - whatsapp_business_messaging
   - whatsapp_business_management
6. OAuth Redirect URIs:
   - https://<app-url>/oauth/callback/instagram
   - https://<app-url>/oauth/callback/whatsapp
7. Webhook Verify Token → META_VERIFY_TOKEN
8. Embedded Signup Config
9. App Review para Advanced Access (2–8 semanas)
```

---

## G. ROADMAP

### FASE 1 — CHANNEL CORE (Semanas 1–3)

**Objetivo:** Infraestrutura de canal. Nenhuma UI visível ao usuário.

**Migrations (Banco A — Maestr.ia):**
```
migrations/099_channel_connections.sql
migrations/100_channel_credentials.sql
migrations/101_contact_channel_identities.sql
migrations/102_channel_events.sql
```

**Migrations (C8 Control):**
```
supabase/migrations/20260910000001_oauth_tokens_channel_fields.sql
```

**Edge Functions (Maestr.ia):**
```
supabase/functions/meta-webhook/index.ts          (novo — gateway central)
supabase/functions/channel-event-processor/index.ts  (novo — worker)
```

**Refatorar:**
```
src/components/settings/WhatsAppSection.tsx       ← remover exposição de access_token
src/types/settings.ts                             ← atualizar WhatsAppConfig
```

---

### FASE 2 — META MVP (Semanas 3–6)

**Objetivo:** Conectar Instagram e WhatsApp, receber e responder mensagens. Pronto para App Review.

**Edge Functions (Maestr.ia):**
```
supabase/functions/instagram-oauth/index.ts
supabase/functions/whatsapp-embedded-signup/index.ts
supabase/functions/send-channel-message/index.ts
supabase/functions/channel-disconnect/index.ts
```

**Frontend (C8 Control):**
```
src/pages/ChannelsPage.tsx                        (novo — hub de canais)
src/components/channels/InstagramConnect.tsx      (novo — UX §7 do spec)
src/components/channels/WhatsAppConnect.tsx       (novo — UX §9 do spec)
src/pages/OAuthCallbackPage.tsx                   ← ampliar para Instagram/WhatsApp
```

**n8n:**
```
n8n-workflows/meta-channel-events.json            (novo)
```

**Docs:**
```
docs/meta-setup.md                                (novo)
docs/meta-app-review.md                           (novo)
```

**Variáveis de ambiente (.env.example):**
```
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_INSTAGRAM_REDIRECT_URI=
META_WHATSAPP_CONFIG_ID=
META_WHATSAPP_REDIRECT_URI=
```

---

### FASE 3 — CONVERSAS (Semanas 5–8)

**Objetivo:** Inbox real para conversas com clientes finais.

**Migrations (Banco A):**
```
migrations/103_channel_conversations.sql
migrations/104_channel_messages.sql
```

**Frontend (C8 Control):**
```
src/pages/WhatsApp.tsx          ← reescrever: dados reais do Banco A
src/hooks/useInbox.ts           (novo — substitui useOmnichannelChat mock)
src/hooks/useChannelMessages.ts (novo)
```

**n8n:**
```
n8n-workflows/inbox-notifications.json  (novo)
```

---

### FASE 4 — AGENTE IA PADRÃO (Semanas 7–10)

**Objetivo:** Agente configurável sem conhecimento técnico.

**Migrations (Banco A):**
```
migrations/105_agent_configs.sql
migrations/106_knowledge_bases.sql        (+ habilitar pgvector no Banco A)
migrations/107_knowledge_chunks.sql
```

**Edge Functions (Maestr.ia):**
```
supabase/functions/agent-inference/index.ts
supabase/functions/knowledge-ingest/index.ts
supabase/functions/knowledge-retrieve/index.ts
```

**Frontend (C8 Control):**
```
src/pages/AgentConfigPage.tsx
src/pages/KnowledgeBasePage.tsx
src/components/agent/AgentPersonality.tsx
src/components/agent/AgentBehaviors.tsx
src/components/knowledge/DocumentUpload.tsx
```

**n8n:**
```
n8n-workflows/agent-tool-router.json  (novo)
```

---

### FASE 5 — INTEGRAÇÕES PERSONALIZADAS (Semanas 9–12)

**Objetivo:** Infraestrutura para integrações externas (serviço C8).

**Migrations (Banco A):**
```
migrations/108_custom_integrations.sql
migrations/109_custom_integration_logs.sql
```

**Edge Functions:**
```
supabase/functions/custom-integration-call/index.ts
```

**Frontend:**
```
src/pages/AdminIntegrationsPage.tsx           (restrito à C8)
src/components/admin/CustomIntegrationForm.tsx
src/pages/ClientIntegrationsPage.tsx          (view amigável para o cliente)
```

**n8n:**
```
n8n-workflows/custom-integration-template.json  (template base)
```

---

### FASE 6 — AUTOMATION ENGINE (Semanas 11–15)

**Migrations (Banco A):**
```
migrations/110_automations.sql
migrations/111_automation_nodes.sql
migrations/112_automation_runs.sql
migrations/113_channel_scheduled_jobs.sql
```

**Edge Functions:**
```
supabase/functions/automation-trigger-evaluator/index.ts
supabase/functions/automation-node-executor/index.ts
supabase/functions/automation-scheduler/index.ts   (pg_cron)
```

**n8n:**
```
n8n-workflows/automation-delay-processor.json  (cron de delays)
```

---

### FASE 7 — BUILDER VISUAL (Semanas 14–18)

- Avaliar `@xyflow/react` (React Flow v12) — compatível com Vite + Tailwind
- Nodes visuais com nomenclatura comercial (Gatilho, Mensagem, Condição, etc.)

---

### FASE 8 — TEMPLATES DE AUTOMAÇÃO

Templates prontos: Comentário → DM, Lead → Qualificação, Agendamento, Follow-up, Handoff.

---

### FASE 9 — IA PARA CRIAÇÃO DE AUTOMAÇÕES

Somente após motor e builder estáveis.

---

## H. RISCOS

| Risco | Nível | Mitigação |
|-------|-------|-----------|
| Meta App Review (2–8 semanas) | Alto | Iniciar processo imediatamente, em paralelo à Fase 1 |
| Mudanças de API da Meta | Médio | Documentar versões usadas (`v21.0+`), monitorar changelog |
| Token expiry sem renovação automática | Médio | Criar lógica de verificação + alerta de reconexão |
| Janela de 24h do WhatsApp | Médio | Controle desde o início; distinção templates x respostas |
| pgvector no Banco A | Técnico baixo | Banco A é Supabase gerenciado — pgvector disponível via `CREATE EXTENSION` |
| pg_cron para delays | Técnico médio | Disponível no Supabase; throughput suficiente para início; escalar se necessário |
| `WhatsAppSection` expõe token hoje | Ativo | Corrigir na Fase 1 (alta prioridade) |

---

## I. WORKFLOWS N8N — ESPECIFICAÇÕES

### I.1 `meta-channel-events.json` (Fase 2)

```
Webhook POST /webhook/meta-channel-events
  ↓
Validar HMAC (secret compartilhado com Edge Function channel-event-processor)
  ↓
Extrair { event_type, client_id, channel, contact_external_id,
          contact_display_name, message, channel_connection_id }
  ↓
Switch por event_type:
  ├── message.received
  │     → Supabase: upsert client_crm_contacts (por phone/external_id)
  │     → Supabase: upsert contact_channel_identities
  │     → Supabase: upsert channel_conversations
  │     → Supabase: insert channel_messages (com external_message_id para idempotência)
  │     → Supabase: verificar agent_configs.bot_active para o cliente
  │     │   ├── true → HTTP POST agent-inference Edge Function
  │     │   └── false → Notificar inbox (conversation.status = waiting_human)
  ├── comment.created
  │     → Supabase: registrar em channel_events
  │     → Verificar automações com trigger 'comment.created'
  └── mention.created
        → Supabase: registrar em channel_events

Payload de entrada (enviado por channel-event-processor):
{
  "event_type": "message.received",
  "client_id": "uuid",
  "organization_id": "uuid",
  "channel": "whatsapp",
  "channel_connection_id": "uuid",
  "contact_external_id": "5511999999999",
  "contact_display_name": "João Silva",
  "message": {
    "external_id": "wamid.xxx",
    "text": "Olá, gostaria de saber sobre os preços",
    "media": null,
    "timestamp": "2026-09-09T10:00:00Z"
  }
}
```

---

### I.2 `inbox-notifications.json` (Fase 3)

```
Webhook POST /webhook/inbox-notifications
  ↓
Switch por notification_type:
  ├── handoff_requested
  │     → Buscar usuários disponíveis da organização
  │     → Enviar notificação (WhatsApp ou push)
  │     → Supabase: update channel_conversations.status = 'waiting_human'
  ├── new_conversation_unassigned
  │     → Verificar automações com trigger 'message.received' para este cliente
  │     │   ├── tem automação → disparar automation-trigger-evaluator
  │     │   └── sem automação → notificar inbox geral
  └── sla_breach
        → Escalar para admin/owner
        → Supabase: registrar em audit_logs
```

---

### I.3 `agent-tool-router.json` (Fase 4)

```
Webhook POST /webhook/agent-tool-router
  ↓
Validar HMAC com secret compartilhado com Edge Function agent-inference
  ↓
Extrair { client_id, agent_id, conversation_id, contact_id, tool, arguments }
  ↓
Supabase GET: buscar custom_integration por (client_id, identifier = tool, status = 'active')
  ↓
Se não encontrado → Responder { success: false, error: { code: 'TOOL_NOT_FOUND' } }
  ↓
Montar payload para integração:
  {
    "organization_id": "...",
    "agent_id": "...",
    "conversation_id": "...",
    "contact_id": "...",
    "tool": "...",
    "arguments": {}
  }
  ↓
HTTP POST integration.webhook_url
  Header: Authorization: Bearer <integration.webhook_secret>
  Header: X-C8-Signature: HMAC-SHA256(payload, secret)
  Timeout: integration.timeout_ms
  ↓
Validar resposta: { success: boolean, result: any, message: string | null }
  ↓
Supabase INSERT custom_integration_logs (duração, status, input, output)
  ↓
Responder ao agent-inference: { success, result, error }
```

---

### I.4 `automation-delay-processor.json` (Fase 6)

```
Cron Trigger: a cada 1 minuto
  ↓
Supabase REST GET:
  SELECT * FROM channel_scheduled_jobs
  WHERE execute_at <= now() AND status = 'pending'
  ORDER BY execute_at LIMIT 50
  ↓
Loop para cada job:
  │
  ├── Supabase GET: channel_conversations.status para o job.conversation_id
  │     Se 'closed' ou automation_run.status = 'cancelled':
  │       → Supabase PATCH: job.status = 'cancelled', skip
  │
  ├── Switch job.action_type:
  │     ├── send_message → HTTP POST send-channel-message Edge Function
  │     ├── run_agent    → HTTP POST agent-inference Edge Function
  │     ├── create_deal  → Supabase POST client_crm_deals
  │     ├── add_tag      → Supabase PATCH client_crm_contacts
  │     └── close_automation → Supabase PATCH automation_runs.status = 'completed'
  │
  └── Supabase PATCH: job.status = 'executed', executed_at = now()
      Supabase PATCH: automation_run.current_node_id = next_node_id
  ↓
Log: { processed: N, failed: M, cancelled: K }
```

---

### I.5 `custom-integration-template.json` (Fase 5 — template por cliente)

```
Webhook POST /webhook/custom-integration-{client-slug}
  ↓
Code: Validar HMAC-SHA256
  Header: X-C8-Signature deve bater com HMAC(body, WEBHOOK_SECRET)
  ↓
Code: Extrair { client_id, agent_id, conversation_id, contact_id, tool, arguments }
  ↓
Switch tool:
  ├── consultar_cardapio
  │     → HTTP GET https://api.sistema-do-cliente.com/menu
  │         Params: { query: arguments.query, category: arguments.category }
  │     → Code: formatar resposta
  │     → Responder: { success: true, result: { items: [...] }, message: null }
  │
  ├── criar_pedido
  │     → HTTP POST https://api.sistema-do-cliente.com/orders
  │         Body: { items: arguments.items, contact_phone: arguments.contact_phone }
  │     → Code: verificar status HTTP 201
  │     → Responder: { success: true, result: { order_id: "..." } }
  │
  └── (outros tools específicos do cliente)

Error Handler Global:
  → Responder: {
      success: false,
      error: {
        code: "EXTERNAL_SERVICE_ERROR",
        message: "Mensagem de erro legível"
      }
    }
```

---

## J. VARIÁVEIS DE AMBIENTE A ADICIONAR

Atualizar `.env.example` do Maestr.ia:

```env
# Meta — Channel Gateway
META_APP_ID=                       # ID do App C8 Control no Meta
META_APP_SECRET=                   # Secret do App
META_VERIFY_TOKEN=                 # Token para verificação de webhook

# OAuth Redirects (configurar também no Meta App)
META_INSTAGRAM_REDIRECT_URI=       # ex: https://app.maestria.com.br/oauth/callback/instagram
META_WHATSAPP_CONFIG_ID=           # ID do Embedded Signup Config
META_WHATSAPP_REDIRECT_URI=        # ex: https://app.maestria.com.br/oauth/callback/whatsapp

# OpenAI — Agente IA e Embeddings
OPENAI_API_KEY=                    # já existe em generate-recruitment-form; unificar
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Encryption — Tokens de canal (nunca no frontend)
CREDENTIAL_ENCRYPTION_KEY=         # 32 bytes hex para AES-256-GCM

# Channel Gateway — interno
CHANNEL_GATEWAY_SECRET=            # secret HMAC entre meta-webhook e channel-event-processor
```

---

## PRÓXIMOS PASSOS (após aprovação desta auditoria)

1. Configurar Meta App externamente (seção F) — pode começar agora em paralelo
2. Iniciar **FASE 1 — Channel Core**: migrations 099–102 + refatorar WhatsAppSection
3. Habilitar pgvector no Banco A via `CREATE EXTENSION vector` (preparar para Fase 4)
4. Criar conta de teste Meta (Instagram Business + WhatsApp Business) para desenvolvimento

---

*Documento de FASE 0 — Auditoria. Atualizar ao iniciar cada fase.*
