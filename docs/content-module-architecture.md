# Arquitetura — Módulo de Gestão de Conteúdo / Content Operations

> Documento de planejamento gerado após auditoria completa do Maestr.IA e do C8 Control.
> Última atualização: outubro 2026 — decisões finais incorporadas.

---

## 1. Contexto Arquitetural

### Fonte Única de Verdade

O Maestr.IA e o C8 Control **compartilham o mesmo projeto Supabase** (Banco A: `owwaulaenabbdalycusx`).
Não há duplicação de dados entre os sistemas — as mesmas tabelas são acessadas via RLS com contexto diferente:

- **Maestr.IA**: JWT de usuário interno da agência (`profiles`, `organization_id`)
- **C8 Control**: JWT de usuário do cliente (`dashboard_users`, `login_key = email::slug`)
- **C8 Parceiro**: JWT de parceiro/terceirizado (`partner_users`, `login_key = email::partner_slug`)

Para o módulo de conteúdo, **todas as tabelas ficam no Banco A**. O Banco B não é impactado.

```
                      Banco A (Supabase compartilhado)
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
    MAESTR.IA                 C8 CONTROL                C8 PARCEIRO
app.maestria.com.br       app.c8control.com.br    parceiro.c8control.com.br
        │                          │                          │
Operação interna total     Portal do cliente         Portal do terceirizado
Acesso completo ao         Aprova conteúdo           Só vê/executa os itens
módulo de conteúdo         Vê calendário             atribuídos a ele
                           Entregáveis + PDF
```

---

## 2. Decisões Arquiteturais Finais

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Armazenamento de mídia | n8n gerencia — Drive (imagens/docs) + Vimeo (vídeo) |
| 2 | Credenciais Drive/Vimeo | Ficam no n8n, não no código da plataforma |
| 3 | Bucket Supabase | Somente `content-staging` temporário, limpo após callback do n8n |
| 4 | Geração de PDF | Frontend puro via `iframe` + `window.print()` — igual ao `ContractViewer` |
| 5 | Versões de item | Snapshot imutável a cada envio para aprovação em `content_item_versions` |
| 6 | Portal parceiro | Build separado, repositório `C8 Parceiro`, domínio próprio |
| 7 | Auth parceiros | `partner_users` + `login_key = email::partner_slug` |
| 8 | Sincronização tarefas | Trigger bidirecional com flag anti-loop via `metadata` |
| 9 | Realtime | Supabase channel em `content_comments` e `content_assets` |
| 10 | Notificações | Somente in-app via tabela `notifications` existente |
| 11 | Briefings | Criados apenas pela agência; cliente só lê |
| 12 | Calendário | Individual por cliente + visão multi-cliente na agência |

---

## 3. Fluxo de Mídia via n8n

```
USUÁRIO faz upload (qualquer portal)
    │
    │  1. Arquivo → Edge Function content-upload-asset
    ↓
content-upload-asset
    │  2. Salva no bucket content-staging (temporário)
    │  3. Cria content_asset { status: 'processing' }
    │  4. Dispara webhook n8n { asset_id, file_url, file_type, client_id }
    ↓
N8N WORKFLOW
    ├─ file_type = video
    │      → Upload Vimeo API → configura privacy (embed only c8control.com.br)
    │      → retorna { vimeo_video_id, embed_url }
    │
    └─ file_type = imagem/doc/pdf
           → Move para pasta Google Drive do cliente
           → retorna { drive_file_id, drive_view_url, drive_embed_url }
    │
    │  5. Chama content-asset-callback com resultado
    ↓
content-asset-callback
    │  6. Atualiza content_asset { external_provider, external_id, embed_url, status: 'ready' }
    │  7. Remove arquivo do bucket staging
    │  8. Realtime channel: asset pronto
    ↓
USUÁRIO vê preview na tela
```

---

## 4. Geração de PDF (frontend puro)

Reutiliza exatamente o mecanismo do `ContractViewer`:

1. `ContentDeliverableViewer` monta HTML do relatório (entregáveis + itens publicados + totais)
2. `splitIntoPages()` divide em folhas A4 com cálculo de `offsetHeight` num `<iframe>` oculto
3. `buildIframeDocument()` injeta logo do cliente como timbrado em cada página
4. `win.print()` → diálogo do browser "Salvar como PDF"

Sem Edge Function, sem n8n, sem biblioteca externa.

---

## 5. Três Portais — Repositórios e Domínios

| Portal | Repositório | Domínio | Auth |
|--------|-------------|---------|------|
| Maestr.IA | `CRM` (existente) | Interno | `profiles` |
| C8 Control | `C8 Control` (existente) | `app.c8control.com.br` | `dashboard_users` |
| C8 Parceiro | **Novo** — `C8 Parceiro` | `parceiro.c8control.com.br` | `partner_users` |

O C8 Parceiro herda: Shadcn/UI + Tailwind dark, lib Supabase → Banco A, exibe exclusivamente o módulo de conteúdo filtrado para o parceiro logado.

---

## 6. O que Existe e Será Reutilizado

### Tabelas existentes

| Tabela | Como é usada |
|--------|-------------|
| `clients` | Vínculo do conteúdo com o cliente |
| `profiles` | Responsáveis internos (equipe agência) |
| `dashboard_users` | Usuários do cliente no C8 Control |
| `notifications` | Alertas com novos tipos de conteúdo |
| `drive_shares` | Links Google Drive por item |
| `tasks` | Espelho de visibilidade (via `task_id` + trigger) |
| `projects` | Agrupamento com `is_content_project` |

### Componentes frontend reutilizados

| Componente | Uso |
|------------|-----|
| `KanbanBoard/Column/Card` | Kanban de produção editorial |
| `calendar.tsx` | Calendário editorial |
| `Dialog`, `Sheet`, `Tabs`, `Table`, `Badge` | Primitivos Shadcn/UI |
| `PinAuthDialog` | Confirmação de publicação |
| `StubPage` | Placeholder em rollout gradual |
| `ModuleGuard` | Guard do módulo `content_ops` |
| `DriveFolderButton` | Link para pasta Drive do cliente |
| `ContractViewer` (lógica) | `splitIntoPages` + `buildIframeDocument` para PDF |
| `usePermissions`, `useOrganization`, `useClients`, `useProfiles` | Hooks existentes |
| `useN8nConfig` + `fireN8nWebhook` | Disparo de automações via n8n |

---

## 7. Novas Tabelas (Banco A)

### 7.1 `content_campaigns`
Agrupa itens de conteúdo para um período/objetivo.

```sql
content_campaigns (
  id              UUID PK,
  organization_id UUID FK → organizations,
  client_id       UUID FK → clients,
  title           TEXT NOT NULL,
  description     TEXT,
  objective       TEXT,   -- brand_awareness / lead_gen / engagement / retention / outro
  status          TEXT,   -- rascunho / ativa / concluida / arquivada
  start_date      DATE,
  end_date        DATE,
  metadata        JSONB DEFAULT '{}',
  created_by      UUID FK → profiles,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
```

### 7.2 `content_items`
Unidade central — um post, reels, story, e-mail, roteiro, arte, etc.

```sql
content_items (
  id                   UUID PK,
  organization_id      UUID FK → organizations,
  client_id            UUID FK → clients,
  campaign_id          UUID FK → content_campaigns (nullable),
  task_id              UUID FK → tasks (nullable),          -- espelho no módulo de Projetos

  -- Classificação
  content_type         TEXT,  -- post / reels / story / carousel / email / roteiro / banner / outro
  platform             TEXT,  -- instagram / facebook / linkedin / tiktok / google / email / outro
  format               TEXT,  -- feed / stories / reels / shorts / carrossel / single / video / texto

  -- Conteúdo
  title                TEXT NOT NULL,
  copy_text            TEXT,
  hashtags             TEXT[],
  description          TEXT,

  -- Workflow interno
  status               TEXT,  -- briefing / producao / revisao_interna / aguardando_aprovacao
                                --  / aprovado / reprovado / publicado / arquivado
  priority             TEXT,  -- baixa / media / alta / urgente
  assigned_to          UUID,                -- profiles.id OU partner_users.id
  assigned_to_type     TEXT DEFAULT 'agency', -- 'agency' | 'partner'
  reviewer_id          UUID FK → profiles,

  -- Datas
  production_deadline  DATE,
  scheduled_date       DATE,
  scheduled_time       TIME,
  published_at         TIMESTAMPTZ,

  -- Publicação
  publication_url      TEXT,
  publication_notes    TEXT,

  -- Aprovação do cliente
  approval_status      TEXT DEFAULT 'pendente', -- pendente / aprovado / reprovado / alteracao_solicitada
  approved_by          UUID FK → dashboard_users,
  approved_at          TIMESTAMPTZ,
  approval_notes       TEXT,

  -- Controle
  version              INTEGER DEFAULT 1,
  is_visible_to_client BOOLEAN DEFAULT false,
  metadata             JSONB DEFAULT '{}',
  created_by           UUID FK → profiles,
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ
)
```

### 7.3 `content_item_versions`
Snapshot imutável a cada envio para aprovação.

```sql
content_item_versions (
  id              UUID PK,
  content_item_id UUID FK → content_items ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  copy_text       TEXT,
  hashtags        TEXT[],
  description     TEXT,
  snapshot_data   JSONB,   -- snapshot completo do item
  created_by      UUID,
  created_at      TIMESTAMPTZ   -- sem updated_at; registro imutável
)
```

### 7.4 `content_assets`
Arquivos vinculados a um item de conteúdo, armazenados no Drive ou Vimeo.

```sql
content_assets (
  id                UUID PK,
  organization_id   UUID FK → organizations,
  content_item_id   UUID FK → content_items ON DELETE CASCADE,

  -- Arquivo
  file_name         TEXT NOT NULL,
  file_type         TEXT,  -- image / video / pdf / document / audio
  mime_type         TEXT,
  file_size         BIGINT,
  is_final          BOOLEAN DEFAULT false,
  version           INTEGER DEFAULT 1,

  -- Provedor externo (resolvido pelo n8n)
  external_provider TEXT,       -- 'google_drive' | 'vimeo' | 'youtube'
  external_id       TEXT,       -- drive_file_id ou vimeo_video_id
  embed_url         TEXT,       -- URL de embed (player Vimeo ou Docs Viewer)
  view_url          TEXT,       -- URL de visualização direta
  thumbnail_url     TEXT,

  -- Status do processamento assíncrono
  status            TEXT DEFAULT 'staging', -- staging / processing / ready / error
  error_message     TEXT,

  -- Uploader
  uploaded_by       UUID,
  uploader_type     TEXT,  -- 'agency' | 'client' | 'partner'

  created_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ
)
```

### 7.5 `content_comments`
Comentários e feedback (agência, cliente, parceiro) com Realtime.

```sql
content_comments (
  id              UUID PK,
  organization_id UUID FK → organizations,
  content_item_id UUID FK → content_items ON DELETE CASCADE,
  parent_id       UUID FK → content_comments (nullable),
  body            TEXT NOT NULL,
  author_id       UUID NOT NULL,
  author_type     TEXT NOT NULL,  -- 'agency' | 'client' | 'partner'
  author_name     TEXT,           -- snapshot do nome
  is_internal     BOOLEAN DEFAULT false,  -- apenas agência vê
  resolved        BOOLEAN DEFAULT false,
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
```

### 7.6 `content_briefs`
Briefing estruturado criado pela agência.

```sql
content_briefs (
  id              UUID PK,
  organization_id UUID FK → organizations,
  client_id       UUID FK → clients,
  campaign_id     UUID FK → content_campaigns (nullable),
  content_item_id UUID FK → content_items (nullable),

  title           TEXT NOT NULL,
  objective       TEXT,
  target_audience TEXT,
  key_messages    TEXT[],
  tone_of_voice   TEXT,
  references      TEXT[],
  restrictions    TEXT,
  deadline        DATE,
  notes           TEXT,
  status          TEXT,  -- rascunho / enviado / aceito / revisao
  client_tasks    JSONB DEFAULT '[]',  -- checklist de tarefas para o cliente

  created_by      UUID FK → profiles,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
```

### 7.7 `content_approval_history`
Registro imutável de todas as decisões de aprovação.

```sql
content_approval_history (
  id              UUID PK,
  organization_id UUID FK → organizations,
  content_item_id UUID FK → content_items ON DELETE CASCADE,
  decision        TEXT NOT NULL,  -- enviado_para_aprovacao / aprovado / reprovado
                                   --  / alteracao_solicitada / publicado
  decided_by      UUID NOT NULL,
  decider_type    TEXT NOT NULL,  -- 'agency' | 'client' | 'partner'
  decider_name    TEXT,
  notes           TEXT,
  version_number  INTEGER,
  created_at      TIMESTAMPTZ   -- sem UPDATE/DELETE
)
```

### 7.8 `content_deliverables`
Entregáveis formais ao final de um ciclo.

```sql
content_deliverables (
  id                   UUID PK,
  organization_id      UUID FK → organizations,
  client_id            UUID FK → clients,
  campaign_id          UUID FK → content_campaigns (nullable),

  title                TEXT NOT NULL,
  description          TEXT,
  period_start         DATE,
  period_end           DATE,
  items_count          INTEGER,
  reach_total          BIGINT,
  engagement_total     BIGINT,
  summary_notes        TEXT,
  is_visible_to_client BOOLEAN DEFAULT true,

  created_by           UUID FK → profiles,
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ
)
```

### 7.9 `partner_users`
Terceirizados com acesso restrito ao módulo de conteúdo.

```sql
partner_users (
  id              UUID PK,
  organization_id UUID FK → organizations,
  login_key       TEXT UNIQUE,   -- email::partner_slug
  real_email      TEXT NOT NULL,
  full_name       TEXT,
  partner_slug    TEXT NOT NULL,
  auth_user_id    UUID UNIQUE FK → auth.users ON DELETE SET NULL,
  specialty       TEXT,          -- designer / videomaker / copywriter / fotógrafo / outro
  active          BOOLEAN DEFAULT true,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
```

---

## 8. Alterações em Tabelas Existentes

| Tabela | Alteração |
|--------|-----------|
| `tasks` | `ADD COLUMN content_item_id UUID FK → content_items` |
| `projects` | `ADD COLUMN is_content_project BOOLEAN DEFAULT false` |
| `notifications.type` | Novos valores: `content_item_sent_for_approval`, `content_item_approved`, `content_item_rejected`, `content_brief_sent`, `content_deliverable_available` |
| `clients.modules_config` (JSONB) | Novo campo documentado: `content_ops_enabled: boolean` |

---

## 9. Novas RPCs

| RPC | Propósito |
|-----|-----------|
| `get_content_calendar(p_organization_id, p_client_id?, p_start, p_end)` | Calendário editorial — `client_id` opcional para visão multi-cliente |
| `get_content_items_for_client(p_client_id, p_status?)` | Itens visíveis ao cliente no C8 Control |
| `get_content_items_for_partner(p_partner_user_id)` | Itens atribuídos ao parceiro |
| `approve_content_item(p_item_id, p_decision, p_notes)` | Registra decisão, atualiza item, insere histórico, cria notificação |
| `send_content_item_for_approval(p_item_id)` | Cria versão snapshot, muda status, seta `is_visible_to_client = true` |
| `mark_content_item_published(p_item_id, p_url, p_published_at)` | Finaliza item como publicado |
| `get_content_dashboard_summary(p_organization_id, p_client_id?)` | Totais por status, atrasados, pendentes |

---

## 10. Novas Rotas

### Maestr.IA
```
/content                    → ContentIndexPage
/content/planejamento       → ContentPlanejamentoPage (calendário multi-cliente)
/content/campanhas          → ContentCampanhasPage
/content/campanhas/:id      → ContentCampanhaDetailPage
/content/itens              → ContentItensPage (kanban + lista + calendário por cliente)
/content/itens/novo         → ContentItemFormPage
/content/itens/:id          → ContentItemDetailPage
/content/briefing           → ContentBriefingPage
/content/briefing/:id       → ContentBriefDetailPage
/content/entregaveis        → ContentEntregaveisPage
```

### C8 Control
```
/:slug/conteudo             → ContentPortalIndexPage
/:slug/conteudo/calendario  → ContentCalendarPage
/:slug/conteudo/aprovacoes  → ContentApprovalsPage
/:slug/conteudo/aprovacoes/:id → ContentApprovalDetailPage
/:slug/conteudo/briefings   → ContentBriefingsPage
/:slug/conteudo/briefings/:id  → ContentBriefDetailPage
/:slug/conteudo/entregaveis → ContentDeliverablesPage
```

### C8 Parceiro (build separado)
```
/                           → redirect /login
/login                      → PartnerLoginPage
/:partner_slug              → PartnerDashboardPage
/:partner_slug/itens        → PartnerItensPage
/:partner_slug/itens/:id    → PartnerItemDetailPage
/:partner_slug/calendario   → PartnerCalendarPage
```

---

## 11. Novas Edge Functions

| Função | Propósito |
|--------|-----------|
| `content-upload-asset` | Arquivo → staging bucket → webhook n8n → `content_asset { status: processing }` |
| `content-asset-callback` | Chamada pelo n8n → atualiza asset com `external_id`, `embed_url`, `status: ready` → Realtime |
| `content-approve` | Aprovação/reprovação pelo cliente ou parceiro — SECURITY DEFINER |
| `partner-dashboard-auth` | Login do portal parceiro — resolve `partner_users` via `login_key` |

---

## 12. Novos Componentes

### Maestr.IA — `src/components/content/`
`ContentItemCard`, `ContentItemForm`, `ContentItemDetail`, `ContentKanbanBoard`, `ContentCalendar`, `ContentCalendarDay`, `ContentAssetUploader`, `ContentAssetGallery`, `ContentCommentThread`, `ContentApprovalBadge`, `ContentApprovalHistoryLog`, `ContentStatusSelect`, `ContentPlatformBadge`, `ContentSendApprovalButton`, `ContentMarkPublishedDialog`, `ContentCampaignCard`, `ContentBriefForm`, `ContentDeliverableViewer` (PDF)

### C8 Control — `src/components/content/`
`ClientContentCard`, `ClientApprovalPanel`, `ClientCommentInput`, `ClientContentCalendar`, `ClientBriefingView`, `ClientDeliverableView`

### C8 Parceiro — `src/components/` (build separado)
`PartnerItemCard`, `PartnerItemDetail`, `PartnerUploadPanel`, `PartnerCommentInput`, `PartnerCalendar`

---

## 13. Alterações em Arquivos Existentes

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/usePermissions.ts` | `{ id: "content_ops", label: "Gestão de Conteúdo" }` no array `MODULES` |
| `src/App.tsx` (CRM) | Rotas `/content/*` com `ModuleGuard` |
| Sidebar do Maestr.IA | Grupo "Conteúdo" na navegação |
| `C8 Control/src/contexts/ClientAuthContext.tsx` | `content_ops_enabled?: boolean` em `ModulesConfig` |
| `C8 Control/src/pages/public-dashboard/PublicDashboardLayout.tsx` | Guard `/conteudo` |
| `C8 Control/src/pages/public-dashboard/PublicDashboardSidebar.tsx` | Grupo "Conteúdo" |
| `C8 Control/src/App.tsx` | Rotas `/:slug/conteudo/*` |

---

## 14. Fases de Rollout

| Fase | Conteúdo | Sistema |
|------|----------|---------|
| **1** | Migrations 118–124 | Banco A |
| **2** | Hooks + componentes + rotas + sidebar | Maestr.IA |
| **3** | Upload → n8n → Drive/Vimeo → callback → Realtime | Maestr.IA + Edge Functions |
| **4** | Fluxo de aprovação + versões + histórico | Maestr.IA |
| **5** | Portal do cliente: aprovações, calendário, briefings, entregáveis + PDF | C8 Control |
| **6** | Portal parceiro: build separado, auth, itens atribuídos, upload | C8 Parceiro |
| **7** | Sincronização com módulo de Tarefas/Projetos (triggers) | Maestr.IA + Banco A |
| **8** | Performance, Meta Insights, sugestões IA | Futuro |

---

## 15. Checklist de Implementação

### Banco de Dados
- [ ] Migration 118 — tabelas core + RLS
- [ ] Migration 119 — briefs + comentários
- [ ] Migration 120 — partner_users
- [ ] Migration 121 — sincronização tasks/projects
- [ ] Migration 122 — RPCs
- [ ] Migration 123 — notification types
- [ ] Migration 124 — permission_module enum
- [ ] Banco B **não alterado**

### Maestr.IA
- [ ] Hooks de CRUD (5 hooks)
- [ ] Componentes `src/components/content/`
- [ ] Rotas e sidebar
- [ ] `content_ops` em `usePermissions.ts`

### C8 Control
- [ ] `content_ops_enabled` em `ModulesConfig`
- [ ] Guard + sidebar + rotas
- [ ] Componentes do portal
- [ ] Hook `useClientContent`

### Edge Functions
- [ ] `content-upload-asset`
- [ ] `content-asset-callback`
- [ ] `content-approve`
- [ ] `partner-dashboard-auth`

### C8 Parceiro
- [ ] Scaffold do projeto
- [ ] Auth + `partner_users`
- [ ] Telas de conteúdo

### Qualidade
- [ ] RLS: agência não vê outra organização
- [ ] RLS: cliente vê só `is_visible_to_client = true`
- [ ] RLS: `is_internal = true` não vaza para cliente/parceiro
- [ ] `content_approval_history` sem UPDATE/DELETE


---

## 16. Status de Implementação (atualizado outubro 2026)

### Concluído — Fase 1: Banco de Dados
- [x] Migration 118 — tabelas core (6 tabelas) com RLS completa
- [x] Migration 119 — content_briefs + content_comments com Realtime
- [x] Migration 120 — partner_users + RLS para parceiros em todas as tabelas
- [x] Migration 121 — tasks.content_item_id + projects.is_content_project + 4 triggers bidirecionais com anti-loop
- [x] Migration 122 — 7 RPCs SECURITY DEFINER
- [x] Migration 123 — 5 novos tipos em notifications (suporta enum e TEXT)
- [x] Migration 124 — content_ops no enum permission_module
- [x] Banco B **não alterado** ✓

### Concluído — Fase 1: Edge Functions
- [x] `content-upload-asset` — upload → staging → webhook n8n
- [x] `content-asset-callback` — n8n callback → atualiza asset + Realtime broadcast
- [x] `content-approve` — aprovação SECURITY DEFINER via RPC
- [x] `partner-dashboard-auth` — login do portal parceiro

### Concluído — Fase 2: Maestr.IA
- [x] 5 hooks: useContentItems, useContentCampaigns, useContentComments (Realtime), useContentBriefs, useContentDeliverables
- [x] 8 componentes em `src/components/content/`
- [x] 6 páginas em `src/pages/content/`
- [x] Sidebar com grupo "Conteúdo" (5 subitens com ícone ImagePlay)
- [x] usePermissions.ts com módulo content_ops e 6 rotas mapeadas
- [x] App.tsx com 6 rotas lazy registradas
- [x] TypeScript: zero erros ✓

### Concluído — Fase 4: C8 Control
- [x] content_ops_enabled em ModulesConfig (ClientAuthContext.tsx)
- [x] Guard de rota em PublicDashboardLayout.tsx
- [x] Grupo "Conteúdo" na PublicDashboardSidebar.tsx (5 itens)
- [x] Rotas /:slug/conteudo/* em App.tsx (5 rotas)
- [x] Hook useClientContent (items, calendar, briefs, deliverables, comments, approve)
- [x] 5 componentes em `src/components/content/`
- [x] 5 páginas em `src/pages/public-dashboard/content/`
- [x] TypeScript: zero erros ✓

### Concluído — Fase 6: C8 Parceiro (novo repositório)
- [x] Scaffold completo em `c:\automacoes\C8 Parceiro`
- [x] PartnerAuthContext com sessionStorage
- [x] PartnerLoginPage
- [x] PartnerDashboardPage
- [x] PartnerItemDetailPage (conteúdo + upload + comentários)
- [x] PartnerCalendarPage

### Pendente — Fase 3: Fluxo de Mídia (n8n)
- [ ] Workflow n8n para upload de imagens/docs para Google Drive
- [ ] Workflow n8n para upload de vídeos para Vimeo
- [ ] ContentAssetUploader component (Maestr.IA)
- [ ] ContentAssetGallery component (Maestr.IA)
- [ ] Bucket `content-staging` criado no Supabase Storage

### Pendente — Fase 7: Sincronização com Projetos (frontend)
- [ ] Link "Ver no módulo de Conteúdo" na ProjectDetailsPage
- [ ] Badge de conteúdo nas tasks da ProjectDetailsPage
- [ ] Checkbox `is_content_project` no formulário de criação de projeto

### Pendente — Fase 8: PDF de Entregável
- [ ] ContentDeliverableViewer com splitIntoPages (padrão ContractViewer)
- [ ] Botão "Gerar PDF" na ContentEntregaveisPage e ContentDeliverablesPage

### Pendente — Fase 5: C8 Parceiro (instalação e infra)
- [ ] npm install no repositório C8 Parceiro
- [ ] tailwind.config.ts e tsconfig.json
- [ ] Shadcn/UI primitivos copiados ou instalados
- [ ] .env configurado com URL e anon key do Banco A
- [ ] Deploy em parceiro.c8control.com.br
