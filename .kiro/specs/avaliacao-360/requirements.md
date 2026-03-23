# Requirements Document

## Introduction

O módulo de Avaliação 360 substitui o modelo simples de avaliação individual (`employee_evaluations`) por um sistema estruturado de ciclos de avaliação a nível de agência. O sistema permite que RH crie ciclos, vincule avaliadores automaticamente, colete respostas de múltiplas perspectivas (autoavaliação, gestor, pares, liderados), consolide resultados e gere um score final por colaborador. O cadastro do colaborador passa a exibir apenas uma visão read-only do histórico de avaliações.

## Glossary

- **Sistema_360**: O módulo de Avaliação 360 como um todo.
- **Ciclo**: Período formal de avaliação com data de início, data de fim, status e tipo.
- **Avaliacao**: Registro de uma avaliação individual entre avaliador e avaliado dentro de um ciclo.
- **Avaliador**: Colaborador que responde uma avaliação (gestor, par, liderado ou o próprio avaliado).
- **Avaliado**: Colaborador que está sendo avaliado em um ciclo.
- **Criterio**: Dimensão de avaliação (comunicacao, trabalho_em_equipe, proatividade, responsabilidade, qualidade_entrega, alinhamento_cultural).
- **Resposta**: Nota (1–5) e comentário opcional para um critério dentro de uma avaliação.
- **Resultado_Final**: Consolidação das médias e score final de um colaborador em um ciclo.
- **Score_Final**: Valor calculado pela fórmula `(media_360 * peso_360) + (metas * peso_metas) + (produtividade * peso_prod)`.
- **RH**: Usuário com role `owner` ou `admin` responsável por criar e gerenciar ciclos.
- **Gestor**: Usuário com role `manager` responsável por avaliar membros da sua equipe e gerar feedback final.
- **Colaborador**: Usuário com role `member` que participa de ciclos como avaliado e/ou avaliador.
- **Organizacao**: Tenant isolado no sistema, identificado por `organization_id`.

---

## Requirements

### Requirement 1: Gestão de Ciclos de Avaliação

**User Story:** Como RH, quero criar e gerenciar ciclos de avaliação, para que eu possa organizar formalmente os períodos de avaliação da agência.

#### Acceptance Criteria

1. THE Sistema_360 SHALL armazenar ciclos com os campos: `id`, `organization_id`, `nome`, `data_inicio`, `data_fim`, `status` (ativo, encerrado), `tipo` (360, checkin).
2. WHEN o RH cria um ciclo com `data_inicio` posterior a `data_fim`, THE Sistema_360 SHALL rejeitar a operação e retornar uma mensagem de erro descritiva.
3. WHEN o RH encerra um ciclo, THE Sistema_360 SHALL atualizar o `status` para `encerrado` e bloquear qualquer nova resposta nesse ciclo.
4. WHILE um ciclo está com `status` igual a `encerrado`, THE Sistema_360 SHALL impedir a criação ou edição de avaliações vinculadas a esse ciclo.
5. THE Sistema_360 SHALL garantir que cada ciclo pertence a uma única `Organizacao`, isolando dados entre tenants via RLS.

---

### Requirement 2: Vinculação Automática de Avaliadores

**User Story:** Como RH, quero que o sistema vincule automaticamente os avaliadores ao criar um ciclo, para que eu não precise configurar manualmente cada relação de avaliação.

#### Acceptance Criteria

1. WHEN um ciclo é criado, THE Sistema_360 SHALL gerar automaticamente registros de `Avaliacao` para cada `Avaliado` com os tipos: `autoavaliacao` (o próprio colaborador), `gestor` (manager da equipe), `pares` (demais membros da mesma equipe) e `liderado` (membros de equipes gerenciadas pelo avaliado, quando aplicável).
2. WHEN o tipo de avaliação é `pares`, THE Sistema_360 SHALL definir o campo `anonimo` como `true` nos registros de `Avaliacao` correspondentes.
3. WHEN o tipo de avaliação é `autoavaliacao` ou `gestor`, THE Sistema_360 SHALL definir o campo `anonimo` como `false`.
4. IF um colaborador não pertence a nenhuma equipe no momento da criação do ciclo, THEN THE Sistema_360 SHALL criar apenas o registro de `autoavaliacao` para esse colaborador e registrar um log de aviso.

---

### Requirement 3: Resposta às Avaliações

**User Story:** Como colaborador ou gestor, quero responder às avaliações atribuídas a mim, para que minha perspectiva seja registrada no ciclo.

#### Acceptance Criteria

1. WHEN um usuário acessa uma avaliação com `status` igual a `pendente`, THE Sistema_360 SHALL exibir os seis critérios padrão: `comunicacao`, `trabalho_em_equipe`, `proatividade`, `responsabilidade`, `qualidade_entrega`, `alinhamento_cultural`.
2. WHEN o usuário submete uma avaliação, THE Sistema_360 SHALL validar que todos os seis critérios possuem nota entre 1 e 5 antes de persistir as respostas.
3. IF o usuário submete uma avaliação com nota fora do intervalo [1, 5] para qualquer critério, THEN THE Sistema_360 SHALL rejeitar a submissão e retornar uma mensagem de erro identificando o critério inválido.
4. WHEN uma avaliação é submetida com sucesso, THE Sistema_360 SHALL atualizar o `status` da avaliação para `concluido` e registrar a `data_resposta`.
5. WHILE uma avaliação possui `status` igual a `concluido`, THE Sistema_360 SHALL impedir qualquer edição nas respostas dessa avaliação.
6. WHILE um ciclo está com `status` igual a `encerrado`, THE Sistema_360 SHALL impedir a submissão de novas respostas para qualquer avaliação desse ciclo.

---

### Requirement 4: Anonimato nas Avaliações entre Pares

**User Story:** Como colaborador, quero que minhas avaliações de pares sejam anônimas, para que eu possa dar feedback honesto sem receio de exposição.

#### Acceptance Criteria

1. WHEN uma avaliação do tipo `pares` é exibida para o `Avaliado`, THE Sistema_360 SHALL omitir a identidade do `Avaliador` na interface e nas consultas retornadas ao frontend.
2. THE Sistema_360 SHALL garantir que a identidade do avaliador em avaliações anônimas não seja exposta via API, aplicando RLS para que o `avaliado_id` não possa consultar o `avaliador_id` de avaliações com `anonimo = true`.
3. WHEN um usuário com role `owner` ou `admin` consulta avaliações anônimas para fins de auditoria, THE Sistema_360 SHALL permitir o acesso ao `avaliador_id` mediante política RLS específica para administradores.

---

### Requirement 5: Consolidação Automática de Resultados

**User Story:** Como RH, quero que o sistema consolide automaticamente os resultados ao encerrar um ciclo, para que eu não precise calcular médias manualmente.

#### Acceptance Criteria

1. WHEN todas as avaliações de um colaborador em um ciclo estão com `status` igual a `concluido`, THE Sistema_360 SHALL calcular e persistir o `Resultado_Final` com `media_geral`, `media_autoavaliacao`, `media_pares` e `media_gestor`.
2. WHEN o RH encerra um ciclo, THE Sistema_360 SHALL disparar a consolidação automática para todos os colaboradores com avaliações pendentes, calculando médias parciais com base nas respostas já recebidas.
3. THE Sistema_360 SHALL calcular o `score_final` pela fórmula: `(media_360 * peso_360) + (metas * peso_metas) + (produtividade * peso_prod)`, onde os pesos são configuráveis por ciclo.
4. IF um colaborador não possui nenhuma avaliação concluída em um ciclo, THEN THE Sistema_360 SHALL registrar o `Resultado_Final` com todas as médias como `null` e `score_final` como `null`.

---

### Requirement 6: Feedback Final pelo Gestor

**User Story:** Como gestor, quero registrar um feedback final para cada colaborador após a consolidação, para que o colaborador tenha uma visão qualitativa do seu desempenho.

#### Acceptance Criteria

1. WHEN o `Resultado_Final` de um colaborador em um ciclo é gerado, THE Sistema_360 SHALL permitir que o `Gestor` registre um `feedback_final` textual nesse resultado.
2. WHILE um ciclo está com `status` igual a `encerrado`, THE Sistema_360 SHALL impedir a edição do `feedback_final` por qualquer usuário.
3. WHEN o `Gestor` salva o `feedback_final`, THE Sistema_360 SHALL registrar um log de auditoria com `user_id`, `timestamp` e o conteúdo anterior.

---

### Requirement 7: Visão Read-Only no Cadastro do Colaborador

**User Story:** Como gestor ou RH, quero visualizar o histórico de avaliações diretamente no cadastro do colaborador, para que eu tenha contexto de desempenho sem sair do perfil.

#### Acceptance Criteria

1. WHEN um usuário acessa a aba "Avaliações" no cadastro de um colaborador, THE Sistema_360 SHALL exibir o histórico de ciclos participados, as médias por período e a evolução de desempenho em modo somente leitura.
2. THE Sistema_360 SHALL exibir o `feedback_final` do gestor na aba de avaliações do colaborador quando disponível.
3. THE Sistema_360 SHALL impedir qualquer operação de criação, edição ou exclusão de avaliações a partir da aba do cadastro do colaborador.
4. WHEN o colaborador acessa seu próprio perfil, THE Sistema_360 SHALL exibir apenas os dados de avaliações onde o `avaliado_id` corresponde ao `id` do colaborador autenticado.

---

### Requirement 8: Dashboard de Gestão 360

**User Story:** Como RH ou gestor, quero um dashboard com visão consolidada dos resultados de avaliação, para que eu possa tomar decisões estratégicas sobre o time.

#### Acceptance Criteria

1. THE Sistema_360 SHALL exibir no dashboard: ranking de colaboradores por `score_final`, evolução de desempenho por colaborador entre ciclos, média por equipe e comparativo entre ciclos.
2. WHEN o dashboard é carregado, THE Sistema_360 SHALL exibir o gap entre `media_autoavaliacao` e a média das avaliações externas (`media_pares` + `media_gestor`) por colaborador.
3. THE Sistema_360 SHALL restringir o acesso ao dashboard a usuários com role `owner`, `admin` ou `manager`.
4. WHEN um gestor acessa o dashboard, THE Sistema_360 SHALL exibir apenas os dados dos colaboradores pertencentes às equipes gerenciadas por esse gestor.

---

### Requirement 9: Notificações e Alertas

**User Story:** Como colaborador, quero receber notificações sobre avaliações pendentes e prazos, para que eu não perca o prazo de resposta.

#### Acceptance Criteria

1. WHEN um ciclo é criado e avaliações são geradas, THE Sistema_360 SHALL disparar uma notificação de início de ciclo para todos os avaliadores com avaliações pendentes.
2. WHEN uma avaliação permanece com `status` igual a `pendente` e faltam 48 horas para o encerramento do ciclo, THE Sistema_360 SHALL disparar um lembrete para o avaliador responsável.
3. WHEN um ciclo atinge a `data_fim` sem ser encerrado manualmente, THE Sistema_360 SHALL disparar um alerta para o RH informando que o ciclo está vencido.
4. WHEN o `Resultado_Final` de um colaborador é gerado, THE Sistema_360 SHALL disparar uma notificação para o colaborador informando que o resultado está disponível.

---

### Requirement 10: Rastreabilidade e Logs de Auditoria

**User Story:** Como RH, quero que todas as alterações relevantes sejam registradas em log, para que eu tenha rastreabilidade completa do histórico de avaliações.

#### Acceptance Criteria

1. THE Sistema_360 SHALL registrar um log de auditoria para cada operação de criação, atualização ou encerramento de ciclo, contendo `user_id`, `action`, `timestamp` e o estado anterior do registro.
2. THE Sistema_360 SHALL registrar um log de auditoria para cada submissão de avaliação, contendo `avaliacao_id`, `avaliador_id`, `timestamp` e as notas submetidas.
3. THE Sistema_360 SHALL manter o histórico completo de avaliações e resultados, sem permitir exclusão física de registros de avaliações concluídas.
4. IF uma tentativa de exclusão de avaliação concluída é realizada, THEN THE Sistema_360 SHALL rejeitar a operação e retornar um erro descritivo.

---

### Requirement 12: Avaliação Técnica Manual

**User Story:** Como RH, quero registrar avaliações técnicas pontuais diretamente no perfil do colaborador, para que eu possa documentar avaliações manuais fora dos ciclos 360 formais.

#### Acceptance Criteria

1. WHEN um usuário com role `admin` ou `owner` acessa a aba "Avaliações" do cadastro de um colaborador, THE Sistema_360 SHALL exibir um botão "+ Avaliação Técnica" visível apenas para esses roles.
2. WHEN o RH preenche e submete o formulário de avaliação técnica com `titulo`, `data`, `nota_geral` (1–5) e ao menos um critério técnico, THE Sistema_360 SHALL persistir o registro em `avaliacoes_tecnicas` vinculado ao colaborador e à organização.
3. WHEN o RH tenta submeter uma avaliação técnica com `nota_geral` fora do intervalo [1, 5], THE Sistema_360 SHALL rejeitar a operação e retornar uma mensagem de erro descritiva.
4. WHEN o RH tenta submeter uma avaliação técnica com `titulo` vazio ou em branco, THE Sistema_360 SHALL rejeitar a operação e manter o estado atual do formulário.
5. WHEN uma avaliação técnica é criada com sucesso, THE Sistema_360 SHALL exibi-la na aba "Avaliações" do colaborador em seção separada das avaliações 360, ordenada por data decrescente.
6. WHILE uma avaliação técnica está persistida, THE Sistema_360 SHALL impedir qualquer edição ou exclusão desse registro (imutabilidade após criação).
7. WHEN um gestor da equipe do colaborador ou o próprio colaborador acessa a aba "Avaliações", THE Sistema_360 SHALL exibir as avaliações técnicas em modo somente leitura, sem o botão de criação.
8. THE Sistema_360 SHALL aplicar RLS na tabela `avaliacoes_tecnicas` garantindo que apenas usuários da mesma organização possam visualizar os registros.

---

### Requirement 11: Isolamento por Organização (Multi-tenant)

**User Story:** Como proprietário da plataforma, quero que os dados de avaliação sejam isolados por organização, para que nenhuma agência acesse dados de outra.

#### Acceptance Criteria

1. THE Sistema_360 SHALL aplicar RLS em todas as tabelas (`ciclos_avaliacao`, `avaliacoes`, `respostas_avaliacao`, `resultado_final`) filtrando por `organization_id`.
2. WHEN um usuário autenticado realiza qualquer operação no módulo 360, THE Sistema_360 SHALL validar que o `organization_id` do recurso acessado corresponde ao `organization_id` do perfil autenticado.
3. IF uma requisição tenta acessar dados de uma organização diferente da do usuário autenticado, THEN THE Sistema_360 SHALL retornar um erro de autorização sem expor dados do recurso solicitado.
