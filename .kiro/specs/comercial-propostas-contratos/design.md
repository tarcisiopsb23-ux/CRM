# Documento de Design Técnico — Módulo Comercial (Propostas e Contratos)

## Visão Geral

O Módulo Comercial transforma a proposta da agência em uma **landing page comercial rastreável**, com aceite digital em um clique e geração automática de contrato. Toda a implementação é integrada ao CRM existente (clientes, pipeline, financeiro).

**Restrição fundamental:** não existe catálogo de serviços pré-cadastrado. Todos os serviços e valores são digitados diretamente em cada proposta.

---

## Arquitetura

```
Usuário da Agência (browser)
    ├── /comercial/propostas          → PropostasPage (listagem + filtros)
    ├── /comercial/propostas/nova     → PropostaEditorPage (criação)
    ├── /comercial/propostas/:id      → PropostaEditorPage (edição)
    ├── /comercial/propostas/:id/detalhes → PropostaDetalhesPage (analytics + ações)
    ├── /comercial/dashboard          → ComercialDashboardPage (KPIs + funil)
    ├── /comercial/configuracoes/contratos → ContractTemplatePage (gestão de templates)
    └── /clients/:clientId            → aba "Comercial" adicionada ao ContractDetailPage

Cliente (browser — sem autenticação)
    └── /proposta/:public_slug        → PropostaViewerPage (landing page pública)

Supabase
    ├── proposals                     ← dados principais da proposta
    ├── proposal_services             ← serviços digitados por proposta
    ├── proposal_sections             ← seções rich text com order/visibilidade
    ├── proposal_events               ← analytics / rastreamento de comportamento
    ├── proposal_acceptances          ← aceite digital (snapshot imutável)
    ├── proposal_audit_log            ← trilha de auditoria
    ├── contract_templates            ← templates com variáveis por organização
    └── contracts (existente)         ← gerado automaticamente após aceite

Edge Functions
    ├── proposal-track-event          ← recebe eventos da Proposal_Viewer (público)
    └── proposal-generate-contract    ← substitui variáveis + gera PDF no Storage
```

---

## Fluxo Principal

```
1. Agência cria proposta no Proposal_Editor
   → Seleciona cliente → preenche seções → adiciona serviços + valores → define cronograma
   → Salva como rascunho (public_slug gerado)

2. Agência envia proposta ao cliente
   → Status: rascunho → enviada
   → Timeline_CRM registra evento proposta_enviada

3. Cliente acessa /proposta/:slug
   → proposal-track-event registra visualizacao (IP, device, cidade)
   → Status: enviada → visualizada (na primeira visita)
   → Closer recebe notificação in-app

4. Cliente clica "Aprovar Proposta"
   → Modal: nome + CPF + checkbox aceite
   → Frontend chama proposal-track-event com action='aceite'
   → Backend: INSERT proposal_acceptances (snapshot + hash SHA-256)
   → Status: aprovada
   → proposal-generate-contract chamada automaticamente

5. proposal-generate-contract
   → Busca contract_template da organização (ou usa padrão)
   → Substitui variáveis pelos dados da proposta
   → Gera PDF → Supabase Storage → URL salva em contracts.pdf_url
   → INSERT contracts (vinculado a client_id + proposal_id)
   → Timeline_CRM registra contrato_gerado
```

---

## Modelos de Dados

### Migration 049 — Tabela `proposals`

```sql
-- migrations/049_proposals.sql
CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  closer_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,

  title           TEXT NOT NULL DEFAULT '',
  public_slug     TEXT NOT NULL UNIQUE,

  -- Hero
  hero_logo_url   TEXT,
  hero_title      TEXT NOT NULL DEFAULT '',
  hero_subtitle   TEXT,
  hero_message    TEXT,
  hero_video_url  TEXT,
  hero_image_url  TEXT,
  hero_whatsapp_text TEXT DEFAULT 'Falar no WhatsApp',
  hero_whatsapp_number TEXT,
  hero_cta_text   TEXT DEFAULT 'Aprovar Proposta',
  hero_cta_color  TEXT DEFAULT '#16a34a',

  -- Valores
  plan_value      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_individual NUMERIC(12,2) GENERATED ALWAYS AS (0) STORED, -- calculado no app

  -- Cronograma financeiro (jsonb)
  schedule        JSONB NOT NULL DEFAULT '{}',
  -- formato: { first_value, first_date, due_day, recurrence, installments, adjustments: [{month, value}] }

  -- Status e controle
  status          TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','enviada','visualizada','aprovada','recusada','expirada')),

  -- Analytics agregado (atualizado pela Edge Function)
  total_views     INTEGER NOT NULL DEFAULT 0,
  total_accesses  INTEGER NOT NULL DEFAULT 0,
  avg_session_secs INTEGER NOT NULL DEFAULT 0,
  first_accessed_at TIMESTAMPTZ,
  last_accessed_at  TIMESTAMPTZ,

  -- Auditoria
  tags            TEXT[] NOT NULL DEFAULT '{}',
  campaign_origin TEXT,
  lead_origin     TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_org ON proposals(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_proposals_client ON proposals(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_proposals_lead ON proposals(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_proposals_slug ON proposals(public_slug);
CREATE INDEX idx_proposals_status ON proposals(organization_id, status) WHERE deleted_at IS NULL;

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposals_org" ON proposals
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE TRIGGER update_proposals_updated
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Migration 050 — Tabela `proposal_services`

```sql
-- migrations/050_proposal_services.sql
CREATE TABLE proposal_services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name        TEXT NOT NULL CHECK (char_length(name) <= 120),
  description TEXT CHECK (char_length(description) <= 500),
  value       NUMERIC(12,2) NOT NULL CHECK (value >= 0.01 AND value <= 999999.99),
  is_bonus    BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_services_proposal ON proposal_services(proposal_id);
CREATE INDEX idx_proposal_services_org ON proposal_services(organization_id);

ALTER TABLE proposal_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_services_org" ON proposal_services
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
```

### Migration 051 — Tabela `proposal_sections`

```sql
-- migrations/051_proposal_sections.sql
-- Seções rich text da proposta (Apresentação, Diagnóstico, etc.)
CREATE TABLE proposal_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  section_key  TEXT NOT NULL,
  -- valores: apresentacao | diagnostico | objetivos | estrategia | solucao |
  --          escopo | cronograma | metodologia | diferenciais | cases |
  --          depoimentos | faq | garantias | consideracoes_finais

  title        TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',  -- HTML do rich text editor
  is_visible   BOOLEAN NOT NULL DEFAULT true,
  section_order INTEGER NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (proposal_id, section_key)
);

CREATE INDEX idx_proposal_sections_proposal ON proposal_sections(proposal_id);

ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_sections_org" ON proposal_sections
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE TRIGGER update_proposal_sections_updated
  BEFORE UPDATE ON proposal_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Migration 052 — Tabela `proposal_events`

```sql
-- migrations/052_proposal_events.sql
-- Analytics: eventos registrados pela Proposal_Viewer (via Edge Function pública)
CREATE TABLE proposal_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  event_type   TEXT NOT NULL,
  -- valores: visualizacao | scroll_parcial | scroll_completo |
  --          clique_whatsapp | clique_aprovar | aprovacao_confirmada

  session_id   TEXT NOT NULL,   -- UUID gerado no frontend por sessão
  ip           TEXT,
  city         TEXT,            -- null se geolocalização falhar
  device       TEXT,            -- mobile | desktop
  browser      TEXT,
  os           TEXT,
  user_agent   TEXT,

  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_events_proposal ON proposal_events(proposal_id);
CREATE INDEX idx_proposal_events_session ON proposal_events(proposal_id, session_id);
CREATE INDEX idx_proposal_events_org ON proposal_events(organization_id);
-- Sem RLS — inserção pública via Edge Function com service_role
-- Leitura protegida por RLS na organização
ALTER TABLE proposal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_events_read_org" ON proposal_events
  FOR SELECT
  USING (organization_id = get_user_organization_id());
-- INSERT via Edge Function (service_role bypass)
```

### Migration 053 — Tabela `proposal_acceptances`

```sql
-- migrations/053_proposal_acceptances.sql
CREATE TABLE proposal_acceptances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID NOT NULL REFERENCES proposals(id) ON DELETE RESTRICT,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

  approver_name     TEXT NOT NULL,
  approver_cpf      TEXT NOT NULL,  -- armazenado como digitado; mascarado na exibição
  ip_address        TEXT NOT NULL,
  user_agent        TEXT,
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  proposal_snapshot JSONB NOT NULL,  -- conteúdo completo da proposta no momento do aceite
  snapshot_hash     TEXT NOT NULL,   -- SHA-256 de proposal_snapshot serializado

  UNIQUE (proposal_id)  -- idempotência: apenas 1 aceite por proposta
);

CREATE INDEX idx_proposal_acceptances_org ON proposal_acceptances(organization_id);

ALTER TABLE proposal_acceptances ENABLE ROW LEVEL SECURITY;
-- Leitura apenas pela organização
CREATE POLICY "proposal_acceptances_read_org" ON proposal_acceptances
  FOR SELECT
  USING (organization_id = get_user_organization_id());
-- INSERT via Edge Function (service_role) — bloqueado para usuários normais
-- UPDATE e DELETE bloqueados para todos (imutabilidade)
CREATE POLICY "proposal_acceptances_no_update" ON proposal_acceptances
  FOR UPDATE USING (false);
CREATE POLICY "proposal_acceptances_no_delete" ON proposal_acceptances
  FOR DELETE USING (false);
```

### Migration 054 — Tabela `proposal_audit_log`

```sql
-- migrations/054_proposal_audit_log.sql
CREATE TABLE proposal_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proposal_id  UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id      UUID,            -- null para ações do sistema
  action       TEXT NOT NULL,
  -- valores: criacao | edicao | envio | aprovacao | contrato_gerado | exclusao

  metadata     JSONB,           -- contexto adicional (ex: canal de envio)
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_audit_org ON proposal_audit_log(organization_id, proposal_id);

ALTER TABLE proposal_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_audit_read_org" ON proposal_audit_log
  FOR SELECT
  USING (organization_id = get_user_organization_id());
```

### Migration 055 — Tabela `contract_templates`

```sql
-- migrations/055_contract_templates.sql
CREATE TABLE contract_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name            TEXT NOT NULL DEFAULT 'Template Padrão',
  content         TEXT NOT NULL DEFAULT '',  -- HTML com variáveis {{...}}
  is_default      BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contract_templates_default
  ON contract_templates(organization_id) WHERE is_default = true;

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contract_templates_org" ON contract_templates
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE TRIGGER update_contract_templates_updated
  BEFORE UPDATE ON contract_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Migration 056 — Coluna `proposal_id` em `contracts` + `contract_version`

```sql
-- migrations/056_contracts_proposal_fk.sql
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS contract_content TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_proposal ON contracts(proposal_id) WHERE proposal_id IS NOT NULL;
```

### Migration 057 — RPC pública `get_proposal_by_slug`

```sql
-- migrations/057_get_proposal_by_slug.sql
CREATE OR REPLACE FUNCTION get_proposal_by_slug(p_slug TEXT)
RETURNS TABLE (
  proposal_id     UUID,
  organization_id UUID,
  client_name     TEXT,
  title           TEXT,
  status          TEXT,
  hero_logo_url   TEXT,
  hero_title      TEXT,
  hero_subtitle   TEXT,
  hero_message    TEXT,
  hero_video_url  TEXT,
  hero_image_url  TEXT,
  hero_whatsapp_text TEXT,
  hero_whatsapp_number TEXT,
  hero_cta_text   TEXT,
  hero_cta_color  TEXT,
  plan_value      NUMERIC,
  schedule        JSONB
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    p.organization_id,
    c.name,
    p.title,
    p.status,
    p.hero_logo_url,
    p.hero_title,
    p.hero_subtitle,
    p.hero_message,
    p.hero_video_url,
    p.hero_image_url,
    p.hero_whatsapp_text,
    p.hero_whatsapp_number,
    p.hero_cta_text,
    p.hero_cta_color,
    p.plan_value,
    p.schedule
  FROM proposals p
  JOIN clients c ON c.id = p.client_id
  WHERE p.public_slug = p_slug
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_proposal_by_slug TO anon, authenticated;
```

> **Nota de segurança:** a Proposal_Viewer busca serviços e seções via chamadas autenticadas pela Edge Function `proposal-track-event` (usando service_role). Identificadores internos nunca aparecem na URL — apenas `public_slug`.

---

## Edge Functions

### `proposal-track-event`

Função pública (sem autenticação de usuário) que recebe eventos da Proposal_Viewer.

```
POST /proposal-track-event
Sem autenticação de usuário (acessível pelo cliente via browser)

Body:
{
  action: 'load' | 'scroll_50' | 'scroll_90' | 'click_whatsapp' | 'click_aprovar' | 'aceite',
  slug: string,
  session_id: string,          // UUID gerado no frontend, persistido em sessionStorage
  user_agent?: string,
  approver_name?: string,      // apenas para action='aceite'
  approver_cpf?: string,       // apenas para action='aceite'
  proposal_snapshot?: object   // apenas para action='aceite'
}

Fluxo para action='load':
  1. SELECT proposal_id + organization_id via get_proposal_by_slug(slug)
  2. Detectar IP do request (header x-forwarded-for)
  3. Geolocalizar IP → city (falha silenciosa)
  4. Parsear user_agent → device, browser, os
  5. INSERT proposal_events { event_type='visualizacao', session_id, ip, city, device, browser, os }
  6. UPDATE proposals SET total_accesses = total_accesses + 1, last_accessed_at = now()
     WHERE id = proposal_id
  7. Se first_accessed_at IS NULL: UPDATE SET first_accessed_at = now()
  8. Se status = 'enviada': UPDATE proposals SET status = 'visualizada'
     → notificação in-app para closer_id via Supabase Realtime

Fluxo para action em ('scroll_50','scroll_90','click_whatsapp','click_aprovar'):
  1. Mapear action → event_type
  2. INSERT proposal_events { event_type, session_id, ... }

Fluxo para action='aceite':
  1. Verificar se já existe registro em proposal_acceptances WHERE proposal_id — se sim, retornar 409
  2. Calcular snapshot_hash = SHA-256(JSON.stringify(proposal_snapshot))
  3. INSERT proposal_acceptances { proposal_id, organization_id, approver_name, approver_cpf,
       ip_address, user_agent, proposal_snapshot, snapshot_hash }
  4. UPDATE proposals SET status = 'aprovada'
  5. INSERT proposal_events { event_type='aprovacao_confirmada', session_id, ... }
  6. INSERT proposal_audit_log { action='aprovacao', proposal_id, organization_id }
  7. Chamar proposal-generate-contract { proposal_id }
  8. Retornar { success: true }
```

### `proposal-generate-contract`

Função interna (chamada pela `proposal-track-event` e pelo frontend da agência).

```
POST /proposal-generate-contract
Auth: service_role ou JWT do usuário da agência

Body: { proposal_id: string }

Fluxo:
  1. SELECT proposal + proposal_services + proposal_sections + client
  2. SELECT contract_templates WHERE organization_id AND is_default = true
     → se não encontrar, usar DEFAULT_CONTRACT_TEMPLATE (string constante no código)
     → se usar padrão, enfileirar notificação in-app "Personalize seu template"
  3. Substituir variáveis no template:
     {{cliente}}          → client.name
     {{empresa}}          → client.company ou client.name
     {{cnpj}}             → client.cnpj
     {{cpf}}              → proposal_acceptances.approver_cpf
     {{valor}}            → formatCurrency(proposal.plan_value)
     {{plano}}            → proposal.title
     {{servicos}}         → lista de serviços não-bônus formatada
     {{bonificacoes}}     → lista de serviços bônus formatada
     {{vencimento}}       → schedule.due_day
     {{primeiro_pagamento}} → formatDate(schedule.first_date)
     {{data}}             → formatDate(now())
     {{consultor}}        → profile do closer_id
     {{escopo}}           → conteúdo da seção 'escopo'
     {{cronograma}}       → conteúdo da seção 'cronograma'
  4. Gerar PDF a partir do HTML final (usando Puppeteer/html2pdf ou jsPDF via Edge)
  5. Upload PDF → Supabase Storage bucket 'contracts' → path: {org_id}/{contract_id}.pdf
  6. INSERT contracts {
       organization_id, client_id, proposal_id,
       title: proposal.title,
       value: proposal.plan_value,
       service_contracted: lista de serviços,
       contract_date: now(),
       status: 'ativo',
       contract_version: 1,
       contract_content: html_final,
       pdf_url: storage_url
     }
  7. INSERT proposal_audit_log { action='contrato_gerado', proposal_id }
  8. Timeline_CRM: INSERT client_timeline_events (se tabela existir, via trigger ou diretamente)
  9. Retornar { contract_id, pdf_url }
```

---

## Lógica de `public_slug` único

```typescript
// src/lib/proposalSlug.ts
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

export async function generateUniqueSlug(
  supabase: SupabaseClient,
  maxAttempts = 5
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const slug = nanoid();
    const { count } = await supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('public_slug', slug);
    if (count === 0) return slug;
  }
  throw new Error('Não foi possível gerar slug único após 5 tentativas');
}
```

---

## Lógica do Value_Comparison (pura — sem efeitos externos)

```typescript
// src/lib/proposalValueCalc.ts
export interface ProposalService {
  value: number;
  is_bonus: boolean;
}

export interface ValueComparison {
  totalIndividual: number;
  planValue: number;
  savings: number;
  savingsPercent: number;
}

export function calcValueComparison(
  services: ProposalService[],
  planValue: number
): ValueComparison {
  const totalIndividual = services.reduce((sum, s) => sum + s.value, 0);
  const savings = totalIndividual - planValue;
  const savingsPercent = totalIndividual > 0
    ? (savings / totalIndividual) * 100
    : 0;
  return { totalIndividual, planValue, savings, savingsPercent };
}
// P1: totalIndividual = soma(service.value), economia = totalIndividual - planValue
```

---

## Lógica do Financial_Schedule

```typescript
// src/lib/financialSchedule.ts
import { addMonths, addQuarters, addYears, format } from 'date-fns';

export interface ScheduleParams {
  firstValue: number;
  firstDate: string;        // 'yyyy-MM-dd'
  recurrence: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  installments: number;     // máx 360
  adjustments?: Record<number, number>; // { [installmentIndex]: value }
}

export interface ScheduleRow {
  installment: number;
  monthRef: string;
  value: number;
  dueDate: string;
}

export function generateSchedule(params: ScheduleParams): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const base = new Date(params.firstDate + 'T12:00:00');

  for (let i = 0; i < params.installments; i++) {
    let date: Date;
    if (params.recurrence === 'mensal')      date = addMonths(base, i);
    else if (params.recurrence === 'trimestral') date = addMonths(base, i * 3);
    else if (params.recurrence === 'semestral')  date = addMonths(base, i * 6);
    else                                     date = addYears(base, i);

    const value = params.adjustments?.[i] ?? params.firstValue;
    rows.push({
      installment: i + 1,
      monthRef: format(date, 'MM/yyyy'),
      value,
      dueDate: format(date, 'dd/MM/yyyy'),
    });
  }
  return rows;
}
// P4: rows.length === installments, rows[i].dueDate = firstDate + i intervals
```

---

## Componentes React

### Novos

| Componente | Caminho | Responsabilidade |
|---|---|---|
| `PropostasPage` | `src/pages/PropostasPage.tsx` | Listagem com filtros, indicadores, ações |
| `PropostaEditorPage` | `src/pages/PropostaEditorPage.tsx` | Editor visual completo (criação + edição) |
| `PropostaViewerPage` | `src/pages/PropostaViewerPage.tsx` | Landing page pública sem autenticação |
| `ComercialDashboardPage` | `src/pages/ComercialDashboardPage.tsx` | KPIs + funil + ranking Closers |
| `ContractTemplatePage` | `src/pages/ContractTemplatePage.tsx` | Gerenciar templates de contrato |
| `PropostaHeroEditor` | `src/components/propostas/PropostaHeroEditor.tsx` | Edição do bloco Hero |
| `PropostaSectionEditor` | `src/components/propostas/PropostaSectionEditor.tsx` | Seção rich text com toggle visibilidade |
| `PropostaServicosEditor` | `src/components/propostas/PropostaServicosEditor.tsx` | Adicionar/editar/remover serviços + flag bônus |
| `PropostaValueComparison` | `src/components/propostas/PropostaValueComparison.tsx` | Preview do Value_Comparison (editor + viewer) |
| `PropostaCronograma` | `src/components/propostas/PropostaCronograma.tsx` | Editor + tabela do Financial_Schedule |
| `PropostaAnalyticsPanel` | `src/components/propostas/PropostaAnalyticsPanel.tsx` | Painel de rastreamento no CRM |
| `PropostaAceiteModal` | `src/components/propostas/PropostaAceiteModal.tsx` | Modal de aceite digital (viewer público) |
| `PropostaEnvioModal` | `src/components/propostas/PropostaEnvioModal.tsx` | Modal de envio (WhatsApp / e-mail / link) |
| `PropostaAIModal` | `src/components/propostas/PropostaAIModal.tsx` | Pré-visualização do conteúdo gerado por IA |
| `ComercialClientTab` | `src/components/clients/ComercialClientTab.tsx` | Aba Comercial no cadastro do cliente |
| `ComercialFunil` | `src/components/comercial/ComercialFunil.tsx` | Gráfico de funil (recharts) |

### Modificados

| Componente | Modificação |
|---|---|
| `ContractDetailPage.tsx` | Adicionar aba "Comercial" renderizando `<ComercialClientTab />` |
| `LeadsKanbanPage.tsx` | Exibir botão "Criar Proposta" em cards na etapa `proposta_enviada`; contador de propostas ativas por coluna |
| `App.tsx` | Rotas públicas `/proposta/:slug` e privadas `/comercial/*` |
| `FinancialPage.tsx` | Nenhuma alteração necessária — contratos já existem |

---

## Hooks de Dados

```typescript
// src/hooks/useProposals.ts
export function useProposals(organizationId: string, filters?: ProposalFilters)
// query com filtros, paginação, indicadores de resumo
// mutations: createProposal, updateProposal, sendProposal, archiveProposal, deleteProposal (soft)

// src/hooks/useProposal.ts
export function useProposal(proposalId: string)
// query: proposal + services + sections + acceptances + audit_log
// mutations: upsertServices, upsertSection, updateHero, updateSchedule

// src/hooks/useProposalAnalytics.ts
export function useProposalAnalytics(proposalId: string)
// query: proposal_events agrupados por sessão, agregados

// src/hooks/useContractTemplates.ts
export function useContractTemplates(organizationId: string)
// query + createTemplate + updateTemplate + setDefault

// src/hooks/useComercialDashboard.ts
export function useComercialDashboard(organizationId: string, period: DateRange)
// query: KPIs, funil, ranking Closers, top engajamento — via RPC ou views

// src/hooks/useProposalAI.ts
export function useProposalAI()
// mutation: generateSection(context) → chama Edge Function com timeout 30s
```

---

## Rotas

```tsx
// src/App.tsx — adicionar às rotas existentes

// Rotas públicas (sem autenticação)
<Route path="/proposta/:slug" element={<PropostaViewerPage />} />

// Rotas privadas (dentro do layout autenticado)
<Route path="/comercial/propostas" element={<PropostasPage />} />
<Route path="/comercial/propostas/nova" element={<PropostaEditorPage />} />
<Route path="/comercial/propostas/:id" element={<PropostaEditorPage />} />
<Route path="/comercial/propostas/:id/detalhes" element={<PropostaDetalhesPage />} />
<Route path="/comercial/dashboard" element={<ComercialDashboardPage />} />
<Route path="/comercial/configuracoes/contratos" element={<ContractTemplatePage />} />
```

---

## Variáveis de Ambiente

```
# .env.example — adicionar
VITE_PROPOSAL_BASE_URL=https://app.c8.com.br   # base para montar o link público
# Formato do link: ${VITE_PROPOSAL_BASE_URL}/proposta/${public_slug}
```

---

## Propriedades de Corretude — Mapeamento de Implementação

| ID | Propriedade | Onde verificar |
|---|---|---|
| P1 | Value_Comparison invariante matemática | `src/lib/proposalValueCalc.ts` — puro, sem IO |
| P2 | `public_slug` único globalmente | `UNIQUE` constraint em `proposals.public_slug` + `generateUniqueSlug()` com retry |
| P3 | Snapshot de aceite imutável (hash SHA-256) | Políticas RLS em `proposal_acceptances` que bloqueiam UPDATE/DELETE; hash verificável recalculando do snapshot |
| P4 | Financial_Schedule determinístico | `src/lib/financialSchedule.ts` — puro, sem IO |
| P5 | Idempotência do aceite | `UNIQUE (proposal_id)` em `proposal_acceptances`; Edge Function verifica existência antes de inserir |
| P6 | Isolamento multi-tenant | RLS em todas as tabelas com `organization_id = get_user_organization_id()` |

---

## Notas de Implementação

- **Rich text editor:** usar `@tiptap/react` (já popular com shadcn) ou `react-quill` — verificar se já existe no projeto antes de adicionar dependência
- **PDF generation:** a Edge Function `proposal-generate-contract` deve usar `html-pdf-node` (Deno-compatible) ou `@sparticuz/chromium` para Puppeteer no Supabase Edge; alternativa mais simples: retornar o HTML renderizado e deixar o browser imprimir via `window.print()`
- **Geolocalização por IP:** usar `https://ip-api.com/json/{ip}` (gratuito, sem key) ou `ipinfo.io` — falha silenciosa, nunca bloqueia o registro do evento
- **Notificações in-app:** usar o sistema de notificações já existente no projeto, se houver; caso contrário, um canal Supabase Realtime no frontend é suficiente
- **Analytics em tempo real:** os contadores em `proposals` (total_views, total_accesses) são atualizados pela Edge Function com `UPDATE ... SET counter = counter + 1` — operação atômica, sem race condition
- **Template padrão de contrato:** definir como constante TypeScript no código da Edge Function `proposal-generate-contract`, cobrindo todas as variáveis; não requer tabela para o template padrão
