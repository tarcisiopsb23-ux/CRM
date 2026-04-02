# Plano de Implementação: Client & Lead Improvements

## Visão Geral

Implementação incremental das melhorias no CRM React/TypeScript com Supabase, cobrindo: persistência de formulários, dropdowns padronizados, unificação de campos de contato, faturamento dinâmico, gestão de indicadores, isolamento do dashboard público e correção de queries/vinculação de dados.

## Tarefas

- [x] 1. Criar constantes de dropdown e arquivo de utilitários
  - [x] 1.1 Criar `src/constants/crmOptions.ts` com `ORIGEM_OPTIONS` e `NICHO_OPTIONS`
    - Exportar arrays `as const` com os valores exatos especificados
    - _Requisitos: 2.5, 2.6_
  - [ ]* 1.2 Escrever teste de propriedade para opções de dropdown
    - **Propriedade 3: Opções de dropdown são completas e fixas**
    - Verificar que `ORIGEM_OPTIONS` contém exatamente `["Indicação", "Prospecção", "Tráfego Pago", "Tráfego Orgânico", "Outra"]`
    - Verificar que `NICHO_OPTIONS` contém exatamente os 11 valores especificados
    - Arquivo: `src/constants/__tests__/crmOptions.property.test.ts`
    - **Valida: Requisitos 2.5, 2.6**

- [x] 2. Implementar hook `useFormPersistence`
  - [x] 2.1 Criar `src/hooks/useFormPersistence.ts`
    - Implementar assinatura `useFormPersistence<T>(key: string, initialValue: T): [T, (v: T) => void, () => void]`
    - Persistir estado no `sessionStorage` a cada mudança
    - Registrar listener `beforeunload` para limpar a chave em refresh
    - Registrar listener `popstate` para limpar a chave ao navegar para trás
    - Capturar exceções de `sessionStorage` indisponível (degradação graciosa)
    - _Requisitos: 1.1, 1.2, 1.3, 1.5, 1.6_
  - [x] 2.2 Integrar limpeza de chaves `form_*` ao evento de logout do `AuthContext`
    - Em `src/contexts/AuthContext.tsx`, ao executar logout, iterar `sessionStorage` e remover todas as chaves com prefixo `form_`
    - _Requisitos: 1.4_
  - [ ]* 2.3 Escrever teste de propriedade para round-trip de persistência
    - **Propriedade 1: Persistência de formulário é round-trip**
    - Usar `fc.record({ empresa: fc.string(), nicho: fc.option(fc.string()) })` como gerador
    - Verificar que salvar e ler do `sessionStorage` retorna os mesmos valores
    - Arquivo: `src/hooks/__tests__/useFormPersistence.property.test.ts`
    - **Valida: Requisitos 1.1, 1.2, 1.3**
  - [ ]* 2.4 Escrever teste de propriedade para limpeza no logout
    - **Propriedade 2: Logout limpa todas as chaves de formulário**
    - Usar `fc.array(fc.string({ minLength: 1 }))` para gerar conjuntos de chaves `form_*`
    - Verificar que após logout nenhuma chave `form_` permanece no `sessionStorage`
    - Arquivo: `src/hooks/__tests__/useFormPersistence.property.test.ts`
    - **Valida: Requisitos 1.4**

- [x] 3. Checkpoint — Garantir que testes passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 4. Substituir campos livres por dropdowns nos formulários de lead
  - [x] 4.1 Atualizar `src/components/kanban/NovoLeadDialog.tsx`
    - Importar `ORIGEM_OPTIONS` e `NICHO_OPTIONS` de `src/constants/crmOptions.ts`
    - Substituir `<Input>` de origem/source por `<Select>` com as opções de `ORIGEM_OPTIONS`
    - Substituir `<Input>` de nicho por `<Select>` com as opções de `NICHO_OPTIONS`
    - Integrar `useFormPersistence` com chave `form_lead_new`
    - _Requisitos: 2.3, 2.4, 2.5, 2.6, 1.1, 1.2_
  - [x] 4.2 Atualizar `src/components/kanban/LeadDetailsModal.tsx`
    - Substituir campos livres de origem e nicho por `<Select>` com as mesmas opções
    - Integrar `useFormPersistence` com chave `form_lead_{leadId}`
    - _Requisitos: 2.3, 2.4, 2.5, 2.6, 1.1, 1.2_
  - [ ]* 4.3 Escrever teste de propriedade para conversão lead→cliente
    - **Propriedade 4: Conversão de lead preserva origem e nicho**
    - Usar `fc.record({ source: fc.constantFrom(...ORIGEM_OPTIONS), nicho: fc.constantFrom(...NICHO_OPTIONS) })`
    - Verificar que cliente criado a partir do lead tem `origin === lead.source` e `niche === lead.nicho`
    - Arquivo: `src/hooks/__tests__/leadConversion.property.test.ts`
    - **Valida: Requisitos 2.8**

- [x] 5. Remover campos `responsible_name`/`responsible_phone` e implementar migração
  - [x] 5.1 Criar função `migrateResponsibleToDecisionMaker` em `src/utils/clientMigration.ts`
    - Implementar lógica: `decision_maker_name = decision_maker_name ?? responsible_name`
    - Implementar lógica: `decision_maker_phone = decision_maker_phone ?? responsible_phone`
    - _Requisitos: 3.9_
  - [x] 5.2 Atualizar formulário de cliente em `src/pages/ClientsPage.tsx`
    - Remover campos `responsible_name` e `responsible_phone` do estado do formulário e da UI
    - Manter apenas `decision_maker_name` e `decision_maker_phone`
    - Aplicar `migrateResponsibleToDecisionMaker` ao popular o formulário com dados existentes
    - Integrar `useFormPersistence` com chave `form_client_{clientId|"new"}`
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.9, 1.1, 1.2_
  - [x] 5.3 Atualizar formulário de lead para remover campos `responsible_*`
    - Em `NovoLeadDialog.tsx` e `LeadDetailsModal.tsx`, remover quaisquer referências a `responsible_name`/`responsible_phone`
    - Manter apenas `decision_maker_name` e `decision_maker_phone`
    - _Requisitos: 3.5, 3.6, 3.7, 3.8_
  - [ ]* 5.4 Escrever teste de propriedade para migração responsável→decisor
    - **Propriedade 5: Migração de responsável para decisor é não-destrutiva**
    - Usar `fc.record({ responsible_name: fc.option(fc.string()), decision_maker_name: fc.option(fc.string()) })`
    - Verificar que `decision_maker_name` é preservado quando já preenchido
    - Verificar que `responsible_name` é copiado quando `decision_maker_name` é nulo
    - Arquivo: `src/utils/__tests__/clientMigration.property.test.ts`
    - **Valida: Requisitos 3.9**

- [x] 6. Implementar hook `useDynamicRevenue` e faturamento dinâmico no formulário de cliente
  - [x] 6.1 Criar `src/hooks/useDynamicRevenue.ts`
    - Buscar `client_kpi_history` filtrando pelo KPI de faturamento (`unit === 'currency'` ou nome "Faturamento")
    - Filtrar valores `> 0`
    - Calcular média arredondada a 2 casas decimais
    - Retornar `{ dynamicRevenue: number | null, isLoading: boolean }`
    - Retornar `null` quando não há histórico válido
    - _Requisitos: 4.1, 4.7, 4.8_
  - [x] 6.2 Integrar `useDynamicRevenue` no formulário de cliente em `src/pages/ClientsPage.tsx`
    - Quando `dynamicRevenue !== null`: exibir campo Faturamento somente leitura com o valor calculado, ocultar campo manual
    - Quando `dynamicRevenue === null`: exibir campo Faturamento manual editável, ocultar campo dinâmico
    - _Requisitos: 4.2, 4.3, 4.5, 4.6_
  - [x] 6.3 Garantir que formulário de lead exibe apenas campo Faturamento manual editável
    - _Requisitos: 4.4_
  - [ ]* 6.4 Escrever teste de propriedade para cálculo de faturamento dinâmico
    - **Propriedade 6: Cálculo de faturamento dinâmico filtra e arredonda corretamente**
    - Usar `fc.array(fc.float({ min: -1000, max: 100000 }), { minLength: 0, maxLength: 50 })`
    - Verificar que valores `<= 0` são ignorados
    - Verificar que retorna `null` quando não há valores válidos
    - Verificar que a média é arredondada a exatamente 2 casas decimais
    - Arquivo: `src/hooks/__tests__/useDynamicRevenue.property.test.ts`
    - **Valida: Requisitos 4.1, 4.7, 4.8**

- [x] 7. Checkpoint — Garantir que testes passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 8. Estender `useClientKPIHistory` com mutações update/remove e atualizar `KPIPreviousHistory`
  - [x] 8.1 Adicionar mutações `update` e `remove` ao hook `useClientKPIHistory` em `src/hooks/useClientKPIs.ts`
    - Implementar `update`: PATCH em `client_kpi_history` por id
    - Implementar `remove`: DELETE em `client_kpi_history` por id
    - Invalidar query de histórico após cada mutação para recalcular `dynamicRevenue`
    - _Requisitos: 5.4, 5.6, 5.7_
  - [x] 8.2 Atualizar `src/components/clients/kpi-subtabs/KPIPreviousHistory.tsx`
    - Adicionar botão Editar por linha que abre formulário preenchido com dados atuais do indicador
    - Adicionar botão Excluir por linha com dialog de confirmação antes de prosseguir
    - Ao confirmar exclusão, chamar `remove` do hook
    - Ao confirmar edição, chamar `update` do hook
    - _Requisitos: 5.1, 5.2, 5.3, 5.5_
  - [ ]* 8.3 Escrever teste de propriedade para recálculo após mutação
    - **Propriedade 7: Recálculo após mutação de indicador é consistente**
    - Usar `fc.array(fc.record({ value: fc.float({ min: 0.01, max: 100000 }) }))`
    - Verificar que após exclusão de um registro, `dynamicRevenue` reflete o novo estado sem o registro
    - Verificar que após edição, `dynamicRevenue` reflete o valor atualizado
    - Arquivo: `src/hooks/__tests__/useClientKPIHistory.property.test.ts`
    - **Valida: Requisitos 5.7**

- [x] 9. Corrigir isolamento do dashboard público no `AuthContext`
  - [x] 9.1 Auditar `src/contexts/AuthContext.tsx` e garantir que o handler de logout não toca chaves `client_auth_*` no `localStorage`
    - Verificar que apenas chaves do sistema principal são removidas no logout
    - Garantir que chaves `client_auth_{slug}` permanecem intactas após logout do sistema principal
    - _Requisitos: 6.1, 6.4_
  - [ ]* 9.2 Escrever teste de propriedade para isolamento de sessão por slug
    - **Propriedade 8: Sessão do dashboard público é isolada por slug**
    - Usar `fc.string({ minLength: 1 })` para gerar slugs
    - Verificar que a chave usada é `client_auth_${slug}`
    - Verificar que logout do sistema principal não remove chaves `client_auth_*`
    - Arquivo: `src/hooks/__tests__/dashboardAuth.property.test.ts`
    - **Valida: Requisitos 6.3, 6.4**

- [x] 10. Corrigir queries no dashboard público e vincular blocos com dados reais
  - [x] 10.1 Corrigir tabelas consultadas em `src/hooks/useHubPerformance.ts`
    - Substituir referência à tabela `campaign_data` por `hub_performance_reports`
    - Substituir referência à tabela `daily_metrics` por `hub_performance_daily_metrics`
    - _Requisitos: 7.1, 7.2_
  - [x] 10.2 Vincular blocos do dashboard em `src/pages/PublicDashboardPage.tsx`
    - Bloco Investimento → coluna `total_spend` de `hub_performance_daily_metrics`
    - Bloco Leads → coluna `total_leads` de `hub_performance_daily_metrics`
    - Bloco Vendas → coluna `total_sales` de `hub_performance_daily_metrics`
    - Bloco Faturamento → coluna `revenue` de `hub_performance_daily_metrics`
    - Bloco ROAS → cálculo `revenue / total_spend`
    - Bloco Taxa de Conversão → cálculo `total_sales / total_leads * 100`
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 10.3 Vincular gráficos de evolução temporal e tabela de campanhas
    - Gráficos temporais → dados agrupados por data de `hub_performance_daily_metrics`
    - Tabela de campanhas → dados de `hub_performance_reports`
    - Exibir zero ou mensagem "Sem dados para o período" quando não houver dados
    - _Requisitos: 7.7, 8.7, 8.8_
  - [ ]* 10.4 Escrever teste de propriedade para cálculos de métricas de performance
    - **Propriedade 9: Cálculos de métricas de performance são corretos**
    - Usar `fc.record({ spend: fc.float({ min: 0.01 }), revenue: fc.float({ min: 0 }), leads: fc.integer({ min: 1 }), sales: fc.integer({ min: 0 }) })`
    - Verificar que `ROAS = revenue / total_spend`
    - Verificar que `taxa_conversao = (total_sales / total_leads) * 100`
    - Arquivo: `src/hooks/__tests__/hubPerformanceMetrics.property.test.ts`
    - **Valida: Requisitos 8.5, 8.6**
  - [ ]* 10.5 Escrever teste de propriedade para agrupamento temporal
    - **Propriedade 10: Dados temporais são agrupados por data corretamente**
    - Usar `fc.array(fc.record({ date: fc.string(), total_spend: fc.float({ min: 0 }) }))`
    - Verificar que registros com a mesma data têm valores somados sem duplicação ou perda
    - Arquivo: `src/hooks/__tests__/hubPerformanceMetrics.property.test.ts`
    - **Valida: Requisitos 8.7**

- [x] 11. Adicionar campos de origem e nicho no formulário de cliente
  - [x] 11.1 Atualizar formulário de cliente em `src/pages/ClientsPage.tsx`
    - Adicionar campo `origin` com `<Select>` usando `ORIGEM_OPTIONS`
    - Adicionar campo `niche` com `<Select>` usando `NICHO_OPTIONS`
    - _Requisitos: 2.1, 2.2, 2.5, 2.6, 2.7_

- [x] 12. Checkpoint final — Garantir que todos os testes passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Os checkpoints garantem validação incremental
- Testes de propriedade usam a biblioteca **fast-check** (compatível com Vitest/TypeScript)
- Cada teste de propriedade deve incluir o comentário: `// Feature: client-lead-improvements, Property N: <texto>`
- Os campos `responsible_name`/`responsible_phone` permanecem no banco de dados (sem DROP), apenas removidos da UI
