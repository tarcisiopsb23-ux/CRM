# Implementation Plan: Módulo Comercial (Propostas e Contratos)

## Overview

Implementar o Módulo Comercial integrado ao CRM existente: criação de propostas visuais com serviços e valores digitados na hora, envio como landing page pública, rastreamento de comportamento do cliente, aceite digital com snapshot imutável e geração automática de contrato por template.

## Tasks

- [x] 1. Migrations do banco de dados (049–057)
  - [x] 1.1 Criar migration 049 — CREATE TABLE proposals
    - Criar tabela com colunas: id, organization_id, client_id, lead_id, closer_id, title, public_slug (UNIQUE), hero_* (logo, title, subtitle, message, video_url, image_url, whatsapp_text, whatsapp_number, cta_text, cta_color), plan_value, schedule (jsonb), status (CHECK), total_views, total_accesses, avg_session_secs, first/last_accessed_at, tags, campaign_origin, lead_origin, deleted_at, created_at, updated_at
    - RLS via `get_user_organization_id()` — padrão do projeto
    - Trigger `update_updated_at_column` (função já existente)
    - Índices em (organization_id WHERE deleted_at IS NULL), (client_id), (lead_id), (public_slug), (organization_id, status)
    - _Requisitos: 2.12, 2.14, 12.1, 12.2, 12.5_

  - [x] 1.2 Criar migration 050 — CREATE TABLE proposal_services
    - Criar tabela com colunas: id, proposal_id (FK CASCADE), organization_id, name (CHECK ≤120), description (CHECK ≤500), value (CHECK 0.01–999999.99), is_bonus, sort_order, created_at
    - RLS via `get_user_organization_id()`
    - _Requisitos: 2.5, 2.6, 12.1_

  - [x] 1.3 Criar migration 051 — CREATE TABLE proposal_sections
    - Criar tabela com colunas: id, proposal_id (FK CASCADE), organization_id, section_key (TEXT), title, content, is_visible (DEFAULT true), section_order, created_at, updated_at
    - UNIQUE (proposal_id, section_key)
    - RLS via `get_user_organization_id()`
    - Trigger `update_updated_at_column`
    - _Requisitos: 2.4, 3.2, 12.1_

  - [x] 1.4 Criar migration 052 — CREATE TABLE proposal_events
    - Criar tabela com colunas: id, proposal_id (FK CASCADE), organization_id, event_type (TEXT), session_id, ip, city, device, browser, os, user_agent, occurred_at
    - RLS: SELECT protegido por `get_user_organization_id()`; INSERT aberto (via Edge Function service_role)
    - Índices em (proposal_id), (proposal_id, session_id), (organization_id)
    - _Requisitos: 4.1, 4.2, 4.6, 12.1_

  - [x] 1.5 Criar migration 053 — CREATE TABLE proposal_acceptances
    - Criar tabela com colunas: id, proposal_id (FK RESTRICT, UNIQUE), organization_id (FK RESTRICT), approver_name, approver_cpf, ip_address, user_agent, accepted_at, proposal_snapshot (jsonb), snapshot_hash (TEXT)
    - RLS: SELECT pela organização; policy FOR UPDATE USING (false); policy FOR DELETE USING (false)
    - _Requisitos: 5.2, 5.8, 12.1, 12.7_

  - [x] 1.6 Criar migration 054 — CREATE TABLE proposal_audit_log
    - Criar tabela com colunas: id, organization_id, proposal_id (FK CASCADE), user_id, action (TEXT), metadata (jsonb), occurred_at
    - RLS: SELECT pela organização
    - _Requisitos: 12.4_

  - [x] 1.7 Criar migration 055 — CREATE TABLE contract_templates
    - Criar tabela com colunas: id, organization_id, name, content (TEXT — HTML com variáveis), is_default (BOOLEAN)
    - UNIQUE INDEX parcial em (organization_id) WHERE is_default = true
    - RLS via `get_user_organization_id()`
    - Trigger `update_updated_at_column`
    - _Requisitos: 7.1, 7.2_

  - [x] 1.8 Criar migration 056 — ALTER TABLE contracts + ADD COLUMNs
    - Adicionar: proposal_id (UUID FK SET NULL), contract_version (INTEGER DEFAULT 1), contract_content (TEXT), pdf_url (TEXT)
    - Índice em contracts(proposal_id)
    - _Requisitos: 7.3, 7.4, 7.7_

  - [x] 1.9 Criar migration 057 — RPC pública `get_proposal_by_slug`
    - Função SECURITY DEFINER retornando: proposal_id, organization_id, client_name, title, status, hero_*, plan_value, schedule
    - GRANT EXECUTE TO anon, authenticated
    - Não expor client_id ou organization_id como identificadores navegáveis
    - _Requisitos: 3.1, 3.5, 12.3_

- [x] 2. Utilitários e tipos base
  - [x] 2.1 Criar src/lib/proposalValueCalc.ts
    - Exportar `calcValueComparison(services, planValue)` — função pura
    - Calcular: totalIndividual = soma(service.value para todos), savings = totalIndividual − planValue, savingsPercent = (savings / totalIndividual) × 100
    - Exportar tipos `ProposalService` e `ValueComparison`
    - _Requisitos: 2.7, 2.8 | P1_

  - [x] 2.2 Criar src/lib/financialSchedule.ts
    - Exportar `generateSchedule(params)` — função pura
    - Suportar recorrências: mensal, trimestral, semestral, anual
    - Aplicar adjustments por índice de parcela
    - Exportar tipos `ScheduleParams` e `ScheduleRow`
    - _Requisitos: 2.9, 2.10 | P4_

  - [x] 2.3 Criar src/lib/proposalSlug.ts
    - Exportar `generateUniqueSlug(supabase, maxAttempts=5)` usando `nanoid` (alphabet: a-z0-9, tamanho 10)
    - Retry com verificação de unicidade via SELECT COUNT no banco
    - _Requisitos: 2.14 | P2_

  - [x] 2.4 Criar src/types/proposals.ts
    - Exportar tipos TypeScript: `Proposal`, `ProposalService`, `ProposalSection`, `ProposalEvent`, `ProposalAcceptance`, `ContractTemplate`, `ProposalStatus`, `EventType`, `SectionKey`
    - _Requisitos: 2.1 (base para toda a feature)_

  - [x] 2.5 Adicionar `VITE_PROPOSAL_BASE_URL` em .env.example
    - Documentar que é a base para montar o link público: `${VITE_PROPOSAL_BASE_URL}/proposta/${slug}`
    - _Requisitos: 9.1_

- [x] 3. Hooks de dados
  - [x] 3.1 Criar src/hooks/useProposals.ts
    - Query: `proposals` com filtros (status, closer_id, período, tags, campaign_origin) usando lógica AND
    - Calcular indicadores de resumo: total, enviadas, aprovadas, taxa de aprovação, valor total aprovado
    - Mutations: `createProposal` (gera slug + INSERT), `updateProposal`, `sendProposal` (UPDATE status + INSERT audit_log), `archiveProposal`, `deleteProposal` (soft delete: deleted_at = now())
    - _Requisitos: 1.2, 1.3, 1.4, 9.2, 12.4, 12.5_

  - [x] 3.2 Criar src/hooks/useProposal.ts
    - Query: proposta única com proposal_services + proposal_sections + proposal_acceptances
    - Mutations: `upsertServices` (lista completa de serviços), `upsertSection` (por section_key), `updateHero`, `updateSchedule`, `updateStatus`
    - _Requisitos: 2.1–2.14_

  - [x] 3.3 Criar src/hooks/useProposalAnalytics.ts
    - Query: `proposal_events` agrupados por session_id com total de visualizações, acessos, tempo médio de sessão, último acesso, dispositivo mais usado, lista dos últimos 50 acessos
    - _Requisitos: 4.3, 4.4_

  - [x] 3.4 Criar src/hooks/useContractTemplates.ts
    - Query: `contract_templates` da organização
    - Mutations: `createTemplate`, `updateTemplate`, `setDefault` (UPDATE is_default)
    - _Requisitos: 7.1, 7.2_

  - [x] 3.5 Criar src/hooks/useComercialDashboard.ts
    - Query: KPIs por período (criadas, enviadas, aprovadas, taxa conversão, valor total, tempo médio aprovação), ranking Closers, dados do funil, top 10 engajamento
    - Usar RPC ou view materializada — definir conforme complexidade da query
    - _Requisitos: 11.1–11.6_

  - [x] 3.6 Criar src/hooks/useProposalAI.ts
    - Mutation: `generateSection(context)` — chama Edge Function `proposal-ai-generate` com timeout de 30s
    - Retornar estado: loading, result, error
    - _Requisitos: 10.1–10.6_

- [x] 4. Edge Functions
  - [x] 4.1 Criar supabase/functions/proposal-track-event/index.ts
    - Aceitar POST sem autenticação de usuário (público)
    - Action `'load'`: resolver slug → proposal_id, detectar IP, geolocalizar (falha silenciosa), parsear user_agent, INSERT proposal_events, UPDATE proposals (total_accesses++, last_accessed_at, first_accessed_at se null), se status='enviada' → UPDATE status='visualizada'
    - Actions `scroll_50`, `scroll_90`, `click_whatsapp`, `click_aprovar`: INSERT proposal_events com event_type correspondente
    - Action `'aceite'`: verificar duplicata via UNIQUE constraint, calcular SHA-256 do snapshot, INSERT proposal_acceptances, UPDATE proposals SET status='aprovada', INSERT proposal_events (aprovacao_confirmada), INSERT proposal_audit_log, invocar proposal-generate-contract
    - Retornar 409 se já existir aceite para o proposal_id
    - _Requisitos: 4.1, 4.2, 5.2, 5.3, 5.4, 5.8_

  - [x] 4.2 Criar supabase/functions/proposal-generate-contract/index.ts
    - Aceitar POST autenticado (service_role ou JWT da agência)
    - Buscar proposal + services + sections + client + acceptances + closer profile
    - Buscar contract_template da organização (is_default = true); se não encontrar, usar DEFAULT_CONTRACT_TEMPLATE constante
    - Substituir todas as variáveis `{{...}}` pelos valores correspondentes
    - Gerar PDF do HTML final (usar html-pdf-node ou equivalente Deno-compatible)
    - Upload PDF → Supabase Storage bucket 'contracts' → path: {org_id}/{uuid}.pdf
    - INSERT contracts com proposal_id, contract_version=1, contract_content, pdf_url
    - INSERT proposal_audit_log (action='contrato_gerado')
    - Se usou template padrão, notificar via canal Realtime
    - _Requisitos: 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 5. Página de listagem de propostas
  - [x] 5.1 Criar src/pages/PropostasPage.tsx
    - Usar `useProposals` com filtros
    - Cards de indicadores de resumo no topo (total, enviadas, aprovadas, taxa, valor total)
    - Tabela com colunas: cliente, empresa, closer, data criação, status, valor, último acesso, visualizações, link (copiar)
    - Filtros: status, closer, período, empresa, campanha, origem, tags
    - Botão "Nova Proposta" sempre visível; estado vazio com botão quando sem propostas
    - _Requisitos: 1.1–1.7_

- [x] 6. Editor de proposta
  - [x] 6.1 Criar src/components/propostas/PropostaHeroEditor.tsx
    - Campos: upload de logo, título, subtítulo, mensagem, URL de vídeo, upload de imagem, texto+número do botão WhatsApp, texto do botão CTA
    - _Requisitos: 2.3_

  - [x] 6.2 Criar src/components/propostas/PropostaSectionEditor.tsx
    - Props: section (ProposalSection), onChange, onToggleVisibility
    - Toggle de visibilidade (ativar/ocultar) por seção
    - Editor rich text (Tiptap ou react-quill — verificar dependências existentes no projeto)
    - Botão "Gerar com IA" que aciona `useProposalAI`
    - _Requisitos: 2.4, 10.1, 10.6_

  - [x] 6.3 Criar src/components/propostas/PropostaServicosEditor.tsx
    - Lista de serviços com campos: nome, descrição, valor (R$), toggle bônus, ordem (drag)
    - Botão "Adicionar Serviço"
    - Validações: nome ≤120, descrição ≤500, valor entre R$0,01 e R$999.999,99
    - Recalcular Value_Comparison ao adicionar/editar/remover/marcar bônus (chamar `calcValueComparison`)
    - _Requisitos: 2.5, 2.6, 2.7, 2.8_

  - [x] 6.4 Criar src/components/propostas/PropostaValueComparison.tsx
    - Props: services (ProposalService[]), planValue (number), mode ('editor' | 'viewer')
    - Exibir: lista com checkmark verde / ícone 🎁, total individual, valor do plano, economia destacada verde, percentual
    - No viewer: total individual riscado visualmente; bônus com "De: R$X → Por: R$0,00 (Bônus Exclusivo)"
    - _Requisitos: 2.7, 3.3_

  - [x] 6.5 Criar src/components/propostas/PropostaCronograma.tsx
    - Formulário: valor parcela, data primeira parcela, dia vencimento recorrente, tipo recorrência, nº parcelas (máx 360), reajustes por mês específico
    - Tabela gerada em tempo real via `generateSchedule`
    - _Requisitos: 2.9, 2.10, 3.4_

  - [x] 6.6 Criar src/pages/PropostaEditorPage.tsx
    - Compor: seletor de cliente (autocomplete), PropostaHeroEditor, lista de PropostaSectionEditor (todas as 14 seções), PropostaServicosEditor, PropostaValueComparison, PropostaCronograma, bloco CTA (texto+cor configurável)
    - Pré-carregar dados do cliente ao selecionar (nome, empresa, CNPJ, e-mail, WhatsApp)
    - Gerar slug único ao criar; retry em caso de colisão
    - Validação: impedir salvar sem cliente + sem ao menos 1 serviço
    - Botão "Salvar Rascunho" + botão "Enviar" (que abre PropostaEnvioModal)
    - _Requisitos: 2.1–2.14_

- [x] 7. Proposal_Viewer (página pública)
  - [x] 7.1 Criar src/pages/PropostaViewerPage.tsx
    - Buscar proposta via `get_proposal_by_slug(slug)` (anon, sem autenticação)
    - Se slug não encontrado ou status `rascunho`/`recusada`/`expirada` → exibir mensagem adequada sem expor dados internos
    - Renderizar seções visíveis em ordem crescente de section_order
    - Renderizar PropostaValueComparison em modo viewer
    - Renderizar tabela do Financial_Schedule
    - Ocultar botão WhatsApp se hero_whatsapp_number vazio
    - Se status='aprovada' → modo somente-leitura (sem botão "Aprovar Proposta")
    - Disparar `proposal-track-event` com action='load' ao montar; ações de scroll com IntersectionObserver ou scroll listener (dedup por sessão via sessionStorage)
    - _Requisitos: 3.1–3.8, 4.1, 4.2, 12.3_

  - [x] 7.2 Criar src/components/propostas/PropostaAceiteModal.tsx
    - Campos: nome completo (obrigatório), CPF (validação formato XXX.XXX.XXX-XX ou 11 dígitos), checkbox aceite dos termos
    - Validação inline ao tentar confirmar (sem fechar modal)
    - Ao confirmar: serializar snapshot da proposta, chamar `proposal-track-event` com action='aceite'
    - Se retorno 409 → exibir "Esta proposta já foi aprovada"
    - Se erro de rede → exibir mensagem de erro, manter modal aberto
    - _Requisitos: 5.1–5.8_

- [x] 8. Envio e comunicação
  - [x] 8.1 Criar src/components/propostas/PropostaEnvioModal.tsx
    - Três opções: (a) Copiar link — clipboard + toast "Copiado!"; (b) WhatsApp — gerar mensagem pré-formatada editável + abrir wa.me; (c) E-mail — modal com campo "Para" (pré-preenchido), assunto, corpo com variáveis
    - Ao usar qualquer canal: chamar `sendProposal` do hook (UPDATE status='enviada' + INSERT audit_log com canal)
    - Se clipboard bloqueado ou erro → toast de erro, status inalterado
    - _Requisitos: 9.1–9.6_

- [x] 9. Painel de analytics
  - [x] 9.1 Criar src/components/propostas/PropostaAnalyticsPanel.tsx
    - Exibir: total visualizações, total acessos, tempo médio de sessão, último acesso, dispositivo mais usado
    - Tabela dos últimos 50 acessos (data, IP, cidade, dispositivo)
    - Lista cronológica de eventos por sessão
    - Usar `useProposalAnalytics(proposalId)`
    - _Requisitos: 4.4_

- [x] 10. IA para geração de conteúdo
  - [x] 10.1 Criar src/components/propostas/PropostaAIModal.tsx
    - Props: sectionKey, generatedText, isLoading, onUse, onRegenerate, onCancel
    - Editor de texto no modal (edição manual antes de usar)
    - Botões: "Usar texto gerado", "Regenerar", "Cancelar"
    - Exibir spinner enquanto `isLoading = true`
    - Se timeout (30s) ou erro: exibir mensagem e fechar carregamento sem bloquear editor
    - _Requisitos: 10.4–10.6_

- [x] 11. Aba Comercial no cadastro do cliente
  - [x] 11.1 Criar src/components/clients/ComercialClientTab.tsx
    - Sub-abas em ordem: Propostas, Contratos, Timeline, Aprovações, Arquivos
    - Sub-aba Propostas: lista filtrada por client_id com ações por status (editar/excluir para rascunho; visualizar/duplicar/copiar/arquivar para enviada+visualizada; visualizar/duplicar para aprovada; duplicar para expirada+recusada)
    - Sub-aba Contratos: listar contracts da tabela existente com título, data, status, valor, versão, link PDF
    - Sub-aba Timeline: eventos em ordem cronológica reversa
    - Sub-aba Aprovações: aceites com data, nome, CPF mascarado (XXX.***.***-XX), IP, botão download PDF
    - Sub-aba Arquivos: PDFs de propostas e contratos com data, versão, download
    - Estado vazio contextual em cada sub-aba
    - _Requisitos: 8.1–8.8_

  - [x] 11.2 Modificar src/components/clients/ContractDetailPage.tsx
    - Adicionar aba "Comercial" como última aba no `<TabsList>` e `<TabsContent>`
    - Renderizar `<ComercialClientTab clientId={clientId} organizationId={organizationId} />`
    - Importar e renderizar condicionalmente (sempre visível quando módulo ativo)
    - _Requisitos: 8.1_

- [x] 12. Integração com pipeline de leads
  - [x] 12.1 Modificar src/pages/LeadsKanbanPage.tsx (ou componente de card do Kanban)
  - [x] 12.2 Atualizar src/hooks/useProposals.ts — lógica de integração com pipeline
  - [x] 12.3 Atualizar src/pages/PropostaEditorPage.tsx — leitura de query params

- [x] 13. Template de contrato e geração
  - [x] 13.1 Criar src/pages/ContractTemplatePage.tsx

- [x] 14. Dashboard Comercial
  - [x] 14.1 Criar src/components/comercial/ComercialFunil.tsx
  - [x] 14.2 Criar src/pages/ComercialDashboardPage.tsx

- [x] 15. Rotas e navegação
  - [x] 15.1 Modificar src/App.tsx
    - Adicionar rota pública: `/proposta/:slug` → `<PropostaViewerPage />`
    - Adicionar rotas privadas: `/comercial/propostas`, `/comercial/propostas/nova`, `/comercial/propostas/:id`, `/comercial/propostas/:id/detalhes`, `/comercial/dashboard`, `/comercial/configuracoes/contratos`
    - Posicionar rota pública junto às demais rotas sem autenticação
    - _Requisitos: 1.1, 3.1_

- [ ] 16. Testes de propriedade (opcionais)
  - [ ] 16.1* Escrever property tests para `calcValueComparison`
    - P1: para qualquer lista de serviços com valores positivos, totalIndividual = soma(values), savings = totalIndividual − planValue, savingsPercent = savings / totalIndividual × 100
    - Usar fast-check com gerador de arrays de serviços e planValue

  - [ ] 16.2* Escrever property tests para `generateSchedule`
    - P4: rows.length === installments, datas incrementais corretas, soma correta sem reajustes
    - Usar fast-check com geradores de N parcelas e datas aleatórias

- [x] 17. Checkpoint final
  - `tsc --noEmit` — **0 erros** (verificado)
  - `/proposta/:slug` rota pública configurada em App.tsx
  - Criação sem serviço bloqueada no `canProceed()` do ContractGenerator
  - Aceite duplicado retorna 409 via UNIQUE constraint em proposal_acceptances
  - Slug único por UNIQUE constraint na tabela proposals
  - proposal_acceptances rejeita UPDATE/DELETE por policy RLS

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1","1.2","1.3","1.4","1.5","1.6","1.7","1.8","1.9"] },
    { "wave": 2, "tasks": ["2.1","2.2","2.3","2.4","2.5"] },
    { "wave": 3, "tasks": ["3.1","3.2","3.3","3.4","3.5","3.6"] },
    { "wave": 4, "tasks": ["4.1","4.2"] },
    { "wave": 5, "tasks": ["5.1","6.1","6.2","6.3","6.4","6.5","9.1","10.1","13.1","14.1"] },
    { "wave": 6, "tasks": ["6.6","7.1","7.2","8.1","11.1","14.2"] },
    { "wave": 7, "tasks": ["11.2","12.1","12.2","12.3"] },
    { "wave": 8, "tasks": ["15.1"] },
    { "wave": 9, "tasks": ["17"] }
  ]
}
```

## Notes

- Tasks com `*` são opcionais (property-based tests com fast-check)
- Migrations seguem numeração 049–057 (próxima disponível após a 048 existente)
- O rich text editor deve verificar se `@tiptap/react` já está no package.json antes de instalar nova dependência
- A Edge Function `proposal-generate-contract` para PDF pode usar abordagem simplificada (retornar HTML + print do browser) se `html-pdf-node` não for compatível com o ambiente Supabase Edge/Deno
- A geolocalização por IP (`ip-api.com`) falha silenciosamente — nunca bloquear o registro do evento
- O campo `total_individual` na tabela `proposals` é calculado no app (não no banco) para evitar trigger de atualização em cascata nos serviços
- A notificação in-app ao Closer (status enviada → visualizada) requer Supabase Realtime ou tabela de notificações existente no projeto
