# Implementation Plan: public-dashboard-ia-content

## Overview

Evolução do Dashboard Público de uma página monolítica para um sistema multi-rota com sidebar colapsável e módulo completo de Conteúdo IA. A implementação segue a ordem: banco de dados → infraestrutura → layout → páginas de resultados (migração) → páginas CRUD → CRM admin → testes.

## Tasks

- [x] 1. Migration CRM — adicionar colunas IA na tabela clients e atualizar RPC get_client_by_slug
  - Criar `migrations/027_add_ia_content_fields_to_clients.sql` com `ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_supabase_url TEXT, ADD COLUMN IF NOT EXISTS client_supabase_anon_key TEXT, ADD COLUMN IF NOT EXISTS show_ia_content BOOLEAN NOT NULL DEFAULT false` e os respectivos COMMENTs
  - Criar `supabase/migrations/00068_get_client_by_slug_with_ia_fields.sql` que faz DROP e recria a função `get_client_by_slug` retornando também `show_ia_content`, `client_supabase_url` e `client_supabase_anon_key` lidos diretamente das colunas da tabela `clients` (SECURITY DEFINER, mantendo todos os campos existentes)
  - **Requirements:** 14.1, 14.2, 14.3

- [x] 2. Migration SQL para o Client_Supabase — 6 tabelas do módulo Conteúdo IA
  - Criar `migrations/client_supabase_ia_content_migration.sql` com `CREATE TABLE IF NOT EXISTS` para as 6 tabelas: `ai_schedule` (id uuid pk, artist text not null, date date not null, time time not null, description text, status text default 'active' check in ('active','inactive'), created_at timestamptz), `ai_promotions` (id, title not null, description, validity, type, status, created_at), `ai_suggestions` (id, name not null, description, price numeric(10,2), image_url, status, created_at), `ai_events` (id, title not null, description, date not null, time, location, created_at), `ai_notices` (id, message not null, priority text not null check in ('alta','média','baixa'), validity, status, created_at), `ai_settings` (id, establishment_name, phone, instagram, address, opening_hours, welcome_message, auto_reply_24h boolean default true, forward_to_human boolean default true, created_at, updated_at)
  - Adicionar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` para todas as 6 tabelas e criar políticas `public_read` (SELECT USING true) e `public_write` (ALL USING true WITH CHECK true) via bloco `DO $$ ... $$`
  - **Requirements:** 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8

- [x] 3. Infraestrutura — createClientSupabase, ClientAuthContext, useClientAuth, useDynamicClient
  - Criar `src/lib/createClientSupabase.ts` com a função `createClientSupabase(url, key): SupabaseClient` usando cache em `Map<string, SupabaseClient>` por chave `url::key`, com `persistSession: false` e `autoRefreshToken: false`
  - Criar `src/contexts/ClientAuthContext.tsx` com a interface `ClientAuth` (campos: id, organization_id, name, company, favicon_url, authenticated: true, show_ia_content, client_supabase_url, client_supabase_anon_key, metadata.dashboard_performance, metadata.dashboard_atendimento), o `ClientAuthContext`, e o `ClientAuthProvider` que lê/escreve localStorage com chave `client_auth_${slug}` e expõe `setAuth` e `logout`
  - Criar `src/hooks/useClientAuth.ts` que consome `ClientAuthContext` e lança erro se usado fora do provider
  - Criar `src/hooks/useDynamicClient.ts` que usa `useClientAuth` e retorna `createClientSupabase(url, key)` ou `null` quando `client_supabase_url` ou `client_supabase_anon_key` estiverem ausentes
  - **Requirements:** 5.1, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4

- [x] 4. Componentes compartilhados do dashboard público
  - Criar `src/pages/public-dashboard/components/PageHeader.tsx` — título da página + slot para botão de ação primária
  - Criar `src/pages/public-dashboard/components/StatusBadge.tsx` — badge visual para status `active` (verde) / `inactive` (cinza)
  - Criar `src/pages/public-dashboard/components/CredentialsErrorState.tsx` — estado de erro com ícone `AlertCircle`, título "Credenciais não configuradas" e mensagem orientando o admin a configurar as credenciais no CRM
  - Criar `src/pages/public-dashboard/components/DeleteConfirmDialog.tsx` — dialog de confirmação de exclusão reutilizável com props `open`, `onConfirm`, `onCancel` e `itemName`
  - **Requirements:** 6.3, 7.8, 8.7, 9.7, 10.6, 11.8, 12.5

- [x] 5. PublicDashboardSidebar — sidebar colapsável com grupos condicionais
  - Criar `src/pages/public-dashboard/PublicDashboardSidebar.tsx` usando o componente shadcn `Sidebar` com `collapsible="icon"` e tema dark (`bg-[#0F172A]`, `border-slate-800`)
  - Implementar `SidebarHeader` com favicon do cliente (`auth?.favicon_url ?? "/favicon.png"`) e nome da empresa (visível apenas quando expandido)
  - Implementar grupo "Resultados" com itens: Dashboard Geral (`LayoutDashboard`), Performance (`BarChart3`), Atendimento (`MessageCircle`) — usando `Link` do react-router-dom e `isActive` baseado em `useLocation`
  - Implementar grupo "Conteúdo IA" (renderizado condicionalmente quando `auth?.show_ia_content === true`) com itens: Agenda Musical (`Music2`), Promoções (`Tag`), Sugestões da Semana (`UtensilsCrossed`), Eventos Especiais (`CalendarDays`), Avisos (`Megaphone`), Configurações (`Settings`)
  - Implementar `SidebarFooter` com indicador de sessão animado (ping verde) e nome do cliente (visível quando expandido) / ponto verde (quando colapsado)
  - **Requirements:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7

- [x] 6. PublicDashboardHeader — header com PeriodDropdown via useSearchParams e menu de perfil
  - Criar `src/pages/public-dashboard/PublicDashboardHeader.tsx` com `SidebarTrigger` e área de ações à direita
  - Implementar `PeriodDropdown` usando `useSearchParams` para persistir `from` e `to` na URL — exibido apenas nas rotas `/public/dashboard/:slug`, `/public/dashboard/:slug/performance` e `/public/dashboard/:slug/atendimento`; extrair o componente `PeriodDropdown` do `PublicDashboardPage.tsx` existente mantendo todos os presets
  - Implementar menu de perfil (DropdownMenu) com: avatar com inicial do nome, nome e empresa do cliente, item "Alterar Senha" (abre dialog), item "Encerrar Sessão" (chama `logout()`)
  - Implementar `ChangePasswordDialog` inline no header — ao salvar, atualiza `clients.metadata.dashboard_password` via `supabase.from("clients").update(...)` usando o `slug` para identificar o cliente
  - **Requirements:** 15.3, 15.4
  - **Depends on:** 3, 5

- [x] 7. PublicDashboardLayout — layout principal com auth guard, IA guard e auto-logout
  - Criar `src/pages/public-dashboard/PublicDashboardLayout.tsx` com dois componentes: `PublicDashboardLayout` (verifica localStorage e instancia `ClientAuthProvider`) e `PublicDashboardLayoutInner` (contém toda a lógica)
  - Implementar guard de autenticação: se `localStorage.getItem('client_auth_${slug}')` for null, redirecionar para `/public/dashboard/${slug}/login` com `<Navigate replace />`
  - Implementar guard de rota IA: se a rota atual termina com `/agenda`, `/promocoes`, `/sugestoes`, `/eventos`, `/avisos` ou `/configuracoes` e `auth.show_ia_content` for false, redirecionar para `/public/dashboard/${slug}`
  - Implementar re-fetch de dados frescos ao montar: chamar `supabase.rpc('get_client_by_slug', { p_slug: slug })` e atualizar `setAuth` com os campos `show_ia_content`, `client_supabase_url`, `client_supabase_anon_key`, `favicon_url` e `metadata` mais recentes
  - Implementar auto-logout por inatividade (30 min): timer resetado em `mousedown`, `mousemove`, `keypress`, `scroll`, `touchstart`
  - Renderizar `SidebarProvider > PublicDashboardSidebar + SidebarInset > PublicDashboardHeader + main > Outlet`
  - **Requirements:** 1.1, 1.8, 2.2, 2.3, 15.3
  - **Depends on:** 3, 5, 6

- [x] 8. Atualização do PublicDashboardLoginPage — novos campos no ClientAuth
  - Atualizar o tipo `DashboardClientRow` para incluir `show_ia_content: boolean`, `client_supabase_url: string | null`, `client_supabase_anon_key: string | null`
  - Atualizar a função `completeLogin` para incluir `show_ia_content`, `client_supabase_url` e `client_supabase_anon_key` no objeto salvo em `localStorage.setItem('client_auth_${slug}', ...)`
  - Atualizar `handleFirstAccess` para re-buscar via RPC após troca de senha e chamar `completeLogin` com os novos campos
  - **Requirements:** 5.1, 5.2, 5.3
  - **Depends on:** 1, 3

- [x] 9. Atualização do App.tsx — nova estrutura de rotas com layout e rotas filhas
  - Adicionar imports dos novos componentes de página: `PublicDashboardLayout`, `DashboardGeralPage`, `PerformancePage`, `AtendimentoPage`, e as páginas IA com `React.lazy`
  - Substituir `<Route path="/public/dashboard/:slug" element={<PublicDashboardPage />} />` pela estrutura aninhada com `PublicDashboardLayout` e rotas filhas: `index` (DashboardGeralPage), `performance`, `atendimento`, `agenda`, `promocoes`, `sugestoes`, `eventos`, `avisos`, `configuracoes`
  - Manter a rota `/public/dashboard/:slug/login` fora do layout (sem alteração)
  - Envolver as rotas IA com `<Suspense fallback={...}>` para suportar lazy loading
  - **Requirements:** 2.1, 2.4
  - **Depends on:** 7

- [x] 10. PerformancePage — migração do conteúdo de performance do PublicDashboardPage
  - Criar `src/pages/public-dashboard/PerformancePage.tsx` com toda a lógica e JSX da aba "performance" do `PublicDashboardPage.tsx` atual: métricas de anúncios (6 cards MetricCard), evolução diária (AreaChart), funil de conversão (ModernFunnel), top campanhas (tabela com modal de detalhes), observações estratégicas (InsightItem), indicadores de negócio (KPI cards), evolução de longo prazo (BarChart), impacto da parceria (HorizontalScroll), tabela comparativa de performance, consolidado mensal
  - Substituir leitura de `clientData` por `useClientAuth()` e leitura de `dateRange` por `useSearchParams()` (parâmetros `from` e `to` com defaults de 30 dias)
  - Manter todas as funções auxiliares: `aggregateCampaigns`, `isLowerBetter`, `KPI_COLORS`, `MetricCard`, `InsightItem`, `InfoTooltip`
  - Manter as queries React Query existentes: `public_client_kpis`, `public_client_kpi_history`, `useClientReports`
  - **Requirements:** 15.1, 15.4
  - **Depends on:** 3, 6

- [x] 11. AtendimentoPage — migração do conteúdo de atendimento do PublicDashboardPage
  - Criar `src/pages/public-dashboard/AtendimentoPage.tsx` com o conteúdo da seção `AtendimentoSection` do `PublicDashboardPage.tsx` atual: título "Automação de Conversas" com ícone `MessageCircle`, componente `ConversationKpiDashboard`
  - Substituir leitura de `clientData` por `useClientAuth()` e leitura de `dateRange` por `useSearchParams()`
  - Usar o hook `useClientConversationKpis` com `organizationId` e `clientId` vindos do `useClientAuth()`
  - **Requirements:** 15.2
  - **Depends on:** 3, 6

- [x] 12. DashboardGeralPage — visão consolidada com KPIs, IA counts e feed
  - Criar `src/pages/public-dashboard/DashboardGeralPage.tsx` com cards de resumo: campanhas ativas no período (count de `campaign_data` via CRM Supabase), total de leads (soma de `leads`), faturamento e ROAS (de `client_kpis`)
  - Implementar cards de contagem de itens IA ativos (condicionais a `show_ia_content = true`) usando `useQueries` com 5 queries paralelas ao Dynamic_Client: count de `ai_schedule`, `ai_promotions`, `ai_suggestions`, `ai_events`, `ai_notices` com status `active`
  - Implementar gráfico de barras de atividade semanal (últimos 7 dias) com dados de `campaign_data` via CRM Supabase usando `BarChart` do recharts
  - Implementar card "Próximo Evento" (condicional a `show_ia_content = true`): busca `ai_schedule` com `status = 'active'` e `date >= today`, ordena por data, exibe artista, data e horário do primeiro resultado
  - Implementar seção de avisos de alta prioridade (condicional a `show_ia_content = true`): busca `ai_notices` com `status = 'active'` e `priority = 'alta'`, exibe em destaque vermelho
  - Implementar feed de atividade recente e estados vazios informativos quando dados não disponíveis
  - **Requirements:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 15.5
  - **Depends on:** 3, 4

- [x] 13. AgendaPage — CRUD completo de agenda musical via Dynamic_Client
  - Criar `src/pages/public-dashboard/AgendaPage.tsx` com guard `if (!dc) return <CredentialsErrorState />`, query `useQuery(['ai_schedule'])` ordenada por `date` ascending, e listagem em tabela com colunas: artista, data, horário, descrição, status (StatusBadge), ações (editar, excluir, toggle status)
  - Implementar `createMutation` (insert), `updateMutation` (update por id), `deleteMutation` (delete por id) e `toggleStatusMutation` (update `status` para `'active'` ou `'inactive'`) — todos com `onSuccess: invalidateQueries(['ai_schedule'])` e `onError: toast.error`
  - Implementar dialog de formulário (criar/editar) com campos: artista (obrigatório), data (obrigatório, input type="date"), horário (obrigatório, input type="time"), descrição (textarea), status inicial (Switch) — validação client-side antes de submeter
  - Implementar `DeleteConfirmDialog` para exclusão com confirmação e estados vazio/loading
  - **Requirements:** 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
  - **Depends on:** 3, 4

- [x] 14. PromocoesPage — CRUD completo de promoções via Dynamic_Client
  - Criar `src/pages/public-dashboard/PromocoesPage.tsx` com guard de credenciais, query `useQuery(['ai_promotions'])`, e listagem com colunas: título, descrição, validade, tipo, status (StatusBadge), ações
  - Implementar mutations: create, update, delete e toggleStatus para `ai_promotions` — com invalidação de query e toasts
  - Implementar dialog de formulário com campos: título (obrigatório), descrição, validade, tipo, status inicial (Switch)
  - Implementar `DeleteConfirmDialog` e estados vazio/loading
  - **Requirements:** 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
  - **Depends on:** 3, 4

- [x] 15. SugestoesPage — CRUD completo de sugestões da semana via Dynamic_Client
  - Criar `src/pages/public-dashboard/SugestoesPage.tsx` com guard de credenciais, query `useQuery(['ai_suggestions'])`, e listagem com colunas: nome, descrição, preço (formatado em R$), status (StatusBadge), ações
  - Implementar mutations: create, update, delete e toggleStatus para `ai_suggestions` — com invalidação de query e toasts
  - Implementar dialog de formulário com campos: nome (obrigatório), descrição, preço (input numérico, nullable), URL de imagem, status inicial (Switch)
  - Implementar `DeleteConfirmDialog` e estados vazio/loading
  - **Requirements:** 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
  - **Depends on:** 3, 4

- [x] 16. EventosPage — CRUD completo de eventos especiais via Dynamic_Client
  - Criar `src/pages/public-dashboard/EventosPage.tsx` com guard de credenciais, query `useQuery(['ai_events'])` ordenada por `date` ascending, e listagem com colunas: título, descrição, data, horário, localização, ações (sem toggle de status)
  - Implementar mutations: create, update, delete para `ai_events` — com invalidação de query e toasts
  - Implementar dialog de formulário com campos: título (obrigatório), descrição, data (obrigatório, input type="date"), horário (input type="time"), localização
  - Implementar `DeleteConfirmDialog` e estados vazio/loading
  - **Requirements:** 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
  - **Depends on:** 3, 4

- [x] 17. AvisosPage — CRUD completo de avisos com diferenciação visual por prioridade
  - Criar `src/pages/public-dashboard/AvisosPage.tsx` com guard de credenciais, query `useQuery(['ai_notices'])`, e listagem com diferenciação visual por prioridade: alta (borda e fundo vermelho `border-l-4 border-red-500 bg-red-500/10`), média (amarelo), baixa (cinza)
  - Implementar colunas da listagem: mensagem, prioridade (badge colorido), validade, status (StatusBadge), ações (editar, excluir, toggle status)
  - Implementar mutations: create, update, delete e toggleStatus para `ai_notices` — com invalidação de query e toasts
  - Implementar dialog de formulário com campos: mensagem (obrigatório, textarea), prioridade (obrigatório, Select com opções alta/média/baixa), validade, status inicial (Switch)
  - Implementar `DeleteConfirmDialog` e estados vazio/loading
  - **Requirements:** 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
  - **Depends on:** 3, 4

- [x] 18. ConfiguracoesPage — configurações do agente IA com padrão upsert
  - Criar `src/pages/public-dashboard/ConfiguracoesPage.tsx` com guard de credenciais, query `useQuery(['ai_settings'])` usando `.maybeSingle()` para carregar o registro existente (ou null)
  - Implementar formulário com campos editáveis: nome do estabelecimento, telefone, Instagram, endereço, horário de funcionamento, mensagem de boas-vindas — usando `react-hook-form` com `useEffect` para sincronizar quando dados chegam
  - Implementar toggles (Switch): resposta automática 24h (`auto_reply_24h`) e encaminhar para humano (`forward_to_human`)
  - Implementar `saveMutation` com upsert: se `settings?.id` existir, inclui o id no payload (update); senão, omite (insert) — `onSuccess: toast.success('Configurações salvas com sucesso!')`, `onError: toast.error`
  - **Requirements:** 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
  - **Depends on:** 3, 4

- [x] 19. ClientIntegrationsTab — seção Conteúdo IA com credenciais, teste e SQL de migration
  - Adicionar novos estados locais em `ClientIntegrationsTab.tsx`: `showIaContent`, `clientSupabaseUrl`, `clientSupabaseKey`, `testingConnection`, `migrationSqlCopied`
  - Atualizar o `useEffect` de `fetchClient` para carregar os novos campos: `setShowIaContent(!!(data as any).show_ia_content)`, `setClientSupabaseUrl((data as any).client_supabase_url || "")`, `setClientSupabaseKey((data as any).client_supabase_anon_key || "")`
  - Adicionar validação no `handleSaveDashboard`: se `showIaContent && (!clientSupabaseUrl.trim() || !clientSupabaseKey.trim())`, exibir `toast.error` e retornar sem salvar
  - Atualizar `handleSaveDashboard` para persistir `show_ia_content`, `client_supabase_url` e `client_supabase_anon_key` na tabela `clients` via `supabase.from("clients").update(...).eq("id", clientId)`
  - Implementar seção "Conteúdo IA" no JSX: toggle `show_ia_content` (botão estilo card igual aos módulos existentes), campo `client_supabase_url` (Input), campo `client_supabase_anon_key` (Input type="password"), botão "Testar Conexão" que chama `createClientSupabase` e tenta `.from('ai_settings').select('id').limit(1)` exibindo toast de sucesso ou erro
  - Implementar exibição do Migration SQL em bloco `<details>` colapsável com `<pre>` e botão de cópia usando `navigator.clipboard.writeText` — o SQL completo das 6 tabelas conforme o design
  - **Requirements:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 14.4
  - **Depends on:** 1, 3

- [ ] 20. Testes de propriedade com fast-check
  - Criar `src/lib/__tests__/createClientSupabase.property.test.ts` — Propriedade 1: mesma `url+key` sempre retorna a mesma instância (cache); `url+key` diferentes retornam instâncias distintas
  - Criar `src/contexts/__tests__/ClientAuthContext.property.test.ts` — Propriedade 2: `ClientAuth` sobrevive a roundtrip JSON (serialização/deserialização sem perda de dados) usando `fc.record` com todos os campos da interface
  - Criar `src/pages/public-dashboard/__tests__/routeGuard.property.test.ts` — Propriedade 3: rota IA com `show_ia_content=false` sempre redireciona; rota IA com `true` nunca redireciona; rota não-IA nunca redireciona pelo guard IA
  - Criar `src/pages/public-dashboard/__tests__/crudInvariants.property.test.ts` — Propriedade 4: inserção aumenta lista em +1; exclusão diminui em -1; toggle inverte status do alvo sem afetar outros itens
  - Criar `src/pages/public-dashboard/__tests__/formValidation.property.test.ts` — Propriedade 5: formulário de agenda inválido quando campo obrigatório vazio; válido quando todos preenchidos
  - Criar `src/pages/public-dashboard/__tests__/credentialsValidation.property.test.ts` — Propriedade 6: `show_ia_content=true` com credenciais vazias sempre falha na validação; `show_ia_content=false` sempre passa independente das credenciais
  - **Requirements:** 6.1, 5.1, 5.3, 2.3, 7.1, 8.1, 9.1, 10.1, 11.1, 4.3
  - **Depends on:** 3

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3"] },
    { "wave": 3, "tasks": ["4", "5", "8", "20"] },
    { "wave": 4, "tasks": ["6"] },
    { "wave": 5, "tasks": ["7"] },
    { "wave": 6, "tasks": ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"] }
  ]
}
```

## Notes

- O `PublicDashboardPage.tsx` original deve ser mantido durante a implementação das tasks 10 e 11 e removido apenas após a task 9 (App.tsx routing) estar completa e validada
- A pasta `Novo Public Dashboard/` serve apenas como referência de UI/UX e deve ser descartada após a implementação
- Nenhuma dependência nova precisa ser instalada — todas as bibliotecas necessárias já estão no `package.json`
- O campo `client_supabase_anon_key` deve ser exibido como `type="password"` no `ClientIntegrationsTab` para evitar exposição acidental
- As queries do Dynamic_Client devem usar `staleTime: 60_000` (1 minuto) para reduzir chamadas repetidas
