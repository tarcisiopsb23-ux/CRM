# Tasks — Módulo de Avaliação 360

## Task List

- [x] 1 Banco de dados — Migrations e RPCs
  - [x] 1.1 Migration 00091: criar tabela `ciclos_avaliacao` com constraints e RLS
  - [x] 1.2 Migration 00092: criar tabela `avaliacoes_360` com constraints e RLS
  - [x] 1.3 Migration 00093: criar tabela `respostas_avaliacao_360` com constraints e RLS (imutabilidade)
  - [x] 1.4 Migration 00094: criar tabela `resultado_final_360` com constraints e RLS
  - [x] 1.5 Migration 00095: criar tabela `audit_log_360` com RLS
  - [x] 1.6 Migration 00096: criar tabela `avaliacoes_tecnicas` com constraints e RLS (imutabilidade)
  - [x] 1.7 Criar RPC `generate_360_avaliacoes` e trigger `after_ciclo_insert`
  - [x] 1.8 Criar RPC `close_ciclo` que atualiza status e invoca Edge Function `consolidate-360`

- [x] 2 Edge Function `consolidate-360`
  - [x] 2.1 Criar `supabase/functions/consolidate-360/index.ts` com lógica de cálculo de médias e score_final
  - [x] 2.2 Implementar inserção de notificações ao consolidar resultados
  - [x] 2.3 Implementar inserção em `audit_log_360` ao encerrar ciclo

- [x] 3 Tipos TypeScript
  - [x] 3.1 Criar `src/types/avaliacao360.ts` com todos os tipos: `CicloAvaliacao`, `Avaliacao360`, `RespostaAvaliacao`, `ResultadoFinal360`, `CriterioTecnico`, `AvaliacaoTecnica`

- [x] 4 Hook `useAvaliacao360`
  - [x] 4.1 Criar `src/hooks/useAvaliacao360.ts` com `useCiclos`, `useCreateCiclo`, `useCloseCiclo`
  - [x] 4.2 Adicionar `useAvaliacoesPendentes`, `useAvaliacoesDoCiclo`, `useSubmitAvaliacao`
  - [x] 4.3 Adicionar `useResultados`, `useResultadoDoColaborador`, `useSaveFeedbackFinal`

- [x] 5 Hook `useAvaliacoesTecnicas`
  - [x] 5.1 Criar `src/hooks/useAvaliacoesTecnicas.ts` com `useAvaliacoesTecnicas` (query ordenada por data DESC) e `useCreateAvaliacaoTecnica` (mutation com invalidação de cache)

- [x] 6 Componentes do módulo 360
  - [x] 6.1 Criar `src/components/avaliacao360/CiclosList.tsx` — lista de ciclos com status, datas e ações
  - [x] 6.2 Criar `src/components/avaliacao360/CicloForm.tsx` — formulário de criação/edição de ciclo
  - [x] 6.3 Criar `src/components/avaliacao360/CicloDetail.tsx` — detalhe do ciclo com avaliações pendentes/concluídas
  - [x] 6.4 Criar `src/components/avaliacao360/AvaliacaoForm.tsx` — formulário de resposta com 6 critérios (notas 1–5)
  - [x] 6.5 Criar `src/components/avaliacao360/ResultadoCard.tsx` — card de resultado consolidado por colaborador
  - [x] 6.6 Criar `src/components/avaliacao360/Dashboard360Widget.tsx` — widget de ranking e gap para HRDashboard

- [x] 7 Componente `AvaliacaoTecnicaDialog`
  - [x] 7.1 Criar `src/components/team/AvaliacaoTecnicaDialog.tsx` com formulário: título, data, nota_geral (1–5), critérios dinâmicos (nome + nota + comentário), observações
  - [x] 7.2 Implementar validação de `titulo` (não pode ser vazio/whitespace) e `nota_geral` (1–5) antes de submeter
  - [x] 7.3 Integrar com `useCreateAvaliacaoTecnica` e fechar dialog + toast de sucesso no `onSuccess`

- [x] 8 Atualização do `EmployeeEvaluationsTab`
  - [x] 8.1 Adicionar seção "Avaliações Técnicas" abaixo do histórico 360, com lista de `avaliacoes_tecnicas` ordenada por data DESC
  - [x] 8.2 Exibir botão "+ Avaliação Técnica" condicionalmente apenas para `role IN ('admin', 'owner')` usando `useProfile` do usuário autenticado
  - [x] 8.3 Integrar `AvaliacaoTecnicaDialog` ao botão e passar `profile.id` e `organization_id` como props

- [x] 9 Página `Avaliacao360Page`
  - [x] 9.1 Criar `src/pages/Avaliacao360Page.tsx` com rota `/team/360`, integrando `CiclosList`, `CicloForm` e `CicloDetail`
  - [x] 9.2 Registrar rota em `src/App.tsx` protegida por `ModuleGuard` para roles `admin`, `owner`, `manager`

- [x] 10 Integração com `HRDashboard`
  - [x] 10.1 Adicionar `Dashboard360Widget` ao `HRDashboard` existente

- [x] 11 Testes de propriedade — Requisitos 1–11
  - [x] 11.1 [PBT] Propriedade 1: round-trip de criação de ciclo — `fc.assert` com campos válidos aleatórios
  - [x] 11.2 [PBT] Propriedade 2: rejeição de ciclo com `data_inicio > data_fim`
  - [x] 11.3 [PBT] Propriedade 3: ciclo encerrado bloqueia operações de escrita
  - [x] 11.4 [PBT] Propriedade 4: isolamento multi-tenant via RLS (tabelas 360)
  - [x] 11.5 [PBT] Propriedade 5: completude da vinculação automática de avaliadores
  - [x] 11.6 [PBT] Propriedade 6: campo `anonimo` correto por tipo de avaliação
  - [x] 11.7 [PBT] Propriedade 7: validação de notas no intervalo [1, 5]
  - [x] 11.8 [PBT] Propriedade 8: round-trip de submissão de avaliação
  - [x] 11.9 [PBT] Propriedade 9: imutabilidade de avaliações concluídas
  - [x] 11.10 [PBT] Propriedade 10: anonimato de avaliações de pares para o avaliado
  - [x] 11.11 [PBT] Propriedade 11: acesso privilegiado de admin/owner a avaliações anônimas
  - [x] 11.12 [PBT] Propriedade 12: completude do resultado_final após consolidação
  - [x] 11.13 [PBT] Propriedade 13: fórmula do score_final
  - [x] 11.14 [PBT] Propriedade 14: feedback_final bloqueado em ciclo encerrado
  - [x] 11.15 [PBT] Propriedade 15: auditoria de operações relevantes
  - [x] 11.16 [PBT] Propriedade 16: colaborador vê apenas seus próprios resultados
  - [x] 11.17 [PBT] Propriedade 17: cálculo do gap de autoavaliação
  - [x] 11.18 [PBT] Propriedade 18: controle de acesso ao dashboard 360
  - [x] 11.19 [PBT] Propriedade 19: escopo de dados do gestor no dashboard
  - [x] 11.20 [PBT] Propriedade 20: notificação de início de ciclo para todos os avaliadores
  - [x] 11.21 [PBT] Propriedade 21: notificação de resultado disponível

- [x] 12 Testes de propriedade — Requisito 12 (Avaliação Técnica)
  - [x] 12.1 [PBT] Propriedade 22: visibilidade do botão de avaliação técnica por role
  - [x] 12.2 [PBT] Propriedade 23: round-trip de criação de avaliação técnica
  - [x] 12.3 [PBT] Propriedade 24: rejeição de `nota_geral` inválida
  - [x] 12.4 [PBT] Propriedade 25: rejeição de título em branco (whitespace)
  - [x] 12.5 [PBT] Propriedade 26: ordenação por data decrescente
  - [x] 12.6 [PBT] Propriedade 27: imutabilidade de avaliações técnicas
  - [x] 12.7 [PBT] Propriedade 28: isolamento multi-tenant para `avaliacoes_tecnicas`

- [x] 13 Testes unitários
  - [x] 13.1 Renderização do `AvaliacaoForm` com os 6 critérios
  - [x] 13.2 Exibição do histórico read-only na `EmployeeEvaluationsTab` (seção 360 e seção técnica)
  - [x] 13.3 Exibição do `feedback_final` quando disponível no `ResultadoCard`
  - [x] 13.4 Comportamento do `Dashboard360Widget` com dados mockados
  - [x] 13.5 Validação de formulário no `AvaliacaoTecnicaDialog` (título vazio, nota inválida)
  - [x] 13.6 Ocultação do botão "+ Avaliação Técnica" para roles não autorizados
