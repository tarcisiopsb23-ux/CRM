r# Implementation Plan: CRM Dashboard Tab

## Overview

Adicionar a aba "CRM" ao dashboard público (`/dashboard/:slug`) extraindo os subcomponentes de `CrmPage.tsx` para `src/components/crm/`, criando o `CrmSection`, e modificando `PublicDashboardPage.tsx` para suportar a terceira aba controlada pela flag `metadata.dashboard_crm`.

## Tasks

- [x] 1. Extrair tipos e constantes compartilhados para `src/components/crm/types.ts`
  - Criar `src/components/crm/types.ts` com `LeadStatus`, `Lead` e `COLUMNS`
  - Exportar todos os tipos para uso em `CrmSection`, `CrmPage` e testes
  - _Requirements: 4.2, 4.7_

- [x] 2. Extrair subcomponentes de `CrmPage.tsx` para `src/components/crm/`
  - [x] 2.1 Criar `src/components/crm/KanbanColumn.tsx` com o componente `KanbanColumn`
    - Importar tipos de `./types`
    - _Requirements: 4.2, 4.7_
  - [x] 2.2 Criar `src/components/crm/LeadCard.tsx` com o componente `LeadCard`
    - Importar tipos de `./types`
    - _Requirements: 4.4, 4.5, 4.7_
  - [x] 2.3 Criar `src/components/crm/LeadForm.tsx` com o componente `LeadForm`
    - Importar tipos de `./types`; manter validação de nome obrigatório com `toast.error`
    - _Requirements: 4.4, 4.6, 4.7_
  - [x] 2.4 Atualizar `CrmPage.tsx` para importar `KanbanColumn`, `LeadCard`, `LeadForm` e tipos de `src/components/crm/`
    - Remover definições locais duplicadas
    - _Requirements: 4.7_

- [-] 3. Criar `src/components/crm/CrmSection.tsx`
  - [x] 3.1 Implementar `CrmSection` com prop `clientId: string`
    - Carregar leads via `supabase.from("crm_leads").select("*").eq("client_id", clientId)` (ou sem filtro se a tabela não tiver `client_id`, seguindo o padrão atual de `CrmPage`)
    - Implementar `fetchLeads`, `handleSave`, `handleDelete`, `handleDragStart`, `handleDragEnd`
    - Renderizar `DndContext`, `KanbanColumn` x6, `DragOverlay`, `LeadForm`
    - Adicionar botão "Novo Lead" no topo da seção
    - Tratar todos os erros com `toast.error` conforme tabela de Error Handling do design
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [ ] 3.2 Escrever testes unitários para `CrmSection`
    - Verificar que renderiza 6 colunas com labels corretos (Novo, Contato, Proposta, Negociação, Fechado, Perdido)
    - Verificar que query é desabilitada quando `clientId` é undefined/vazio
    - _Requirements: 4.2, 4.3_

- [x] 4. Checkpoint — Garantir que `CrmPage` continua funcionando após refatoração
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [-] 5. Modificar `PublicDashboardPage.tsx` para suportar a aba CRM
  - [x] 5.1 Expandir tipo de `activeTab` para `"performance" | "atendimento" | "crm"`
    - Adicionar `const dashCrm: boolean = clientData?.metadata?.dashboard_crm ?? false`
    - _Requirements: 1.1, 1.4_
  - [x] 5.2 Atualizar `dashboardTitle` para incluir o caso `dashboard_crm` único e "Dashboard Completo" com 2+ flags
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 5.3 Atualizar `resolvedTab` para 3 flags, garantindo que sempre aponte para uma aba habilitada
    - _Requirements: 2.3_
  - [x] 5.4 Atualizar bloco de tabs na TabBar: adicionar botão CRM com ícone `KanbanSquare`, cor `bg-violet-600` ativo e `text-slate-400 hover:text-slate-200` inativo
    - Exibir TabBar somente quando 2+ flags ativas (incluindo `dashCrm`)
    - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 3.3, 3.4_
  - [x] 5.5 Adicionar bloco de conteúdo `{resolvedTab === "crm" && <CrmSection clientId={clientData.id} />}`
    - _Requirements: 4.1_
  - [x] 5.6 Incluir `dashboard_crm: fresh.dashboard_crm ?? false` no objeto `merged` salvo no `localStorage`
    - _Requirements: 1.5, 6.1, 6.2, 6.3_
  - [ ] 5.7 Escrever property test — Property 1: Visibilidade da aba CRM reflete a flag
    - **Property 1: CRM tab visibility reflects flag**
    - **Validates: Requirements 1.2, 1.3, 1.4**
    - Usar `fc.record({ dashboard_crm: fc.oneof(fc.boolean(), fc.constant(undefined)) })`
  - [ ] 5.8 Escrever property test — Property 2: Barra de abas visível iff 2+ flags ativas
    - **Property 2: Tab bar visible iff 2+ flags active**
    - **Validates: Requirements 2.1, 2.2, 2.4**
    - Usar `fc.record({ p: fc.boolean(), a: fc.boolean(), c: fc.boolean() })`
  - [ ] 5.9 Escrever property test — Property 3: resolvedTab sempre aponta para aba habilitada
    - **Property 3: resolvedTab always points to enabled tab**
    - **Validates: Requirements 2.3**
    - Gerar combinações de flags (pelo menos uma ativa) e valores arbitrários de `activeTab`
  - [ ] 5.10 Escrever property test — Property 4: Título do dashboard determinado pelas flags ativas
    - **Property 4: Dashboard title determined by active flags**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Extrair `computeDashboardTitle(flags)` como função pura e testar todas as 8 combinações

- [x] 6. Checkpoint — Garantir que todos os testes passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [ ] 7. Testes de integração do `CrmSection` com Supabase mockado
  - [ ] 7.1 Escrever property test — Property 5: Round trip de criação de lead
    - **Property 5: Lead creation round trip**
    - **Validates: Requirements 4.3, 4.4**
    - Usar mocks do Supabase; gerar leads com `fc.record({ name: fc.string({ minLength: 1 }), ... })`
  - [ ] 7.2 Escrever property test — Property 6: Drag & drop atualiza status do lead
    - **Property 6: Drag & drop updates lead status**
    - **Validates: Requirements 4.5**
    - Gerar lead com status inicial e coluna de destino diferente; verificar chamada ao Supabase e estado local
  - [ ] 7.3 Escrever testes unitários para comportamento de erro
    - Verificar que falha no SELECT exibe `toast.error("Erro ao carregar leads")`
    - Verificar que formulário com nome vazio chama `toast.error("Nome obrigatório")` e não chama `supabase.insert`
    - _Requirements: 4.6_

- [ ] 8. Checkpoint final — Garantir que todos os testes passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada task referencia os requisitos específicos para rastreabilidade
- Os subcomponentes extraídos (`KanbanColumn`, `LeadCard`, `LeadForm`) devem ser re-exportados via `src/components/crm/index.ts` se necessário
- Property tests usam [fast-check](https://github.com/dubzzz/fast-check) — instalar se não presente: `npm install --save-dev fast-check`
- Cada property test deve incluir o tag: `// Feature: crm-dashboard-tab, Property N: <texto>`
