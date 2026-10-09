# Bugfix Requirements Document

## Introduction

O componente `ConversationKpiDashboard` e a aba "Atendimento" do dashboard público estão quebrados. A investigação identificou três causas raiz:

1. **500 Internal Server Error**: As views `client_conversation_kpis` e `client_agent_kpis` e a RPC `get_client_data` não existem no banco Supabase — nenhuma migration as criou. O hook `useClientConversationKpis` tenta consultar essas views e a página tenta chamar `get_client_data`, resultando em erro 500 para qualquer usuário que acesse o dashboard.

2. **Cálculo incorreto do "Tempo Médio de Atendimento"**: O cálculo atual em `AtendimentoSection` (dentro de `PublicDashboardPage.tsx`) considera apenas leads com `status = 'fechado'`, ignorando leads perdidos. O requisito é medir o tempo médio de vida de **todos** os leads concluídos no mês (fechados **e** perdidos), do cadastro até a conclusão.

3. **KPIs não respondem ao filtro de período do header**: O `dateRange` selecionado no `PeriodDropdown` do header é passado para `useClientConversationKpis` na `AtendimentoSection`, mas a query de `canalData` (leads do CRM) em `AtendimentoSection` busca **todos** os leads sem filtrar pelo período selecionado, fazendo com que os indicadores de canal, tempo médio e distribuição por status não reflitam o período escolhido.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN o usuário acessa a aba "Atendimento" do dashboard THEN o sistema retorna HTTP 500 ao tentar consultar as views `client_conversation_kpis` e `client_agent_kpis` que não existem no banco de dados

1.2 WHEN o usuário acessa o dashboard e a página chama a RPC `get_client_data` THEN o sistema retorna HTTP 500 pois a função não existe no Supabase

1.3 WHEN o dashboard exibe o KPI "Tempo Médio de Atendimento" THEN o sistema calcula a média apenas sobre leads com `status = 'fechado'`, excluindo leads com `status = 'perdido'`

1.4 WHEN o usuário seleciona um período diferente no filtro do header THEN o sistema exibe os dados de `canalData` (canal manual/auto, tempo médio, distribuição por status) sem aplicar o filtro de data, mostrando sempre o total histórico

### Expected Behavior (Correct)

2.1 WHEN o usuário acessa a aba "Atendimento" do dashboard THEN o sistema SHALL consultar as views `client_conversation_kpis` e `client_agent_kpis` com sucesso, retornando os dados de KPI de conversas

2.2 WHEN o dashboard carrega e chama `get_client_data` THEN o sistema SHALL executar a RPC com sucesso e retornar os dados do cliente autenticado

2.3 WHEN o dashboard exibe o KPI "Tempo Médio de Atendimento" THEN o sistema SHALL calcular a média de dias entre `created_at` e `updated_at` para todos os leads com `status IN ('fechado', 'perdido')` no período selecionado

2.4 WHEN o usuário seleciona um período no filtro do header THEN o sistema SHALL filtrar os dados de `canalData` pelo intervalo `created_at` entre `dateRange.from` e `dateRange.to`, atualizando canal manual/auto, tempo médio e distribuição por status

### Unchanged Behavior (Regression Prevention)

3.1 WHEN o usuário acessa a aba "Performance" do dashboard THEN o sistema SHALL CONTINUE TO exibir os dados de campanhas, métricas diárias e KPIs de negócio normalmente

3.2 WHEN o usuário acessa a aba "CRM" do dashboard THEN o sistema SHALL CONTINUE TO exibir o kanban de leads e as estatísticas do CrmSection normalmente

3.3 WHEN leads com `status = 'fechado'` existem no período selecionado THEN o sistema SHALL CONTINUE TO incluí-los no cálculo do tempo médio de atendimento

3.4 WHEN `client_conversation_kpis` retorna dados para o período selecionado THEN o sistema SHALL CONTINUE TO calcular totals, trend, byCampaign, bySource e byAgent corretamente no hook `useClientConversationKpis`

3.5 WHEN o usuário não tem dados de conversas cadastrados THEN o sistema SHALL CONTINUE TO exibir o estado vazio do `ConversationKpiDashboard` sem erros
