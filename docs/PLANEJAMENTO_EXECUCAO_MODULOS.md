# Planejamento inicial + status (feito vs pendente) + execução completa

Data: 2026-03-13  
Princípios: executar tudo com controle de risco, mantendo consistência e rastreabilidade.

## Estratégia geral (execução completa)

1. **Centralizar “regras e métricas”** (suspenso/reativado/inadimplência) em 1 ponto reutilizável; só depois ajustar cards/UX por módulo.
2. **Evitar schema novo** quando der para usar `metadata` existente (clients/contracts/payments). Migrar schema apenas quando inevitável (ex.: `documents`).
3. **UI por blocos isolados** (um módulo por vez), sem refatorar telas inteiras.
4. **Quando a mudança for grande**, dividir por “entregas utilizáveis” (incrementos) e manter compatibilidade enquanto migra (ex.: projetos de modal → página).
5. **Segurança e RBAC por padrão**: tudo novo nasce com RLS/RBAC, trilha de auditoria e testes mínimos.

## Etapa 0 — Mapa rápido (onde mexer)

Arquivos principais (confirmados no repo):

- **CRM/Kanban e rótulos de etapas**
  - [useSalesAnalytics.ts](file:///c:/automacoes/CRM/src/hooks/useSalesAnalytics.ts)
  - [useDashboard.ts](file:///c:/automacoes/CRM/src/hooks/useDashboard.ts)
  - [database.ts](file:///c:/automacoes/CRM/src/types/database.ts)
  - [LeadsKanbanPage.tsx](file:///c:/automacoes/CRM/src/pages/LeadsKanbanPage.tsx) + [src/components/kanban](file:///c:/automacoes/CRM/src/components/kanban)
- **Analytics Vendas**
  - [SalesDashboardPage.tsx](file:///c:/automacoes/CRM/src/pages/SalesDashboardPage.tsx)
  - [SalesMetricCard.tsx](file:///c:/automacoes/CRM/src/components/analytics/SalesMetricCard.tsx)
- **Clientes**
  - [ClientsPage.tsx](file:///c:/automacoes/CRM/src/pages/ClientsPage.tsx)
- **Dashboard principal**
  - [DashboardPage.tsx](file:///c:/automacoes/CRM/src/pages/DashboardPage.tsx)
- **Financeiro (cards + DRE)**
  - [FinancialPage.tsx](file:///c:/automacoes/CRM/src/pages/FinancialPage.tsx)
- **Projetos**
  - [ProjectsPage.tsx](file:///c:/automacoes/CRM/src/pages/ProjectsPage.tsx)
  - [ProjectDetailsPage.tsx](file:///c:/automacoes/CRM/src/pages/ProjectDetailsPage.tsx)
- **Equipe (cadastro colaborador)**
  - [AddCollaboratorModal.tsx](file:///c:/automacoes/CRM/src/components/team/AddCollaboratorModal.tsx)
  - [CompleteRegistrationPage.tsx](file:///c:/automacoes/CRM/src/pages/CompleteRegistrationPage.tsx)
- **Relatórios**
  - [ReportsPage.tsx](file:///c:/automacoes/CRM/src/pages/ReportsPage.tsx)
- **Google Drive/n8n (UI de integrações)**
  - [N8nSection.tsx](file:///c:/automacoes/CRM/src/components/settings/N8nSection.tsx)

## Etapa 1 — Base de métricas de contratos (reaproveitar em módulos)

### Objetivo
Calcular uma vez e reutilizar em Analytics, Clientes, Dashboard, Financeiro.

### Status atual (o que já existe)

- **Base de cálculo (front)**: [useContractMetrics.ts](file:///c:/automacoes/CRM/src/hooks/useContractMetrics.ts)
  - Suspensos (total/mês), reativados (mês), inadimplência (total), contratos >30 dias, inadimplência recebida no mês.
  - Datas em `contracts.metadata`: `suspended_at`, `suspended_reason`, `reactivated_at`.
- **Mutações únicas (front)**: [useContracts.ts](file:///c:/automacoes/CRM/src/hooks/useContracts.ts)
  - `useSuspendContract` (grava `suspended_at` e opcional `suspended_reason`)
  - `useReactivateContract` (grava `reactivated_at`)
  - `useEndContract` (encerra e cancela pagamentos futuros não pagos)
- **Regra “inadimplente > 30 dias ⇒ suspenso” (banco)**:
  - RPC pronta: [00035_contracts_overdue_suspension.sql](file:///c:/automacoes/CRM/supabase/migrations/00035_contracts_overdue_suspension.sql)
  - Hook para disparar RPC: [useContractSuspensionSync.ts](file:///c:/automacoes/CRM/src/hooks/useContractSuspensionSync.ts)
  - Observação: hoje isso existe como **sincronização sob demanda**, não como job/scheduler automático.

### Pendências (para fechar a Etapa 1 do jeito “robusto”)

1. **Tornar a suspensão automática** via scheduler (cron) / rotina backend:
   - Executar `sync_contract_suspensions(org_id, overdue_days)` de forma periódica.
   - Garantir idempotência (já está) e evitar sobrescrever `suspended_at` se já existe (a função já seta, mas ainda precisa validar a regra “se não existir”).
2. **Centralização “1 ponto” no front**:
   - Consolidar “cálculo + breakdown” em um único módulo (ex.: manter `computeContractMetrics` como função pura e criar helpers de listas: inadimplentes por cliente, recuperados por mês etc.).
   - Evitar reimplementar as mesmas regras em `ClientsPage`, `SalesDashboardPage`, `FinancialPage`, `DashboardPage`.

## Etapa 2 — Ajustes por módulo (um por vez)

### 2.1 CRM (Kanban)

**Pendente**
- Renomear label “Emissão Contrato” → “Negociações” (apenas label; manter id `emissao_contrato`).
- Ajustar layout do Kanban (altura máxima e scrolls sempre disponíveis) com mudança pontual preferencialmente em [KanbanBoard.tsx](file:///c:/automacoes/CRM/src/components/kanban/KanbanBoard.tsx).

### 2.2 Analytics Vendas

**Feito**
- Seção “Contratos” com KPIs + drilldown, busca, totais e ação “Ver cliente”.
  - Arquivo: [SalesDashboardPage.tsx](file:///c:/automacoes/CRM/src/pages/SalesDashboardPage.tsx)

**Pendente (novas solicitações)**
- Ajustar layout:
  - “Visão do Pipeline” e “Taxa de conversão” lado a lado.
  - “Motivos da Perda” e “Leads Criados no Mês” lado a lado.
  - “Métricas de Receita”: garantir mesma altura entre os dois blocos.
- Recriar tabela “Taxa de conversão” no formato:
  - Colunas: `ETAPA | Indicadores | Prop./Lead (%) | Prop/F.A (%)`
  - `Prop./Lead`: cada etapa sobre “Leads Recebidos”.
  - `Prop/F.A`: cada etapa sobre a etapa anterior.
  - Valores apurados por **período informado** (não apenas snapshot do CRM no momento).
- “Aba Métricas”: reajustar categorias e incluir todos indicadores possíveis (número/moeda/%).

### 2.3 Clientes

**Já existia / está presente**
- “Inadimplentes”: top 5 + “ver mais” (modal).
- Indicativo “Suspenso” na lista de clientes (badge).
- Ações “Suspender” (ativo) e “Reativar” (suspenso) nos contratos do cliente.
  - Arquivo: [ClientsPage.tsx](file:///c:/automacoes/CRM/src/pages/ClientsPage.tsx)

**Feito**
- Deep link `/clients?view=<clientId>` para abrir direto o modal do cliente.
  - Arquivo: [ClientsPage.tsx](file:///c:/automacoes/CRM/src/pages/ClientsPage.tsx)

**Pendente (nova solicitação)**
- Tornar **obrigatório** informar motivo ao suspender contrato (não permitir vazio).
  - Ajuste primário no fluxo de “Suspender” em [ClientsPage.tsx](file:///c:/automacoes/CRM/src/pages/ClientsPage.tsx)
  - Ajuste secundário: no hook `useSuspendContract` validar `reason` (para reduzir risco de outras telas chamarem sem motivo).

### 2.4 Dashboard principal

**Pendente**
- Inserir card(s) com:
  - total contratos suspensos
  - total contratos reativados (definir se “no mês” ou “total” e padronizar)
- Consumir a base centralizada de métricas (Etapa 1).
  - Arquivo: [DashboardPage.tsx](file:///c:/automacoes/CRM/src/pages/DashboardPage.tsx)

### 2.5 Financeiro

**Feito**
- Cards: “Inadimplência” e “Inadimplência recebida (mês)”
- DRE: meses em colunas e categorias em linhas
  - Arquivo: [FinancialPage.tsx](file:///c:/automacoes/CRM/src/pages/FinancialPage.tsx)

**Pendente (novas solicitações)**
- Seletor de período do DRE: `Mês anterior | Mês atual | 3 | 6 | 12 meses`
  - Recalcular e exibir DRE conforme período.
- Ajustar filtros do Financeiro:
  - Ver “todos”
  - Filtrar por equipe (selecionar equipe)
  - Filtrar por cargo (cargos vindos do módulo Equipe)
  - Critério: filtrar principalmente a Folha (e eventuais outros blocos que dependam de profile/team).

### 2.6 Metas

**Pendente**
- Alertas, filtros (indicador/categoria/responsável/período) e expansão de indicadores (CRM/Clientes/Financeiro).
  - Arquivo provável: [GoalsPage.tsx](file:///c:/automacoes/CRM/src/pages/GoalsPage.tsx)

### 2.7 Projetos

**Feito**
- Status “Parado” / “Concluído” + restrição de concluir para admin/owner
  - [ProjectsPage.tsx](file:///c:/automacoes/CRM/src/pages/ProjectsPage.tsx)
  - [ProjectDetailsPage.tsx](file:///c:/automacoes/CRM/src/pages/ProjectDetailsPage.tsx)

**Pendente (nova solicitação: mudança grande, fazer em etapas)**
- Não abrir projeto como popup: abrir como “janela dentro do módulo”.
- Exibir tarefas vinculadas com: prazo final, horas e progresso.
- Regra: prazo final da tarefa **não pode ultrapassar** a data de término do projeto.
- Exibições:
  - **Tarefas**: lista, calendário e Gantt.
  - **Projetos**: lista, kanban e calendário.

### 2.8 Equipe

**Pendente**
- Unificar campos de cadastro (convite/finalização vs cadastro direto) com bloco reutilizável.
- Ajustar modal: 90% altura máxima e 80% largura.
  - [AddCollaboratorModal.tsx](file:///c:/automacoes/CRM/src/components/team/AddCollaboratorModal.tsx)
  - [CompleteRegistrationPage.tsx](file:///c:/automacoes/CRM/src/pages/CompleteRegistrationPage.tsx)

### 2.9 Relatórios

**Feito**
- Ajuste pontual de label de projetos `bloqueada` → “Parado”
  - [ReportsPage.tsx](file:///c:/automacoes/CRM/src/pages/ReportsPage.tsx)

**Pendente**
- Bug: ao trocar visão (macro/específica), resetar estado dos indicadores e forçar re-render.

## Etapa 3 — Google Drive + n8n + API + RBAC + imutabilidade

**Pendente (inteiro)**

Decisão de arquitetura (baixo retrabalho):
- Preview “não público” exige compartilhamento para usuários (e-mail individual ou grupo por org) via Drive API.

Plano (alto nível):
1. **Banco**: tabela `documents` append-only (RLS: insert/select; update/delete negados).
2. **n8n/API**: criar pasta do cliente + upload (retornar `file_id`/URLs).
3. **UI Cliente**: seção “Documentos” (listar + adicionar + preview iframe), sem editar/substituir/deletar.

## Etapa 4 — Validação (barata e segura)

**Feito** (durante as entregas)
- `npm run lint`
- `npm test`
- `npm run build`

**Pendente**
- Validar manualmente com 2 perfis (admin e member) + 1 fluxo negado (viewer) por módulo.
- Critérios de aceite por item (ex.: card X bate com contagem Y; suspender exige motivo; DRE muda com período etc.).

---

# Planejamento de execução dos pendentes (ordem recomendada, execução completa)

## Como executar “tudo” sem perder controle

- **Trilhas em paralelo (quando possível)**:
  - Trilho 1: Métricas/Período (contratos, conversões, DRE por período)
  - Trilho 2: UX por módulo (CRM, Analytics, Clientes, Dashboard)
  - Trilho 3: Projetos (navegação + visões + regras + Gantt)
  - Trilho 4: Integrações (Drive/n8n/documents/RBAC)
- **Critério de ordem**: dependências primeiro (dados/periodização), depois UI, depois integrações e refactors maiores.
- **Gestão de risco**: cada fase tem “escopo fechado + aceite + rollback”.

## Fase A (Fundação) — Métricas centralizadas e período (dependência de tudo) [Prioridade Alta]

1. **Centralizar métricas e breakdowns** de contratos
   - Criar um “núcleo” (funções puras) para:
     - métricas agregadas
     - listas: inadimplentes por cliente, reativados/suspensos por período, recuperados por período
   - Trocar `SalesDashboardPage` e `ClientsPage` para consumir esse núcleo (sem mudar UI).
2. **Habilitar rotina automática de suspensão >30 dias**
   - Implementar execução periódica de `sync_contract_suspensions(org_id, overdue_days)` (cron/scheduler).
   - Se a infra não tiver scheduler, usar n8n/cron externo chamando RPC com credencial adequada.
   - Garantir que `metadata.suspended_at` não seja sobrescrito quando já existe (ajuste na função se necessário).
3. **Padronizar “período” como conceito comum**
   - Definir opções: mês anterior, mês atual, 3, 6, 12 meses.
   - Criar helpers para converter período → `from/to` (date range) e reaproveitar em Analytics/Financeiro/Metas/Relatórios.

Entregáveis:
- Um único ponto com regras de inadimplência/suspensão/reativação.
- Consistência de números entre módulos.
- Base pronta para cálculos por período (não-snapshot).

## Fase B (Clientes) — Motivo obrigatório na suspensão [Prioridade Alta]

1. **Obrigar motivo no UI** ao clicar “Suspender”
   - Substituir prompt atual por modal com campo obrigatório (validação).
2. **Validar no hook** `useSuspendContract`
   - Se `reason` vazio/nulo, lançar erro (proteção contra chamadas futuras).

Critérios de aceite:
- Não existe suspensão sem motivo.
- Após suspender, cards/listas atualizam sem refresh total.

## Fase C (Financeiro) — DRE por período + filtros (equipe/cargo/todos) [Prioridade Alta]

1. **Período do DRE**
   - Adicionar seletor: mês anterior / mês atual / 3 / 6 / 12.
   - Recalcular `drePivot` conforme intervalo.
2. **Filtros por “todos/equipe/cargo”**
   - Mapear origem dos dados:
     - Folha: `payroll_expenses` / `payrolls` + `profiles`/`teams`/`job_title`.
   - Implementar filtros com fallback “todos”.
3. **Unificar fonte de cargos**
   - Garantir que o filtro por cargo use o mesmo catálogo usado no módulo Equipe (job titles/cargo do profile).

Critérios de aceite:
- DRE altera corretamente ao mudar o período.
- Filtros não quebram o carregamento (e respeitam permissões).

## Fase D (Analytics Vendas) — Layout + conversões por período + aba Métricas [Prioridade Alta]

1. **Layout** (apenas grid/ordem/altura; sem alterar lógica)
2. **Tabela de conversão no formato solicitado**
   - Implementar cálculo por período:
     - `Prop./Lead` usando base “Leads Recebidos”
     - `Prop/F.A` usando a etapa anterior
   - Incluir filtro de período (padrão: mês atual; opções: mês anterior / 3 / 6 / 12)
3. **Aba Métricas**
   - Reorganizar categorias e listar indicadores por tipo (número, moeda, %), mantendo o mecanismo atual.

Critérios de aceite:
- Tabela bate com dados do CRM no período.
- UX consistente com o resto da página.

## Fase E (CRM/Kanban) — Labels, scroll e viewport [Prioridade Média]

1. Ajustar label “Emissão Contrato” → “Negociações” (apenas label).
2. Ajuste de scroll/altura no container do Kanban, isolado em 1 componente.

## Fase F (Projetos) — Migração de UX + novas visões + regras + Gantt [Prioridade Alta]

1. **Migrar “abrir projeto” de popup para página dentro do módulo**
   - `ProjectsPage` vira “shell” de navegação (lista/kanban/calendário) e o projeto abre em rota/painel interno.
2. **Tarefas no detalhe com todos os campos solicitados**
   - Lista: prazo final, horas, progresso (e ordenação por prazo).
   - Calendário: manter/ajustar.
   - Gantt: implementar (inicialmente read-only, depois editar).
3. **Regra de consistência de prazos**
   - Front: impedir salvar tarefa com prazo > término do projeto.
   - Banco: criar constraint/trigger seguro para garantir integridade (evitar inconsistências por chamadas diretas).
4. **Visões do módulo**
   - Projetos: lista, kanban e calendário.
   - Tarefas: lista, calendário e Gantt.
5. **Revisar “tarefas não aparecendo / inclusão”**
   - Validar se é UI ou RLS e corrigir com mínimo impacto.

Critérios de aceite:
- Não existe tarefa com prazo além do projeto.
- A navegação de projetos não usa mais modal/popup e suporta as 3 visões.

## Fase G (Relatórios) — Correções e consistência [Prioridade Média]

1. Corrigir bug: ao trocar visão (macro/específica), resetar estado e re-render do painel.
2. Revisar indicadores faltantes e habilitar quando houver dados (sem refatorar geral).

## Fase H (Metas) — Alertas, filtros e novos indicadores [Prioridade Média]

1. Alertas: alcançadas, próximas do vencimento, atrasadas.
2. Filtros: indicador, categoria, responsável, período.
3. Novos indicadores (CRM/Clientes/Financeiro), usando o mesmo mecanismo de cálculo por período.

## Fase I (Equipe) — Unificação de cadastro e layout [Prioridade Média]

1. Extrair “bloco de campos” reutilizável (convite/finalização/cadastro direto).
2. Ajustar modal para 90% altura máxima e 80% largura.

## Fase J (Drive + n8n + documents + RBAC + imutabilidade) [Prioridade Alta]

1. **Banco**
   - Criar tabela `documents` append-only (RLS: insert/select; update/delete negados).
   - Guardar `drive_folder_id`/`drive_folder_url` em `clients.metadata` (ou colunas se necessário).
2. **Workflows n8n**
   - Criar pasta do cliente.
   - Upload do arquivo e retorno de `file_id`/URL.
   - Compartilhar automaticamente com:
     - e-mail do usuário, ou
     - grupo por organização (preferível para escala).
3. **API/Integração**
   - Webhook seguro (assinatura/token), sem endpoints de update/delete.
4. **UI**
   - Seção “Documentos” no cliente: listar, adicionar, abrir preview (iframe) e abrir em nova aba.
   - Sem editar/substituir/deletar (imutabilidade no app).

## Fase K (Validação e operação) [Prioridade Alta]

1. Para cada módulo: validar com admin + member + viewer (fluxo negado).
2. Rodar sempre: `npm run lint`, `npm test`, `npm run build`.
3. Incluir checks de dados por período (Analytics/Financeiro/Metas).
