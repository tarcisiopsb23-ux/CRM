# Plano de Implementação: Sistema de Comissões, Bônus e Módulo RH

## Visão Geral

Implementação incremental do sistema de comissões/bônus e do módulo RH do Maestr.IA. O fluxo parte das migrations de banco, passa pelos tipos e hooks TypeScript, sobe para a Edge Function de cálculo, depois para os componentes de UI e termina com os testes de propriedade.

## Tasks

- [x] 1. Migrations de banco de dados (00083–00090)
  - [x] 1.1 Criar migration 00083 — campos de comissão em `profiles` + trigger `board_member_sync`
    - Adicionar `commission_rate`, `bonus_rate_120`, `bonus_rate_135`, `bonus_rate_150`, `is_board_member` à tabela `profiles`
    - Criar função `sync_board_member()` e trigger `board_member_sync` em `team_members`
    - Usar `IF NOT EXISTS` / `CREATE OR REPLACE` para idempotência
    - _Requirements: 19.1, 5.4, 5.5_

  - [x] 1.2 Criar migration 00084 — campos `sdr_id`, `closer_id`, `team_id` em `leads`
    - Adicionar as três colunas com FK para `profiles` e `teams` com `ON DELETE SET NULL`
    - NÃO adicionar `round_robin_index` em `teams`
    - _Requirements: 19.2, 1.3, 2.2, 2.3_

  - [x] 1.3 Criar migration 00085 — tabela `commission_entries`
    - Criar tabela com todos os campos especificados, constraints CHECK e UNIQUE `(profile_id, month_reference, entry_type)`
    - Incluir políticas RLS: SELECT para próprio colaborador / gerente / admin+owner; INSERT/UPDATE apenas service_role
    - _Requirements: 19.3_

  - [x] 1.4 Criar migration 00086 — tabela `commission_entry_sales`
    - Criar tabela com FK `commission_entry_id ON DELETE CASCADE`
    - Incluir política RLS SELECT via JOIN com `commission_entries`; INSERT apenas service_role
    - _Requirements: 19.4_

  - [x] 1.5 Criar migration 00087 — campo `source` em `goals`
    - Adicionar coluna `source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','team_sales','board_revenue'))`
    - _Requirements: 19.5, 7.5_

  - [x] 1.6 Criar migration 00088 — tabela `employee_absences`
    - Criar tabela com constraint `chk_datas CHECK (data_fim >= data_inicio)` e políticas RLS para admin/owner e gerente da equipe
    - _Requirements: 19.6, 11.1_

  - [x] 1.7 Criar migration 00089 — tabela `employee_evaluations`
    - Criar tabela com constraints CHECK `BETWEEN 0 AND 10` em cada critério e políticas RLS para admin/owner e gerente
    - _Requirements: 19.7, 12.1_

  - [x] 1.8 Criar migration 00090 — tabela `employee_trainings`
    - Criar tabela com políticas RLS apenas para admin/owner
    - _Requirements: 19.8, 13.1_

- [x] 2. Checkpoint — Migrations
  - Verificar que todas as migrations de 00083 a 00090 estão criadas, são idempotentes e sem erros de sintaxe SQL.
  - _Requirements: 19.9_

- [x] 3. Tipos TypeScript e hooks
  - [x] 3.1 Atualizar `src/types/auth.ts` — adicionar campos ao `Profile`
    - Adicionar `commission_rate`, `bonus_rate_120`, `bonus_rate_135`, `bonus_rate_150`, `is_board_member`
    - _Requirements: 9.1, 9.2_

  - [x] 3.2 Atualizar `src/types/database.ts` — adicionar campos ao `Lead`
    - Adicionar `sdr_id`, `closer_id`, `team_id` como `string | null`
    - _Requirements: 1.3, 2.2, 2.3_

  - [x] 3.3 Atualizar `src/hooks/useGoalsCRUD.ts` — adicionar `source` ao tipo `Goal`
    - Adicionar tipo `GoalSource = 'manual' | 'team_sales' | 'board_revenue'` e campo `source: GoalSource`
    - _Requirements: 7.5, 15.6_

  - [x] 3.4 Criar `src/types/commission.ts`
    - Definir `CommissionEntryStatus`, `CommissionEntryType`, `CommissionEntry`, `CommissionEntrySale`
    - _Requirements: 3.1, 3.4, 10.1_

  - [x] 3.5 Criar `src/types/hr.ts`
    - Definir `EmployeeAbsence`, `EmployeeEvaluation`, `EmployeeTraining` com todos os campos e tipos de union
    - _Requirements: 11.1, 12.1, 13.1_

  - [x] 3.6 Criar `src/hooks/useCommissionEntries.ts`
    - Implementar queries React Query para listar `commission_entries` por `profile_id`, buscar `commission_entry_sales` por `commission_entry_id`, criar entrada manual e atualizar status
    - _Requirements: 9.5, 10.1, 10.2, 8.3_

  - [x] 3.7 Escrever testes de propriedade para `useCommissionEntries` — Propriedade 10
    - **Property 10: Bônus manual tem entry_type correto e commission_value zero**
    - **Validates: Requisito 8.3**

  - [x] 3.8 Criar `src/hooks/useEmployeeAbsences.ts`
    - Implementar CRUD de `employee_absences` com React Query (list por `collaborator_id`, create, update status)
    - _Requirements: 11.1, 11.3_

  - [x] 3.9 Criar `src/hooks/useEmployeeEvaluations.ts`
    - Implementar CRUD de `employee_evaluations` com React Query (list por `collaborator_id`, create)
    - _Requirements: 12.1, 12.3_

  - [x] 3.10 Criar `src/hooks/useEmployeeTrainings.ts`
    - Implementar CRUD de `employee_trainings` com React Query (list por `collaborator_id`, create, update status)
    - _Requirements: 13.1, 13.4_

- [x] 4. Edge Function `calculate-commissions`
  - [x] 4.1 Criar `supabase/functions/calculate-commissions/index.ts` — estrutura base e filtros iniciais
    - Receber payload do Database Webhook em `payments`
    - Implementar filtros: `status != 'pago'`, verificação de primeiro pagamento, lead em `efetivados`
    - _Requirements: 3.1, 3.2, 3.7_

  - [x] 4.2 Implementar cálculo de comissão para Closer e SDR
    - UPSERT em `commission_entries` para `closer_id` e `sdr_id` com `commission_value = ROUND(total_sales_value * commission_rate / 100, 2)`
    - INSERT em `commission_entry_sales` para cada venda
    - Omitir entry quando `closer_id` ou `sdr_id` for nulo; registrar no metadata do contrato
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.3 Escrever teste de propriedade — Propriedade 3: Fórmula de comissão automática
    - **Property 3: commission_value = ROUND(total_sales_value * commission_rate / 100, 2)**
    - **Validates: Requisitos 3.3, 20.2**

  - [x] 4.4 Escrever teste de propriedade — Propriedade 4: Consistência de vendas vinculadas
    - **Property 4: SUM(commission_entry_sales.value) == commission_entries.total_sales_value**
    - **Validates: Requisito 20.1**

  - [x] 4.5 Implementar cálculo de comissão para gerente de equipe
    - Buscar `team.lead_id`; calcular `total_sales_value` como soma dos primeiros pagamentos da equipe no mês
    - UPSERT `commission_entries` para o gerente; omitir se `lead_id` for nulo
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.6 Escrever teste de propriedade — Propriedade 5: total_sales_value do gerente
    - **Property 5: total_sales_value do gerente reflete total da equipe no mês**
    - **Validates: Requisitos 4.1, 4.2**

  - [x] 4.7 Implementar cálculo de comissão para diretoria (`is_board_member`)
    - Calcular `board_total` como soma de todos os payments pagos no mês da organização
    - UPSERT `commission_entries` para cada perfil com `is_board_member = true`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.8 Escrever teste de propriedade — Propriedade 6: total_sales_value da diretoria
    - **Property 6: total_sales_value da diretoria reflete faturamento total da organização**
    - **Validates: Requisitos 5.1, 5.2, 5.3**

  - [x] 4.9 Implementar função `check_and_apply_bonus`
    - Buscar goal ativa do colaborador no mês; selecionar tier correto (120/135/150); calcular `bonus_value`; atualizar `commission_entries`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 4.10 Escrever teste de propriedade — Propriedade 8: Seleção correta do tier de bônus
    - **Property 8: bonus_value calculado conforme tier correto (120/135/150)**
    - **Validates: Requisitos 6.2, 6.3, 6.4, 6.5, 6.6**

  - [x] 4.11 Implementar funções `update_goals_team_sales` e `update_goals_board_revenue`
    - Recalcular `current_value` de goals com `source = 'team_sales'` e `source = 'board_revenue'`
    - Não alterar goals com `source = 'manual'`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

- [x] 5. Checkpoint — Edge Function
  - Garantir que todos os fluxos da Edge Function estão implementados e os testes de propriedade das fórmulas passam.

- [x] 6. Componentes do módulo RH — novas abas do `EmployeeDetailModal`
  - [x] 6.1 Criar `src/components/team/CommissionConfigTab.tsx`
    - Formulário com campos `commission_rate`, `bonus_rate_120/135/150` (validação: não negativo)
    - Tabela de histórico de `commission_entries` (Mês/Ano, Comissão, Bônus, Contratos, Status)
    - Botão "Adicionar Bônus Manual" visível apenas para admin/owner em colaboradores não-comerciais e não-diretoria
    - Aba visível apenas para admin/owner
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 6.2 Escrever teste de propriedade — Propriedade 11: Persistência de taxas na CommissionConfigTab
    - **Property 11: taxas salvas na CommissionConfigTab são recuperadas sem alteração**
    - **Validates: Requisito 9.3**

  - [x] 6.3 Escrever teste de propriedade — Propriedade 12: Rejeição de taxas negativas
    - **Property 12: qualquer taxa negativa é rejeitada pelo sistema**
    - **Validates: Requisito 9.4**

  - [x] 6.4 Criar `src/components/team/CommissionDetailDialog.tsx`
    - Dialog com resumo da `commission_entry` (total vendas, comissão, % meta, bônus, status)
    - Tabela de `commission_entry_sales` (Cliente, Produto, Data Venda, Data Pagamento, Valor)
    - Estado vazio quando não há vendas
    - _Requirements: 10.2, 10.3, 10.4_

  - [x] 6.5 Criar `src/components/team/EmployeeAbsencesTab.tsx`
    - Listagem de `employee_absences` do colaborador
    - Formulário de criação (tipo, data_inicio, data_fim, status, observacao) com validação `data_fim >= data_inicio`
    - Ação de aprovar ausência pendente
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6_

  - [x] 6.6 Escrever teste de propriedade — Propriedade 15: Consistência de datas em ausências
    - **Property 15: data_fim < data_inicio é sempre rejeitado**
    - **Validates: Requisito 11.6**

  - [x] 6.7 Criar `src/components/team/EmployeeEvaluationsTab.tsx`
    - Listagem do histórico de avaliações do colaborador
    - Formulário de criação com campos `produtividade`, `qualidade`, `pontualidade`, `comportamento` (0–10) e `feedback`
    - Calcular e exibir `nota_final` como média aritmética dos quatro critérios
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

  - [x] 6.8 Escrever teste de propriedade — Propriedade 14: nota_final é média aritmética
    - **Property 14: nota_final = (produtividade + qualidade + pontualidade + comportamento) / 4**
    - **Validates: Requisito 12.2**

  - [x] 6.9 Criar `src/components/team/EmployeeGoalsTab.tsx`
    - Listar goals vinculadas ao colaborador com progresso atual e percentual de atingimento
    - Formulário para criar goal individual (gerente) ou de equipe (admin/owner), definindo `source` conforme tipo
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 6.10 Criar `src/components/team/EmployeeTrainingsTab.tsx`
    - Listagem de treinamentos do colaborador
    - Formulário de criação (nome, data, status, resultado)
    - Ação de marcar treinamento como concluído habilitando campo `resultado`
    - _Requirements: 13.1, 13.2, 13.4_

  - [x] 6.11 Criar `src/components/team/EmployeeDocumentsTab.tsx`
    - Upload de documentos para bucket `employee-documents` no Supabase Storage
    - Listagem de documentos (nome, tipo, data_upload) com ação de remoção
    - _Requirements: 14.1, 14.2, 14.4_

  - [x] 6.12 Criar `src/components/team/EmployeeScoreTab.tsx`
    - Exibir `Collaborator_Score` atual (composição ponderada: nota_final, % metas, comportamento)
    - Histórico de evolução do score e linha do tempo de eventos (promoções, aumentos, avaliações)
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 6.13 Atualizar `src/components/team/EmployeeDetailModal.tsx` — adicionar 7 novas abas
    - Integrar as abas: Férias e Ausências, Avaliação de Desempenho, Metas, Comissão e Bônus, Treinamentos, Documentos, Score e Histórico
    - Manter abas existentes: Dados Pessoais e Jornada
    - _Requirements: 10.5, 11.5, 12.3, 13.2, 14.2, 17.2_

- [x] 7. Checkpoint — Abas do EmployeeDetailModal
  - Garantir que todas as 9 abas renderizam sem erros e os hooks de dados estão corretamente conectados.

- [x] 8. Edições em componentes existentes
  - [x] 8.1 Atualizar `src/components/team/EditCollaboratorDialog.tsx`
    - Adicionar campo "Data de Admissão" mapeado para `metadata.hire_date` (tipo date, formato DD/MM/YYYY)
    - Remover campos `commission_percent`, `commission_rate`, `bonus_rate_*` do formulário
    - Ignorar `commission_percent` do metadata ao abrir o dialog (não remover do banco)
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

  - [x] 8.2 Atualizar `src/components/team/EmployeeFormModal.tsx`
    - Remover campos `commission_percent`, `commission_rate`, `bonus_rate_*` do formulário de cadastro
    - _Requirements: 9.7, 22.3_

  - [x] 8.3 Atualizar `src/components/layout/AppSidebar.tsx`
    - Renomear label "Equipe" → "RH" mantendo rota `/team` inalterada
    - _Requirements: 21.1, 21.2, 21.3_

  - [x] 8.4 Atualizar `src/components/kanban/LeadDetailsModal.tsx`
    - Adicionar campo de seleção de equipe (`team_id`) para admin/owner/manager em leads na etapa `qualificados`
    - Adicionar campo `sdr_id` (editável por manager/admin/owner) e `closer_id` (editável por member/manager/admin/owner)
    - Desabilitar `sdr_id` e `closer_id` com mensagem informativa quando `team_id` for nulo
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 8.5 Escrever teste de propriedade — Propriedade 1: Persistência de team_id, sdr_id e closer_id
    - **Property 1: campos team_id, sdr_id e closer_id persistidos e recuperados sem alteração**
    - **Validates: Requisitos 1.3, 2.2, 2.3**

- [x] 9. Dashboard RH
  - [x] 9.1 Criar `src/components/team/HRDashboard.tsx`
    - Cards de métricas: total colaboradores ativos, custo total de folha (soma de `base_salary`), desempenho médio por equipe, alertas ativos
    - Ranking de performance ordenado por `Collaborator_Score`
    - Seção de alertas: férias vencendo em 30 dias sem aprovação, metas próximas do prazo, excesso de horas extras (>20h/mês), colaboradores sem documentos
    - Acessível na rota `/team` para admin/owner
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [x] 9.2 Integrar `HRDashboard` na rota `/team`
    - Exibir o dashboard como visão principal do módulo RH para admin/owner
    - _Requirements: 16.6, 21.4_

- [x] 10. Testes de propriedade — arquivo consolidado
  - [x] 10.1 Criar `src/hooks/__tests__/useCommissionEntries.property.test.ts`
    - Implementar todas as propriedades de correção usando fast-check com `numRuns: 100`
    - Incluir: Propriedades 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
    - Cada propriedade em bloco separado com comentário de tag `Feature: commission-bonus-system, Property N`
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [x] 10.2 Escrever teste de propriedade — Propriedade 2: Commission_Entry criada para Closer e SDR
    - **Property 2: entry criada para closer e SDR no primeiro pagamento pago; nenhuma entry se ambos forem nulos**
    - **Validates: Requisitos 3.1, 3.2, 3.5, 3.6**

  - [x] 10.3 Escrever teste de propriedade — Propriedade 7: Round-trip de is_board_member
    - **Property 7: adicionar à equipe Diretoria → is_board_member = true; remover → false**
    - **Validates: Requisitos 5.4, 5.5**

  - [x] 10.4 Escrever teste de propriedade — Propriedade 9: Atualização de metas automáticas
    - **Property 9: current_value de goals team_sales/board_revenue reflete pagamentos do período**
    - **Validates: Requisitos 7.1, 7.2, 7.3, 7.4**

  - [x] 10.5 Escrever teste de propriedade — Propriedade 13: Cálculo de goal_achieved_pct
    - **Property 13: goal_achieved_pct = ROUND((current_value / goal_target) * 100, 2)**
    - **Validates: Requisito 20.3**

- [x] 11. Checkpoint final — Garantir que todos os testes passam
  - Executar `vitest --run` e confirmar que todos os testes de propriedade e unitários passam sem erros.

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada task referencia os requisitos específicos para rastreabilidade
- O campo `commission_percent` do metadata é legado — nunca gravar, apenas ignorar ao ler
- Migrations devem ser idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`)
- Testes de propriedade usam fast-check com mínimo de 100 iterações por propriedade
- Arquivo de testes PBT: `src/hooks/__tests__/useCommissionEntries.property.test.ts`
