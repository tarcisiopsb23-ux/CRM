# Documento de Requisitos

## Introdução

Este documento descreve os requisitos para a reformulação da aba "Acessos" dentro de Configurações do sistema CRM/HUB. O objetivo é tornar o controle de permissões granular, cobrindo todos os módulos e seus sub-escopos, com UX adequada (agrupamento por módulo, collapse/expand, busca, indicadores visuais de permissão herdada vs. override individual).

O sistema possui 19 módulos principais e atualmente apenas 3 deles (financial, team, settings) possuem sub-escopos mapeados. Os demais 16 módulos precisam ter seus sub-escopos definidos e expostos na interface.

## Glossário

- **Sistema**: O CRM/HUB como um todo.
- **Módulo**: Uma área funcional do sistema (ex: kanban, financial, team). Corresponde ao tipo `PermissionModule`.
- **Sub-escopo (scope)**: Uma seção ou funcionalidade específica dentro de um módulo (ex: `cashflow` dentro de `financial`).
- **Cargo**: Agrupamento de colaboradores com permissões compartilhadas (job_title).
- **Colaborador**: Usuário individual da organização (profile).
- **Permissão de Cargo**: Registro em `job_title_permissions` ou `job_title_permission_scopes` que define acesso padrão para todos os colaboradores de um cargo.
- **Override Individual**: Registro em `user_permissions` ou `user_permission_scopes` que sobrescreve a permissão do cargo para um colaborador específico.
- **Permissão Herdada**: Permissão que vem do cargo do colaborador, sem override individual.
- **Permissão Efetiva**: Resultado final após aplicar baseline, permissão de cargo, override individual e hard overrides de role.
- **Hard Override**: Regra de role que não pode ser sobrescrita (ex: owner sempre tem acesso total; settings bloqueado para não-admin).
- **MODULE_VIEWS**: Mapa de módulo → lista de sub-escopos com id e label.
- **Aba_Acessos**: O componente de UI que exibe e permite editar permissões por cargo ou colaborador.
- **Flags_CRUD**: Conjunto de quatro booleanos: `can_view`, `can_create`, `can_edit`, `can_delete`.
- **Normalização**: Regra que garante que se `can_view=false`, então `can_create`, `can_edit` e `can_delete` também são `false`.
- **CLIENT_ONLY_MODULES**: Módulos que existem apenas no frontend e não possuem enum no banco (`performance`, `integrations`).

---

## Requisitos

### Requisito 1: Mapeamento Completo de Sub-escopos

**User Story:** Como administrador, quero que todos os módulos do sistema tenham seus sub-escopos mapeados, para que eu possa configurar permissões granulares em cada área funcional.

#### Critérios de Aceitação

1. THE Sistema SHALL definir sub-escopos para todos os 19 módulos listados em `MODULES`, conforme o mapeamento abaixo:
   - `dashboard`: `overview`, `widgets`, `public_link`
   - `kanban`: `pipeline`, `lead_details`, `lead_create`
   - `crm`: `leads`, `contacts`, `pipeline_stages`
   - `sales_analytics`: `sales_dashboard`, `funnel`, `conversion`
   - `clients`: `client_list`, `client_details`, `contracts`
   - `financial`: `dashboard`, `cashflow`, `suppliers`, `expenses`, `receivables`, `payables`, `payroll`, `contracts`, `dre`, `reports`
   - `projects`: `project_list`, `project_details`, `tasks`
   - `agenda`: `events`, `calendar_view`
   - `goals`: `goals_list`, `assignments`, `tracking`
   - `whatsapp`: `conversations`, `contacts`, `broadcasts`
   - `meetings`: `meeting_list`, `ai_summaries`, `recordings`
   - `team`: `employees`, `teams`, `payroll`, `timeclock`, `timeclock_edit`, `evaluations_360`, `technical_evaluations`, `absences`, `trainings`, `documents`, `commissions`, `score`
   - `settings`: `permissions`, `integrations`, `general`
   - `reports`: `general_reports`, `campaign_reports`
   - `campaigns`: `campaign_list`, `campaign_reports`
   - `audit`: `audit_logs`
   - `timeclock`: `punch`, `history`, `timeclock_edit`
   - `performance`: `hub_dashboard`, `individual_metrics`
   - `integrations`: `api_keys`, `webhooks`, `third_party`

2. THE Sistema SHALL expor o mapeamento `MODULE_VIEWS` como fonte única de verdade para todos os componentes que renderizam sub-escopos.

3. WHEN um novo módulo for adicionado ao array `MODULES`, THE Sistema SHALL exigir que um entry correspondente seja adicionado ao `MODULE_VIEWS` antes de ser exibido na Aba_Acessos.

---

### Requisito 2: Interface Granular com Collapse/Expand por Módulo

**User Story:** Como administrador, quero visualizar e editar permissões de forma organizada por módulo com seções expansíveis, para que eu possa navegar facilmente em uma lista longa de módulos e sub-escopos.

#### Critérios de Aceitação

1. THE Aba_Acessos SHALL renderizar cada módulo como uma linha de cabeçalho expansível contendo as Flags_CRUD do módulo inteiro.

2. WHEN o usuário clica no cabeçalho de um módulo, THE Aba_Acessos SHALL alternar o estado de expansão daquele módulo (expandido ↔ colapsado).

3. WHILE um módulo está expandido, THE Aba_Acessos SHALL exibir uma sub-linha para cada sub-escopo do módulo, cada uma com suas próprias Flags_CRUD independentes.

4. THE Aba_Acessos SHALL iniciar com todos os módulos colapsados por padrão.

5. WHEN o usuário expande um módulo que não possui sub-escopos definidos em `MODULE_VIEWS`, THE Aba_Acessos SHALL exibir uma mensagem indicando que não há sub-escopos configuráveis para aquele módulo.

6. THE Aba_Acessos SHALL exibir um botão "Expandir todos" e um botão "Colapsar todos" para controle global do estado de expansão.

---

### Requisito 3: Busca e Filtro de Módulos e Sub-escopos

**User Story:** Como administrador, quero filtrar módulos e sub-escopos por nome, para que eu possa localizar rapidamente a permissão que desejo configurar.

#### Critérios de Aceitação

1. THE Aba_Acessos SHALL exibir um campo de busca textual acima da lista de módulos.

2. WHEN o usuário digita no campo de busca, THE Aba_Acessos SHALL filtrar a lista exibindo apenas módulos cujo label ou sub-escopos cujo label contenham o texto digitado (case-insensitive).

3. WHEN a busca retorna correspondência em um sub-escopo, THE Aba_Acessos SHALL expandir automaticamente o módulo pai para exibir o sub-escopo correspondente.

4. WHEN o campo de busca está vazio, THE Aba_Acessos SHALL exibir todos os módulos no estado de expansão anterior à busca.

5. IF a busca não retornar nenhum resultado, THEN THE Aba_Acessos SHALL exibir uma mensagem "Nenhum módulo ou sub-escopo encontrado para '[termo]'".

6. FOR ALL conjuntos de módulos M e texto de busca T, o conjunto de módulos exibidos após filtrar por T SHALL ser subconjunto de M (propriedade de filtragem).

---

### Requisito 4: Indicadores Visuais de Permissão Herdada vs. Override

**User Story:** Como administrador, quero identificar visualmente se uma permissão de um colaborador é herdada do cargo ou foi sobrescrita individualmente, para que eu possa auditar e gerenciar overrides com clareza.

#### Critérios de Aceitação

1. WHEN o escopo selecionado é "Colaborador", THE Aba_Acessos SHALL exibir um indicador visual distinto (ex: badge ou ícone) em cada linha de módulo ou sub-escopo que possua Override Individual ativo.

2. WHEN o escopo selecionado é "Colaborador" e uma permissão é Herdada (sem override), THE Aba_Acessos SHALL exibir as Flags_CRUD com estilo visual diferenciado (ex: cor mais suave ou ícone de herança) para indicar que o valor vem do cargo.

3. THE Aba_Acessos SHALL exibir um tooltip ou legenda explicando a diferença entre permissão herdada e override individual.

4. WHEN o administrador remove um Override Individual de um módulo ou sub-escopo, THE Aba_Acessos SHALL reverter o indicador visual para o estado de "herdado" e restaurar os valores do cargo.

5. FOR ALL colaboradores C com cargo J, se não existir override individual para o módulo M, a Permissão Efetiva exibida SHALL ser igual à Permissão de Cargo de J para M.

---

### Requisito 5: Granularidade CRUD por Sub-escopo

**User Story:** Como administrador, quero configurar as permissões can_view, can_create, can_edit e can_delete de forma independente para cada sub-escopo de cada módulo, para que eu possa ter controle fino sobre o que cada cargo ou colaborador pode fazer.

#### Critérios de Aceitação

1. THE Aba_Acessos SHALL exibir quatro checkboxes (Ver, Criar, Editar, Excluir) para cada sub-escopo de cada módulo.

2. WHEN o usuário altera uma Flag_CRUD de um sub-escopo, THE Sistema SHALL persistir a alteração na tabela `job_title_permission_scopes` (para cargo) ou `user_permission_scopes` (para colaborador).

3. THE Sistema SHALL aplicar Normalização: WHEN `can_view` é desmarcado para um sub-escopo, THE Sistema SHALL automaticamente desmarcar `can_create`, `can_edit` e `can_delete` para aquele sub-escopo.

4. FOR ALL sub-escopos S, se `can_view(S) = false`, então `can_create(S) = false` AND `can_edit(S) = false` AND `can_delete(S) = false` (invariante de normalização).

5. WHEN o usuário marca todas as Flags_CRUD de um sub-escopo via botão "Marcar tudo", THE Sistema SHALL aplicar Normalização antes de persistir.

6. THE Aba_Acessos SHALL exibir um botão de reset por sub-escopo que remove o registro de permissão de escopo, revertendo para o comportamento padrão do módulo pai.

---

### Requisito 6: Propagação de Alterações de Cargo para Colaboradores

**User Story:** Como administrador, quero que ao alterar a permissão de um cargo, os overrides individuais dos colaboradores daquele cargo sejam limpos automaticamente, para que a permissão do cargo seja aplicada de forma consistente.

#### Critérios de Aceitação

1. WHEN o administrador altera uma Permissão de Cargo para um módulo M, THE Sistema SHALL remover todos os registros de `user_permissions` para o módulo M de todos os colaboradores com aquele cargo.

2. WHEN o administrador altera uma Permissão de Cargo para um sub-escopo S do módulo M, THE Sistema SHALL remover todos os registros de `user_permission_scopes` para o módulo M e scope S de todos os colaboradores com aquele cargo.

3. IF a remoção de overrides falhar para algum colaborador, THEN THE Sistema SHALL registrar o erro no console e exibir um toast de aviso ao administrador sem reverter a alteração do cargo.

4. THE Sistema SHALL processar a remoção de overrides em lotes de no máximo 250 usuários por query para evitar timeouts.

---

### Requisito 7: Compatibilidade com Módulos CLIENT_ONLY

**User Story:** Como desenvolvedor, quero que os módulos que existem apenas no frontend (performance, integrations) não gerem queries de scope no banco de dados, para que não ocorram erros de enum inválido (22P02).

#### Critérios de Aceitação

1. THE Sistema SHALL manter o conjunto `CLIENT_ONLY_MODULES` contendo `performance` e `integrations`.

2. WHEN uma query de `user_permission_scopes` ou `job_title_permission_scopes` seria disparada para um módulo em `CLIENT_ONLY_MODULES`, THE Sistema SHALL suprimir a query e retornar array vazio.

3. THE Aba_Acessos SHALL exibir sub-escopos de `performance` e `integrations` apenas como controles de UI locais, sem persistência de scope no banco.

4. FOR ALL módulos M em `CLIENT_ONLY_MODULES`, nenhuma query de scope SHALL ser enviada ao Supabase (invariante de isolamento de CLIENT_ONLY).

---

### Requisito 8: Hard Overrides de Role

**User Story:** Como sistema, quero garantir que as regras de role (owner, admin, manager, member, viewer) sejam sempre aplicadas como camada final, para que nenhuma configuração de permissão possa conceder acesso além do permitido pelo role.

#### Critérios de Aceitação

1. THE Sistema SHALL aplicar `applyHardOverrides` como última etapa na resolução de Permissão Efetiva, após aplicar permissões de cargo e overrides individuais.

2. FOR ALL usuários U com role `owner`, a Permissão Efetiva SHALL ser `{canView: true, canCreate: true, canEdit: true, canDelete: true}` para qualquer módulo (invariante de owner).

3. FOR ALL usuários U com role diferente de `owner` ou `admin`, a Permissão Efetiva para o módulo `settings` SHALL ser `{canView: false, canCreate: false, canEdit: false, canDelete: false}`.

4. THE Aba_Acessos SHALL desabilitar a edição de permissões para usuários com role `owner`, exibindo uma mensagem indicando que o proprietário tem acesso irrestrito.

5. WHEN o administrador tenta salvar uma permissão que viola um Hard Override, THE Sistema SHALL ignorar silenciosamente a violação e aplicar o Hard Override na resolução final.

---

### Requisito 9: Performance e Usabilidade da Interface

**User Story:** Como administrador, quero que a aba de Acessos carregue e responda de forma fluida mesmo com muitos módulos e sub-escopos, para que a experiência de configuração seja agradável.

#### Critérios de Aceitação

1. THE Aba_Acessos SHALL exibir um indicador de carregamento (spinner) enquanto os dados de permissão estão sendo buscados do banco.

2. WHEN os dados estão carregados, THE Aba_Acessos SHALL renderizar todos os módulos em menos de 300ms (medido no cliente).

3. THE Aba_Acessos SHALL usar virtualização ou paginação se o número total de linhas (módulos + sub-escopos expandidos) exceder 100.

4. WHEN uma alteração de permissão é salva com sucesso, THE Aba_Acessos SHALL exibir um toast de confirmação e atualizar o estado local otimisticamente sem recarregar a página.

5. IF uma alteração de permissão falhar, THEN THE Aba_Acessos SHALL exibir um toast de erro com a mensagem do erro e reverter o estado local para o valor anterior.

---

### Requisito 10: Acessibilidade e Responsividade

**User Story:** Como administrador, quero que a aba de Acessos seja utilizável em diferentes tamanhos de tela e com teclado, para que eu possa configurar permissões em qualquer dispositivo.

#### Critérios de Aceitação

1. THE Aba_Acessos SHALL ser navegável por teclado, com foco visível em todos os controles interativos (checkboxes, botões, campo de busca).

2. THE Aba_Acessos SHALL adaptar o layout para telas menores que 768px, empilhando as colunas de Flags_CRUD verticalmente ou usando scroll horizontal controlado.

3. THE Aba_Acessos SHALL usar atributos `aria-label` e `aria-expanded` nos controles de collapse/expand para compatibilidade com leitores de tela.

4. THE Aba_Acessos SHALL manter contraste de cor adequado (mínimo 4.5:1) entre texto e fundo nos indicadores visuais de permissão herdada vs. override.
