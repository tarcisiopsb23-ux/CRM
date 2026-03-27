# Requirements Document

## Introduction

Integração do CRM Kanban como terceira aba do dashboard público (`/dashboard/:slug`). A aba "CRM" seguirá o mesmo padrão das abas existentes "Performance" e "Atendimento": controlada por uma flag `dashboard_crm` no metadata do cliente no Supabase, exibida apenas quando habilitada, com ícone e cor próprios. O conteúdo da aba reutilizará os componentes e a lógica já existentes em `CrmPage.tsx`, extraídos para `src/components/crm/`.

## Glossary

- **Dashboard**: Página pública acessível via `/dashboard/:slug` após autenticação do cliente.
- **Tab**: Aba de navegação dentro do Dashboard, controlada por flags no metadata do cliente.
- **CRM_Tab**: A nova aba "CRM" a ser adicionada ao Dashboard.
- **CRM_Section**: Componente React que encapsula o kanban de leads dentro do contexto do Dashboard.
- **Flag**: Campo booleano no objeto `metadata` do cliente armazenado no Supabase.
- **dashboard_crm**: Flag booleana no metadata do cliente que habilita a CRM_Tab.
- **dashboard_performance**: Flag booleana existente que habilita a aba de Performance.
- **dashboard_atendimento**: Flag booleana existente que habilita a aba de Atendimento.
- **resolvedTab**: Valor calculado que garante que a aba ativa seja sempre uma aba habilitada.
- **Lead**: Registro de oportunidade comercial na tabela `crm_leads` do Supabase.
- **Kanban**: Quadro visual com colunas representando estágios do pipeline de vendas.
- **CrmPage**: Página standalone existente em `src/pages/CrmPage.tsx` com o kanban completo.
- **Client**: Registro de cliente na tabela `clients` do Supabase, com campo `metadata` JSONB.

## Requirements

### Requirement 1: Controle de visibilidade da aba CRM via flag

**User Story:** Como administrador, quero controlar se a aba CRM aparece no dashboard de cada cliente, para que apenas clientes com CRM habilitado vejam essa funcionalidade.

#### Acceptance Criteria

1. THE Dashboard SHALL ler o campo `metadata.dashboard_crm` do registro do cliente no Supabase para determinar se a CRM_Tab está habilitada.
2. WHEN `metadata.dashboard_crm` é `true`, THE Dashboard SHALL exibir o botão da CRM_Tab na barra de abas.
3. WHEN `metadata.dashboard_crm` é `false` ou ausente, THE Dashboard SHALL ocultar o botão da CRM_Tab da barra de abas.
4. THE Dashboard SHALL tratar `metadata.dashboard_crm` ausente como `false` por padrão.
5. WHEN os dados frescos do cliente são carregados via RPC `get_client_by_slug`, THE Dashboard SHALL atualizar o estado de visibilidade da CRM_Tab sem recarregar a página.

---

### Requirement 2: Exibição condicional da barra de abas

**User Story:** Como cliente, quero ver a barra de abas apenas quando há mais de uma aba habilitada, para que a interface não mostre navegação desnecessária.

#### Acceptance Criteria

1. WHEN apenas uma das flags (`dashboard_performance`, `dashboard_atendimento`, `dashboard_crm`) está ativa, THE Dashboard SHALL ocultar a barra de abas e exibir diretamente o conteúdo da aba habilitada.
2. WHEN duas ou mais flags estão ativas, THE Dashboard SHALL exibir a barra de abas com os botões correspondentes às abas habilitadas.
3. THE Dashboard SHALL garantir que `resolvedTab` sempre aponte para uma aba habilitada, mesmo quando a aba anteriormente ativa é desabilitada.
4. WHEN `dashboard_crm` é a única flag ativa, THE Dashboard SHALL exibir o conteúdo da CRM_Tab diretamente, sem barra de abas.

---

### Requirement 3: Botão da aba CRM na barra de navegação

**User Story:** Como cliente, quero um botão visual claro para acessar o CRM no dashboard, para que eu possa navegar entre as seções facilmente.

#### Acceptance Criteria

1. THE CRM_Tab SHALL ser representada por um botão com o ícone `KanbanSquare` (ou equivalente de `lucide-react`) e o rótulo "CRM".
2. THE CRM_Tab SHALL usar a cor `bg-violet-600` no estado ativo, seguindo o padrão visual das abas existentes (Performance usa `bg-[#2D8CC7]`, Atendimento usa `bg-emerald-600`).
3. WHEN o botão da CRM_Tab está no estado inativo, THE Dashboard SHALL aplicar as classes `text-slate-400 hover:text-slate-200` ao botão.
4. WHEN o botão da CRM_Tab é clicado, THE Dashboard SHALL definir `activeTab` como `"crm"` e exibir o conteúdo da CRM_Section.

---

### Requirement 4: Componente CrmSection integrado ao Dashboard

**User Story:** Como cliente, quero visualizar e gerenciar meus leads diretamente no dashboard, sem precisar navegar para outra página.

#### Acceptance Criteria

1. THE Dashboard SHALL renderizar a CRM_Section quando `resolvedTab === "crm"`.
2. THE CRM_Section SHALL exibir o kanban de leads com as 6 colunas: Novo, Contato, Proposta, Negociação, Fechado, Perdido.
3. THE CRM_Section SHALL carregar os leads da tabela `crm_leads` do Supabase ao ser montada.
4. THE CRM_Section SHALL suportar criação, edição e exclusão de leads via formulário modal, mantendo a paridade funcional com `CrmPage`.
5. THE CRM_Section SHALL suportar drag & drop entre colunas do kanban, atualizando o campo `status` do lead no Supabase ao final do arraste.
6. IF uma operação de CRUD falhar, THEN THE CRM_Section SHALL exibir uma notificação de erro via `toast`.
7. THE CRM_Section SHALL ser implementada em `src/components/crm/CrmSection.tsx`, reutilizando os subcomponentes extraídos de `CrmPage.tsx`.

---

### Requirement 5: Título dinâmico do dashboard

**User Story:** Como cliente, quero que o título do dashboard reflita as seções habilitadas, para que eu entenda rapidamente o escopo do painel.

#### Acceptance Criteria

1. WHEN apenas `dashboard_performance` está ativo, THE Dashboard SHALL exibir o título "Dashboard de Performance".
2. WHEN apenas `dashboard_atendimento` está ativo, THE Dashboard SHALL exibir o título "Dashboard de Atendimento".
3. WHEN apenas `dashboard_crm` está ativo, THE Dashboard SHALL exibir o título "Dashboard CRM".
4. WHEN duas ou mais flags estão ativas, THE Dashboard SHALL exibir o título "Dashboard Completo".

---

### Requirement 6: Persistência do estado de autenticação com a nova flag

**User Story:** Como sistema, quero que a flag `dashboard_crm` seja persistida no `localStorage` junto com os demais dados do cliente, para que o estado de visibilidade seja mantido entre recarregamentos de página.

#### Acceptance Criteria

1. WHEN os dados frescos do cliente são carregados via RPC, THE Dashboard SHALL incluir o campo `dashboard_crm` no objeto `merged` salvo no `localStorage`.
2. THE Dashboard SHALL ler `dashboard_crm` do objeto `metadata` do cliente armazenado no `localStorage` na inicialização.
3. WHEN `dashboard_crm` está ausente no objeto do `localStorage`, THE Dashboard SHALL tratá-lo como `false`.
