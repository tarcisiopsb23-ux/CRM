# Tasks — Consolidação Public Dashboard + C8 Control

> Status: **CONCLUÍDO** — Todas as tarefas foram implementadas.
> Última verificação: junho 2026

---

## Fase 1 — Fundação

- [x] **T-1.1** Atualizar `PublicDashboardLoginPage.tsx` com formulário email + senha
  - Implementado: formulário com email + senha, rate limiting client-side (5 tentativas / 15 min), fluxo de recuperação de senha, fallback direto ao Banco B quando Edge Function indisponível.

- [x] **T-1.2** Atualizar `ClientAuthContext.tsx` para armazenar JWT do Banco B
  - Implementado: contexto armazena `Session` completa (access_token + refresh_token), `DynamicUser` com role, client_id, metadata. `anon_key` armazenada apenas em `sessionStorage` durante a sessão, nunca no código.

- [x] **T-1.3** Criar `useDynamicAuth.ts` com lógica de login, logout e persistência de sessão
  - Implementado: `signIn`, `signOut`, `resetPassword`, `onAuthStateChange`, rate limiting.

- [x] **T-1.4** Atualizar `useDynamicClient.ts` para incluir JWT no header de autorização
  - Implementado: injeta JWT via `client.auth.setSession()`, isolamento por tenant, retorna `null` sem credenciais.

- [x] **T-1.5** Criar `migrations/034_bank_b_crm_schema.sql` com todas as tabelas e RLS
  - Implementado: `crm_contacts`, `crm_deals`, `crm_products`, `crm_pipeline_stages`, `crm_users`, `crm_whatsapp_sessions`, `ai_settings`, `ai_reminders`, `schema_migrations`. RLS habilitado em todas as tabelas.

- [x] **T-1.6** Criar script de seed para estágios padrão do pipeline no Banco B
  - Implementado: seed condicional em `bank_b_full_schema.sql` com 5 estágios padrão (`__pending__` como client_id temporário).

- [x] **T-1.7** Atualizar `PublicDashboardLayout.tsx` com guards de role por rota
  - Implementado: guards por rota verificam role do `ClientAuthContext`, redirecionam para `/login` se não autenticado, bloqueiam `viewer` em rotas de configuração.

- [x] **T-1.8** Implementar rate limiting na Edge Function de autenticação
  - Implementado: Edge Function `client-dashboard-auth` aplica rate limiting por IP (status 429); cliente também aplica rate limiting local por `sessionStorage`.

---

## Fase 2 — Novos Módulos

- [x] **T-2.1** Criar `useCrmContacts.ts` com operações CRUD e busca
  - Implementado: CRUD completo, busca com debounce, paginação, filtros por tags e fonte.

- [x] **T-2.2** Criar `CrmPage.tsx` com lista, busca, filtros e importação CSV
  - Implementado: lista de contatos, busca em tempo real, importação CSV com mapeamento de colunas, painel lateral de detalhes, paginação.

- [x] **T-2.3** Criar `useCrmDeals.ts` com CRUD e cálculo de valor
  - Implementado: CRUD de negociações com cálculo de valor total por estágio.

- [x] **T-2.4** Criar `useCrmPipeline.ts` com gerenciamento de estágios
  - Implementado: CRUD de estágios, reordenação, cores.

- [x] **T-2.5** Criar `CrmPipelinePage.tsx` com kanban drag-and-drop
  - Implementado: colunas por `crm_pipeline_stages`, drag-and-drop atualiza `stage_id`, totalizador por coluna, criação/edição de estágios restrita a `admin`/`owner`.

- [x] **T-2.6** Criar `useCrmProducts.ts` com CRUD
  - Implementado: CRUD de produtos com toggle ativo/inativo.

- [x] **T-2.7** Criar `CrmProdutosPage.tsx` com lista e formulário
  - Implementado: lista, formulário, toggle ativo/inativo, busca por nome, preço em R$.

- [x] **T-2.8** Criar `useWhatsAppSession.ts` para status e controle de sessão
  - Implementado: status da sessão, geração de QR Code, controle de conexão via Evolution API.

- [x] **T-2.9** Criar `WhatsAppPage.tsx` com QR code, status e toggle do bot
  - Implementado: status de conexão, QR Code com timer, toggle bot (`ai_settings.bot_active`), importação de contatos, contagem de conversas.

- [x] **T-2.10** Criar `useAiReminders.ts` com CRUD de lembretes
  - Implementado: CRUD completo, filtros por status e data, destaque para lembretes vencidos.

- [x] **T-2.11** Atualizar `DashboardGeralPage.tsx` com card de lembretes e cards condicionais
  - Implementado: card de Lembretes Rápidos (Banco B, condicional), cards CRM condicionais (contatos recentes + receita estimada de `crm_deals` won).

- [x] **T-2.12** Atualizar `PublicDashboardSidebar.tsx` com novos itens de menu e toggle do bot
  - Implementado: grupos CRM (Clientes, Pipeline, Produtos), WhatsApp, IA, Configurações com subitens; bot toggle no footer condicional a `show_ia_content`.

- [x] **T-2.13** Registrar novas rotas de CRM e WhatsApp em `App.tsx`
  - Implementado: `/crm`, `/crm/clientes`, `/crm/pipeline`, `/crm/produtos`, `/whatsapp` registradas dentro do `PublicDashboardLayout`.

---

## Fase 3 — Enriquecimento

- [x] **T-3.1** Criar `migrations/035_campaign_demographics.sql` no Banco A
  - Implementado: tabela `campaign_demographics` com índices, RLS e políticas autenticadas. Complementada pela `040_campaign_demographics_heatmap.sql`.

- [x] **T-3.2** Criar `useCampaignDemographics.ts` para leitura dos dados demográficos
  - Implementado: lê `campaign_demographics` do Banco A, agrega por gênero, dispositivo, faixa etária, plataforma, localização e heatmap hora×dia.

- [x] **T-3.3** Atualizar `PerformancePage.tsx` com aba "Audiência" e 6 visualizações
  - Implementado: aba "Audiência" condicional a `demographics_enabled`. Todas as 6 visualizações presentes:
    1. Heatmap de eficiência hora × dia da semana (`HeatmapChart`)
    2. Distribuição por faixa etária (barras horizontais)
    3. Distribuição por gênero (donut/pie)
    4. Top cidades/estados (tabela ranqueada)
    5. Performance por plataforma (barras empilhadas)
    6. Distribuição por dispositivo (donut/pie)

- [x] **T-3.4** Criar `migrations/034_meta_google_ad_accounts.sql` no Banco A
  - Implementado: tabelas `meta_ad_accounts` e `google_ad_accounts` com tokens OAuth, RLS, RPCs seguras (`get_ad_account_status`, `upsert_meta_ad_account`, `upsert_google_ad_account`).

- [x] **T-3.5** Criar Edge Function para fluxo OAuth Meta Ads
  - Implementado: `supabase/functions/oauth-meta-ads/index.ts` — endpoints `/authorize` e `/callback`, troca de code por token, armazenamento no Banco A com `owned_by = 'client'`.

- [x] **T-3.6** Criar Edge Function para fluxo OAuth Google Ads
  - Implementado: `supabase/functions/oauth-google-ads/index.ts` — endpoints `/authorize` e `/callback`, refresh token, armazenamento no Banco A.

- [x] **T-3.7** Criar `useAdAccounts.ts` para status de conexão
  - Implementado: lê status de Meta Ads e Google Ads do Banco A via RPC `get_ad_account_status`, nunca expõe tokens.

- [x] **T-3.8** Atualizar `C8TenantDetail.tsx` com interface de `modules_config`
  - Implementado: aba "Configurações" no `C8TenantDetail` com toggles para todos os módulos (`crm_enabled`, `whatsapp_enabled`, `ia_enabled`, `demographics_enabled`, `asaas_enabled`, dashboards geral/performance/atendimento), limites numéricos, pixels e credenciais do Banco B.

- [x] **T-3.9** Implementar leitura de `modules_config` na inicialização do dashboard
  - Implementado: `PublicDashboardLayout` lê `modules_config` de `crm_client_plans` via `get_client_by_slug` RPC e armazena em `ClientAuthContext`; sidebar e páginas ocultas conforme módulos desabilitados.

---

## Fase 4 — Configurações

- [x] **T-4.1** Criar `ConfigUsuariosPage.tsx` com lista, convite e gestão de roles
  - Implementado: lista de `crm_users` do Banco B, convite por email+role, alteração de role, remoção com confirmação, limite `max_users` respeitado (botão desabilitado com tooltip), acesso restrito a `owner`/`admin`.

- [x] **T-4.2** Criar `ConfigPagamentosPage.tsx` com métodos e integração Asaas
  - Implementado: toggles PIX/Boleto/Cartão, seção Asaas condicional a `asaas_enabled`, chave Asaas armazenada via RPC `save_asaas_settings` (nunca retornada), restrito ao role `owner`.

- [x] **T-4.3** Criar `ConfigIntegracoesPage.tsx` com pixels, UTM Builder e OAuth
  - Implementado: Meta Pixel ID, Google Tag ID, UTM Builder (6 campos + URL gerada + botão copiar + botão testar), botões OAuth Meta/Google Ads com status de conexão.

- [x] **T-4.4** Atualizar `ConfiguracoesPage.tsx` existente com campos de integração
  - Implementado: `ConfiguracoesPage` serve como hub de navegação para subpáginas, exibindo resumo de configurações do agente IA.

- [x] **T-4.5** Registrar novas rotas de configurações em `App.tsx`
  - Implementado: `/configuracoes/usuarios`, `/configuracoes/pagamentos`, `/configuracoes/integracoes` registradas dentro do `PublicDashboardLayout`.

- [x] **T-4.6** Implementar injeção dinâmica de Meta Pixel e Google Tag com base em `ai_settings`
  - Implementado: hook `usePixelInjection` em `PublicDashboardLayout.tsx` lê `ai_settings.meta_pixel_id` e `ai_settings.google_tag_id` do Banco B e injeta/remove os scripts dinamicamente no `document.head`. Limpeza automática ao desmontar (logout).

---

## Resumo

| Fase | Tarefas | Concluídas |
|------|---------|-----------|
| Fase 1 — Fundação | 8 | 8 ✅ |
| Fase 2 — Novos Módulos | 13 | 13 ✅ |
| Fase 3 — Enriquecimento | 9 | 9 ✅ |
| Fase 4 — Configurações | 6 | 6 ✅ |
| **Total** | **36** | **36 ✅** |
