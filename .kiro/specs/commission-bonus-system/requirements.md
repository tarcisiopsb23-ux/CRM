# Documento de Requisitos

## Introdução

Sistema de comissões, bônus e gestão de RH para o CRM/ERP Maestr.IA. O fluxo de leads é 100% manual: o LDR qualifica e insere leads, o RH/gerente distribui manualmente para uma equipe, o SDR conduz até o agendamento e indica o Closer, e o Closer fecha a venda. Não existe round-robin automático. As comissões são calculadas com base no primeiro pagamento pago de contratos cujos leads estão em `efetivados`. O módulo "Equipe" é renomeado para "RH" e passa a centralizar cadastro de colaboradores, jornada, férias/ausências, avaliação de desempenho, metas, comissão/bônus, treinamentos e documentos.

---

## Glossário

- **Commission_Calculator**: Serviço/lógica responsável por calcular comissões e bônus automaticamente.
- **Commission_Entry**: Registro de comissão/bônus de um colaborador para um mês de referência (tabela `commission_entries`).
- **Commission_Entry_Sale**: Linha de detalhe de venda vinculada a uma `Commission_Entry` (tabela `commission_entry_sales`).
- **LDR**: Colaborador responsável por qualificar leads recebidos e incluí-los manualmente no sistema (etapa `leads_recebidos`).
- **SDR**: Colaborador responsável por conduzir o lead da etapa `reuniao_agendada` até o agendamento, indicando o Closer responsável.
- **Closer**: Colaborador responsável pelo fechamento da venda, indicado pelo SDR no lead na etapa `reuniao_agendada`.
- **Lead**: Registro de oportunidade de venda no kanban (tabela `leads`), com campos `sdr_id`, `closer_id` e `team_id`.
- **Team**: Equipe da organização (tabela `teams`). Equipes do tipo `comercial` participam do fluxo de vendas.
- **Goal**: Meta vinculada a um colaborador ou equipe (tabela `goals`), com campo `source` (`manual` | `team_sales` | `board_revenue`).
- **Payment**: Registro de pagamento de contrato (tabela `payments`), com campos `status`, `paid_at` e `contract_id`.
- **Contract**: Contrato de cliente (tabela `contracts`), com campo `first_payment_value`.
- **Profile**: Perfil de colaborador (tabela `profiles`), com campos `commission_rate`, `bonus_rate_120`, `bonus_rate_135`, `bonus_rate_150` e `is_board_member`.
- **Board_Member**: Colaborador com `is_board_member = true`, pertencente à equipe "Diretoria".
- **HR_Manager**: Usuário com papel `admin` ou `owner` responsável pela gestão do módulo RH.
- **CommissionConfigTab**: Aba dedicada de configuração de comissão/bônus no detalhe do colaborador, substitui os campos `commission_percent`/`commission_rate` e `bonus_rate_*` do formulário de cadastro.
- **CollaboratorCommissionsTab**: Aba de histórico de comissões no detalhe do colaborador na UI.
- **CommissionDetailDialog**: Dialog de detalhe de uma Commission_Entry, exibindo resumo e lista de vendas.
- **LeadDetailsModal**: Modal de detalhes do lead no kanban.
- **EmployeeDetailModal**: Modal/página de detalhe do colaborador no módulo RH.
- **month_reference**: Data no formato `YYYY-MM-01` representando o mês/ano de referência da comissão.
- **SDR_Assignment**: Ação do SDR de assumir um lead e preencher o campo `closer_id` ao agendar reunião.
- **Employee_Absence**: Registro de férias ou ausência de colaborador (tabela `employee_absences`).
- **Employee_Evaluation**: Registro de avaliação de desempenho de colaborador (tabela `employee_evaluations`).
- **Employee_Training**: Registro de treinamento de colaborador (tabela `employee_trainings`).
- **Collaborator_Score**: Pontuação composta do colaborador baseada em desempenho, metas e comportamento.

---

## Requisitos

### Requisito 1: Fluxo Manual de Leads (LDR → Distribuição → SDR → Closer)

**User Story:** Como LDR, quero qualificar e inserir leads manualmente no sistema, para que o funil de vendas reflita apenas oportunidades reais e qualificadas.

#### Critérios de Aceitação

1. WHEN o LDR acessa o kanban, THE Lead SHALL ser criado manualmente pelo LDR na etapa `leads_recebidos` com preenchimento dos critérios de qualificação.
2. WHEN o HR_Manager ou gerente acessa um lead na etapa `qualificados`, THE LeadDetailsModal SHALL exibir um campo de seleção de equipe para preenchimento manual do `team_id`.
3. WHEN o `team_id` é preenchido manualmente, THE Lead SHALL ter o campo `team_id` persistido na tabela `leads`.
4. THE System SHALL não possuir nenhuma lógica de distribuição automática (round-robin) de leads entre equipes.
5. IF o lead não possui `team_id` definido, THEN THE LeadDetailsModal SHALL exibir os campos `sdr_id` e `closer_id` desabilitados com mensagem informativa.
6. WHEN o lead avança para `efetivados` e o primeiro pagamento é registrado como pago, THE Commission_Calculator SHALL contabilizar a venda para o Closer e para o SDR indicados no lead.

### Requisito 2: Indicação de SDR e Closer no Lead (SDR_Assignment)

**User Story:** Como SDR, quero assumir um lead e indicar o Closer responsável ao agendar a reunião, para que as comissões sejam calculadas corretamente para cada colaborador.

#### Critérios de Aceitação

1. WHEN o SDR acessa o LeadDetailsModal de um lead na etapa `reuniao_agendada`, THE LeadDetailsModal SHALL exibir um campo de seleção de Closer com os membros da equipe do lead.
2. WHEN o SDR seleciona um Closer no LeadDetailsModal, THE Lead SHALL ter o campo `closer_id` atualizado na tabela `leads`.
3. WHEN o SDR assume um lead, THE Lead SHALL ter o campo `sdr_id` preenchido com o `id` do SDR na tabela `leads`.
4. THE LeadDetailsModal SHALL permitir que usuários com papel `member` (SDR), `manager`, `admin` ou `owner` preencham o campo `closer_id`.
5. THE LeadDetailsModal SHALL permitir que usuários com papel `manager`, `admin` ou `owner` editem o campo `sdr_id`.
6. IF o lead não possui `team_id` definido, THEN THE LeadDetailsModal SHALL exibir os campos `sdr_id` e `closer_id` desabilitados com mensagem informativa.

### Requisito 3: Cálculo Automático de Comissão para Closer e SDR

**User Story:** Como Closer ou SDR, quero que minha comissão seja calculada automaticamente quando o primeiro pagamento de um contrato efetivado é registrado como pago, para que eu receba o valor correto sem intervenção manual.

#### Critérios de Aceitação

1. WHEN um Payment com `status = 'pago'` é registrado e é o primeiro pagamento de um Contract cujo Lead está na etapa `efetivados`, THE Commission_Calculator SHALL criar ou atualizar uma Commission_Entry para o Closer indicado no lead, usando o mês de `paid_at` como `month_reference`.
2. WHEN um Payment com `status = 'pago'` é registrado e é o primeiro pagamento de um Contract cujo Lead está na etapa `efetivados`, THE Commission_Calculator SHALL criar ou atualizar uma Commission_Entry para o SDR indicado no lead, usando o mês de `paid_at` como `month_reference`.
3. THE Commission_Calculator SHALL calcular `commission_value` como `first_payment_value * (commission_rate / 100)`, onde `commission_rate` é o valor do campo `commission_rate` do Profile do colaborador.
4. WHEN o Commission_Calculator cria uma Commission_Entry, THE Commission_Calculator SHALL criar um registro em `commission_entry_sales` vinculando o contrato à entrada, com os campos `contract_id`, `client_name`, `product`, `sale_date`, `first_payment_date` e `value`.
5. IF o lead não possui `closer_id` definido, THEN THE Commission_Calculator SHALL omitir a criação de Commission_Entry para o Closer e registrar o evento nos metadados do contrato.
6. IF o lead não possui `sdr_id` definido, THEN THE Commission_Calculator SHALL omitir a criação de Commission_Entry para o SDR e registrar o evento nos metadados do contrato.
7. THE Commission_Calculator SHALL usar o mês do campo `paid_at` do primeiro Payment como `month_reference`, independentemente da data da venda ou da data de criação do contrato.

### Requisito 4: Cálculo Automático de Comissão para Gerente de Equipe Comercial

**User Story:** Como gerente de equipe comercial, quero que minha comissão seja calculada automaticamente sobre o total de vendas da minha equipe no mês, para que eu seja remunerado proporcionalmente ao desempenho coletivo.

#### Critérios de Aceitação

1. WHEN o Commission_Calculator processa comissões do mês, THE Commission_Calculator SHALL calcular o total de `first_payment_value` de todos os Contracts cujos Leads têm `team_id` igual ao `id` da equipe gerenciada e cujos primeiros Payments têm `paid_at` no mês de referência.
2. THE Commission_Calculator SHALL criar ou atualizar uma Commission_Entry para o gerente da equipe com `total_sales_value` igual à soma calculada no critério anterior.
3. THE Commission_Calculator SHALL calcular `commission_value` do gerente como `total_sales_value * (commission_rate / 100)`, usando o `commission_rate` do Profile do gerente.
4. THE Commission_Calculator SHALL identificar o gerente da equipe pelo campo `lead_id` da tabela `teams`.
5. IF a equipe não possui `lead_id` definido, THEN THE Commission_Calculator SHALL omitir a criação de Commission_Entry para o gerente e registrar o evento no log de processamento.

---

### Requisito 5: Cálculo Automático de Comissão para Diretoria

**User Story:** Como membro da diretoria, quero que minha comissão seja calculada sobre o faturamento total da organização no mês, para que minha remuneração reflita o desempenho global do negócio.

#### Critérios de Aceitação

1. WHEN o Commission_Calculator processa comissões do mês, THE Commission_Calculator SHALL calcular o faturamento total da organização como a soma de todos os Payments com `status = 'pago'` e `paid_at` no mês de referência.
2. THE Commission_Calculator SHALL criar ou atualizar uma Commission_Entry para cada Profile com `is_board_member = true` na organização, com `total_sales_value` igual ao faturamento total calculado.
3. THE Commission_Calculator SHALL calcular `commission_value` de cada Board_Member como `total_sales_value * (commission_rate / 100)`, usando o `commission_rate` do Profile.
4. WHEN um Profile é adicionado à equipe com nome "Diretoria", THE Profile SHALL ter o campo `is_board_member` atualizado para `true` automaticamente via trigger de banco de dados.
5. WHEN um Profile é removido da equipe com nome "Diretoria", THE Profile SHALL ter o campo `is_board_member` atualizado para `false` automaticamente via trigger de banco de dados.

### Requisito 6: Cálculo de Bônus por Tiers de Meta

**User Story:** Como colaborador com meta vinculada, quero receber bônus automaticamente quando atingir os tiers de meta definidos, para que meu esforço adicional seja recompensado.

#### Critérios de Aceitação

1. WHEN o Commission_Calculator finaliza o cálculo de comissão de um colaborador para um mês, THE Commission_Calculator SHALL verificar se existe uma Goal ativa para o colaborador com `period_start` e `period_end` cobrindo o `month_reference`.
2. WHEN a Goal do colaborador tem `current_value >= 1.20 * target_value` e `current_value < 1.35 * target_value`, THE Commission_Calculator SHALL calcular `bonus_value` como `total_sales_value * (bonus_rate_120 / 100)`.
3. WHEN a Goal do colaborador tem `current_value >= 1.35 * target_value` e `current_value < 1.50 * target_value`, THE Commission_Calculator SHALL calcular `bonus_value` como `total_sales_value * (bonus_rate_135 / 100)`.
4. WHEN a Goal do colaborador tem `current_value >= 1.50 * target_value`, THE Commission_Calculator SHALL calcular `bonus_value` como `total_sales_value * (bonus_rate_150 / 100)`.
5. IF a Goal do colaborador não foi atingida (`current_value < 1.20 * target_value`), THEN THE Commission_Calculator SHALL definir `bonus_value` como `0` na Commission_Entry.
6. IF não existe Goal ativa para o colaborador no mês de referência, THEN THE Commission_Calculator SHALL definir `bonus_value` como `0` na Commission_Entry.
7. THE Commission_Calculator SHALL registrar na Commission_Entry os campos `goal_id`, `goal_target`, `goal_achieved_pct` e `bonus_rate` utilizados no cálculo.

---

### Requisito 7: Atualização Automática de Metas por Fonte

**User Story:** Como gestor, quero que as metas com fonte `team_sales` e `board_revenue` tenham seus valores atualizados automaticamente quando pagamentos são registrados, para que o progresso das metas reflita a realidade em tempo real.

#### Critérios de Aceitação

1. WHEN um Payment com `status = 'pago'` é registrado, THE Commission_Calculator SHALL recalcular o `current_value` de todas as Goals com `source = 'team_sales'` cujo `team_id` corresponde ao `team_id` do Lead vinculado ao contrato do Payment.
2. WHEN um Payment com `status = 'pago'` é registrado, THE Commission_Calculator SHALL recalcular o `current_value` de todas as Goals com `source = 'board_revenue'` da organização.
3. THE Commission_Calculator SHALL recalcular `current_value` das Goals com `source = 'team_sales'` como a soma de `first_payment_value` de todos os Contracts cujos Leads têm o `team_id` da Goal e cujos primeiros Payments têm `paid_at` dentro do `period_start` e `period_end` da Goal.
4. THE Commission_Calculator SHALL recalcular `current_value` das Goals com `source = 'board_revenue'` como a soma de todos os Payments com `status = 'pago'` e `paid_at` dentro do `period_start` e `period_end` da Goal.
5. THE Goal SHALL ter o campo `source` com valor padrão `'manual'` para metas criadas sem especificação de fonte.
6. WHILE uma Goal possui `source = 'manual'`, THE Commission_Calculator SHALL não atualizar automaticamente o `current_value` dessa Goal.

### Requisito 8: Bônus Manual para Colaboradores Não-Comerciais

**User Story:** Como admin ou owner, quero lançar bônus manualmente para colaboradores não-comerciais e não-diretoria, para que todos os colaboradores possam ser reconhecidos financeiramente independentemente do perfil.

#### Critérios de Aceitação

1. WHEN um HR_Manager acessa a CommissionConfigTab de um colaborador sem equipe comercial e sem `is_board_member = true`, THE CommissionConfigTab SHALL exibir um botão "Adicionar Bônus Manual".
2. WHEN o HR_Manager clica em "Adicionar Bônus Manual", THE CommissionConfigTab SHALL exibir um formulário para informar `month_reference`, `bonus_value` e uma descrição opcional.
3. WHEN o formulário de bônus manual é submetido com dados válidos, THE Commission_Calculator SHALL criar uma Commission_Entry com `entry_type = 'manual'` e `commission_value = 0` para o colaborador.
4. THE CommissionConfigTab SHALL exibir todos os lançamentos manuais de bônus do colaborador na tabela de histórico de pagamentos.
5. IF o colaborador possui equipe comercial ou `is_board_member = true`, THEN THE CommissionConfigTab SHALL ocultar o botão "Adicionar Bônus Manual".

---

### Requisito 9: CommissionConfigTab — Configuração de Comissão e Bônus

**User Story:** Como admin ou owner, quero configurar as taxas de comissão e bônus de cada colaborador em uma aba dedicada no detalhe do colaborador, para que essas configurações fiquem separadas dos dados cadastrais.

#### Critérios de Aceitação

1. THE CommissionConfigTab SHALL exibir um campo numérico "Taxa de Comissão (%)" mapeado para o campo `commission_rate` do Profile, aceitando valores decimais com até 2 casas.
2. THE CommissionConfigTab SHALL exibir campos numéricos "Bônus Tier 120% (%)", "Bônus Tier 135% (%)" e "Bônus Tier 150% (%)", mapeados respectivamente para `bonus_rate_120`, `bonus_rate_135` e `bonus_rate_150` do Profile.
3. WHEN o formulário da CommissionConfigTab é salvo, THE CommissionConfigTab SHALL persistir os valores de `commission_rate`, `bonus_rate_120`, `bonus_rate_135` e `bonus_rate_150` na tabela `profiles`.
4. IF o valor informado em qualquer campo de taxa for negativo, THEN THE CommissionConfigTab SHALL exibir uma mensagem de validação e impedir o salvamento.
5. THE CommissionConfigTab SHALL exibir uma tabela de histórico de pagamentos com as colunas: Mês/Ano, Comissão (R$), Bônus (R$), Contratos, Status, baseada nos registros de `commission_entries` do colaborador.
6. THE CommissionConfigTab SHALL estar acessível como aba no EmployeeDetailModal, visível apenas para usuários com papel `admin` ou `owner`.
7. THE EmployeeDetailModal e o EmployeeFormModal NÃO SHALL exibir os campos `commission_percent`, `commission_rate`, `bonus_rate_120`, `bonus_rate_135` ou `bonus_rate_150` no formulário de cadastro/edição de dados pessoais e profissionais.

### Requisito 10: CollaboratorCommissionsTab e CommissionDetailDialog

**User Story:** Como colaborador ou gestor, quero visualizar o histórico detalhado de comissões e bônus organizado por mês, para que seja possível acompanhar a evolução da remuneração variável.

#### Critérios de Aceitação

1. THE CollaboratorCommissionsTab SHALL exibir uma tabela com as colunas: Mês/Ano, Comissão (R$), Bônus (R$), Contratos, Status.
2. WHEN o usuário clica em uma linha da tabela, THE CollaboratorCommissionsTab SHALL abrir o CommissionDetailDialog com o resumo e a lista de vendas da Commission_Entry selecionada.
3. THE CommissionDetailDialog SHALL exibir as colunas: Cliente, Produto, Data Venda, Data Pagamento, Valor.
4. THE CommissionDetailDialog SHALL exibir o resumo da Commission_Entry com: total de vendas, valor de comissão, percentual de meta atingido, valor de bônus e status.
5. THE CollaboratorCommissionsTab SHALL estar disponível como aba no EmployeeDetailModal, acessível via rota `/team/:profileId`.
6. WHEN não existem Commission_Entries para o colaborador, THE CollaboratorCommissionsTab SHALL exibir uma mensagem informativa de estado vazio.

---

### Requisito 11: Módulo RH — Férias e Ausências

**User Story:** Como HR_Manager, quero registrar e controlar férias, atestados e faltas dos colaboradores, para que o histórico de ausências esteja centralizado no módulo RH.

#### Critérios de Aceitação

1. THE HR_Manager SHALL poder criar registros de Employee_Absence com os campos: `collaborator_id`, `tipo` (`ferias` | `atestado` | `falta`), `data_inicio`, `data_fim`, `status` (`aprovado` | `pendente`) e `observacao`.
2. WHEN um registro de Employee_Absence é criado com `status = 'pendente'`, THE System SHALL exibir o registro na lista de ausências pendentes de aprovação.
3. WHEN o HR_Manager aprova uma ausência, THE Employee_Absence SHALL ter o campo `status` atualizado para `aprovado`.
4. THE System SHALL exibir um alerta no Dashboard RH quando existirem férias com `data_fim` nos próximos 30 dias sem `status = 'aprovado'`.
5. THE System SHALL exibir a lista de ausências do colaborador na aba "Férias e Ausências" do EmployeeDetailModal.
6. IF `data_fim` for anterior a `data_inicio`, THEN THE System SHALL exibir uma mensagem de validação e impedir o salvamento.

### Requisito 12: Módulo RH — Avaliação de Desempenho

**User Story:** Como HR_Manager ou gerente, quero registrar avaliações de desempenho periódicas dos colaboradores, para que o histórico de performance esteja disponível para decisões de promoção e desenvolvimento.

#### Critérios de Aceitação

1. THE HR_Manager ou gerente SHALL poder criar registros de Employee_Evaluation com os campos: `collaborator_id`, `periodo`, `produtividade` (0–10), `qualidade` (0–10), `pontualidade` (0–10), `comportamento` (0–10), `nota_final` (calculada automaticamente como média dos critérios) e `feedback`.
2. WHEN uma Employee_Evaluation é salva, THE System SHALL calcular `nota_final` como a média aritmética de `produtividade`, `qualidade`, `pontualidade` e `comportamento`.
3. THE System SHALL exibir o histórico de avaliações do colaborador na aba "Avaliação de Desempenho" do EmployeeDetailModal.
4. THE System SHALL utilizar as avaliações como componente do Collaborator_Score.
5. IF qualquer critério de avaliação for informado fora do intervalo 0–10, THEN THE System SHALL exibir uma mensagem de validação e impedir o salvamento.

---

### Requisito 13: Módulo RH — Treinamentos

**User Story:** Como HR_Manager, quero registrar os treinamentos realizados e pendentes dos colaboradores, para que o desenvolvimento profissional do time seja acompanhado centralmente.

#### Critérios de Aceitação

1. THE HR_Manager SHALL poder criar registros de Employee_Training com os campos: `collaborator_id`, `nome_treinamento`, `data`, `status` (`concluido` | `pendente`) e `resultado`.
2. THE System SHALL exibir a lista de treinamentos do colaborador na aba "Treinamentos" do EmployeeDetailModal.
3. THE System SHALL exibir um alerta no Dashboard RH quando existirem treinamentos com `status = 'pendente'` e `data` nos próximos 7 dias.
4. WHEN um treinamento é marcado como `concluido`, THE Employee_Training SHALL ter o campo `status` atualizado e o campo `resultado` disponível para preenchimento.

---

### Requisito 14: Módulo RH — Documentos

**User Story:** Como HR_Manager, quero armazenar e visualizar documentos dos colaboradores no módulo RH, para que toda a documentação esteja centralizada e acessível.

#### Critérios de Aceitação

1. THE HR_Manager SHALL poder fazer upload de documentos vinculados a um colaborador, com os campos: `collaborator_id`, `nome_documento`, `tipo`, `url` e `data_upload`.
2. THE System SHALL exibir a lista de documentos do colaborador na aba "Documentos" do EmployeeDetailModal.
3. THE System SHALL exibir um alerta no Dashboard RH quando existirem colaboradores sem documentos cadastrados.
4. THE System SHALL permitir que o HR_Manager remova documentos cadastrados.

### Requisito 15: Módulo RH — Metas Integradas

**User Story:** Como gerente ou HR_Manager, quero definir metas individuais e de equipe diretamente no módulo RH, para que as metas sejam criadas automaticamente no módulo Metas com os vínculos corretos.

#### Critérios de Aceitação

1. WHEN um gerente define uma meta individual para um membro da sua equipe no módulo RH, THE System SHALL criar automaticamente um registro na tabela `goals` com `assigned_to = collaborator_id` e `responsible_type = 'individual'`.
2. WHEN o HR_Manager define uma meta de equipe no módulo RH, THE System SHALL criar automaticamente um registro na tabela `goals` com `team_id` preenchido e `responsible_type = 'team'`.
3. THE System SHALL exibir as metas vinculadas ao colaborador na aba "Metas" do EmployeeDetailModal, com progresso atual e percentual de atingimento.
4. THE gerente SHALL poder definir metas apenas para membros da equipe que ele gerencia (identificada pelo campo `lead_id` da tabela `teams`).
5. THE HR_Manager SHALL poder definir metas para qualquer equipe da organização.
6. WHEN uma meta é criada via módulo RH, THE Goal SHALL ter o campo `source` definido conforme o tipo: `'team_sales'` para metas de equipe comercial, `'board_revenue'` para metas de diretoria, e `'manual'` para os demais casos.

---

### Requisito 16: Dashboard RH

**User Story:** Como HR_Manager, quero visualizar um dashboard consolidado do módulo RH com indicadores de colaboradores, custo de folha, desempenho e ranking, para que a gestão do time seja orientada por dados.

#### Critérios de Aceitação

1. THE Dashboard_RH SHALL exibir o total de colaboradores ativos na organização.
2. THE Dashboard_RH SHALL exibir o custo total de folha do mês corrente, calculado como a soma dos campos `base_salary` de todos os Profiles com `is_active = true`.
3. THE Dashboard_RH SHALL exibir o desempenho médio por equipe, baseado nas Employee_Evaluations do período selecionado.
4. THE Dashboard_RH SHALL exibir um ranking de performance dos colaboradores, ordenado pelo Collaborator_Score.
5. THE Dashboard_RH SHALL exibir alertas ativos: férias vencendo, metas não atingidas, excesso de horas extras e documentos pendentes.
6. THE Dashboard_RH SHALL estar acessível na rota `/team` (módulo RH) para usuários com papel `admin` ou `owner`.

### Requisito 17: Score do Colaborador e Histórico Completo

**User Story:** Como HR_Manager, quero visualizar o score composto de cada colaborador e seu histórico de evolução, para que decisões de promoção e aumento salarial sejam baseadas em dados objetivos.

#### Critérios de Aceitação

1. THE System SHALL calcular o Collaborator_Score como a composição ponderada de: nota de desempenho (Employee_Evaluation), percentual de atingimento de metas (Goals) e nota de comportamento (campo `comportamento` da Employee_Evaluation).
2. THE System SHALL exibir o Collaborator_Score atual e o histórico de evolução na aba de detalhe do colaborador no EmployeeDetailModal.
3. THE System SHALL registrar eventos de promoção, aumento salarial e mudança de cargo no histórico do colaborador, com data e descrição.
4. THE System SHALL exibir a linha do tempo de evolução do colaborador (promoções, aumentos, avaliações) no EmployeeDetailModal.
5. WHEN o Collaborator_Score de um colaborador cai abaixo de um limiar configurável, THE System SHALL exibir um alerta no Dashboard RH.

---

### Requisito 18: Alertas do Módulo RH

**User Story:** Como HR_Manager, quero receber alertas automáticos sobre situações críticas do time, para que eu possa agir proativamente antes que problemas se agravem.

#### Critérios de Aceitação

1. THE System SHALL gerar um alerta quando existirem colaboradores com férias (`tipo = 'ferias'`) com `data_fim` nos próximos 30 dias e `status != 'aprovado'`.
2. THE System SHALL gerar um alerta quando existirem colaboradores com metas do mês corrente com `current_value < target_value` e `period_end` nos próximos 7 dias.
3. THE System SHALL gerar um alerta quando o total de horas extras de um colaborador no mês exceder 20 horas, baseado nos registros de jornada (CollaboratorTimeclockTab).
4. THE System SHALL gerar um alerta quando existirem colaboradores ativos sem nenhum documento cadastrado.
5. THE Dashboard_RH SHALL exibir todos os alertas ativos com indicação do colaborador e da ação recomendada.
6. WHEN um alerta é resolvido (situação normalizada), THE System SHALL remover o alerta da lista de alertas ativos automaticamente.

### Requisito 19: Migrations 00083–00090

**User Story:** Como desenvolvedor, quero que as alterações de schema sejam aplicadas via migrations numeradas sequencialmente a partir de 00083, para que o banco de dados suporte todas as funcionalidades do sistema de comissões e do módulo RH.

#### Critérios de Aceitação

1. THE Migration_00083 SHALL adicionar os campos `commission_rate DECIMAL(5,2) DEFAULT 0`, `bonus_rate_120 DECIMAL(5,2) DEFAULT 0`, `bonus_rate_135 DECIMAL(5,2) DEFAULT 0`, `bonus_rate_150 DECIMAL(5,2) DEFAULT 0` e `is_board_member BOOLEAN DEFAULT false` à tabela `profiles`; e adicionar `hire_date DATE` ao campo `metadata` (documentado); o campo `commission_percent` do metadata é considerado legado e não deve ser gravado por novas funcionalidades.
2. THE Migration_00084 SHALL adicionar os campos `sdr_id UUID REFERENCES profiles(id) ON DELETE SET NULL`, `closer_id UUID REFERENCES profiles(id) ON DELETE SET NULL` e `team_id UUID REFERENCES teams(id) ON DELETE SET NULL` à tabela `leads`. A migration NÃO SHALL adicionar `round_robin_index` à tabela `teams`.
3. THE Migration_00085 SHALL criar a tabela `commission_entries` com os campos: `id UUID PRIMARY KEY`, `organization_id`, `profile_id`, `month_reference DATE`, `total_sales_value DECIMAL(12,2)`, `contracts_count INTEGER`, `commission_rate DECIMAL(5,2)`, `commission_value DECIMAL(12,2)`, `goal_id UUID nullable`, `goal_target DECIMAL(12,2)`, `goal_achieved_pct DECIMAL(5,2)`, `bonus_rate DECIMAL(5,2)`, `bonus_value DECIMAL(12,2)`, `is_board_member BOOLEAN`, `entry_type TEXT CHECK (entry_type IN ('automatic','manual'))`, `status TEXT CHECK (status IN ('pending','approved','paid'))`.
4. THE Migration_00086 SHALL criar a tabela `commission_entry_sales` com os campos: `id UUID PRIMARY KEY`, `commission_entry_id UUID REFERENCES commission_entries(id) ON DELETE CASCADE`, `contract_id UUID`, `client_name TEXT`, `product TEXT`, `sale_date DATE`, `first_payment_date DATE`, `value DECIMAL(12,2)`.
5. THE Migration_00087 SHALL adicionar o campo `source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','team_sales','board_revenue'))` à tabela `goals`.
6. THE Migration_00088 SHALL criar a tabela `employee_absences` com os campos: `id UUID PRIMARY KEY`, `organization_id`, `collaborator_id UUID REFERENCES profiles(id) ON DELETE CASCADE`, `tipo TEXT CHECK (tipo IN ('ferias','atestado','falta'))`, `data_inicio DATE`, `data_fim DATE`, `status TEXT CHECK (status IN ('aprovado','pendente'))`, `observacao TEXT`, `created_at TIMESTAMPTZ`.
7. THE Migration_00089 SHALL criar a tabela `employee_evaluations` com os campos: `id UUID PRIMARY KEY`, `organization_id`, `collaborator_id UUID REFERENCES profiles(id) ON DELETE CASCADE`, `periodo TEXT`, `produtividade DECIMAL(4,1)`, `qualidade DECIMAL(4,1)`, `pontualidade DECIMAL(4,1)`, `comportamento DECIMAL(4,1)`, `nota_final DECIMAL(4,1)`, `feedback TEXT`, `created_at TIMESTAMPTZ`.
8. THE Migration_00090 SHALL criar a tabela `employee_trainings` com os campos: `id UUID PRIMARY KEY`, `organization_id`, `collaborator_id UUID REFERENCES profiles(id) ON DELETE CASCADE`, `nome_treinamento TEXT`, `data DATE`, `status TEXT CHECK (status IN ('concluido','pendente'))`, `resultado TEXT`, `created_at TIMESTAMPTZ`.
9. WHEN qualquer migration é aplicada, THE Migration SHALL ser idempotente, utilizando `IF NOT EXISTS` ou equivalente para evitar erros em re-execuções.

### Requisito 20: Consistência Round-Trip de Commission_Entry

**User Story:** Como desenvolvedor, quero garantir que os dados de Commission_Entry sejam matematicamente consistentes e possam ser verificados de forma determinística, para que integrações e auditorias sejam confiáveis.

#### Critérios de Aceitação

1. THE Commission_Calculator SHALL garantir que para toda Commission_Entry criada, a soma dos campos `value` de todos os `commission_entry_sales` vinculados seja igual ao campo `total_sales_value` da Commission_Entry: `SUM(commission_entry_sales.value) == commission_entries.total_sales_value`.
2. FOR ALL Commission_Entries com `entry_type = 'automatic'`, THE Commission_Calculator SHALL garantir que `commission_value = ROUND(total_sales_value * commission_rate / 100, 2)`.
3. THE Commission_Calculator SHALL garantir que `goal_achieved_pct = ROUND((current_value / target_value) * 100, 2)` quando `goal_id` não for nulo e `target_value > 0`.
4. FOR ALL Commission_Entries, THE Commission_Calculator SHALL garantir que `commission_value >= 0` e `bonus_value >= 0`.

---

### Requisito 21: Renomeação do Módulo Equipe → RH

**User Story:** Como usuário do sistema, quero que o módulo "Equipe" seja exibido como "RH" no sidebar, para que a nomenclatura reflita o escopo ampliado do módulo.

#### Critérios de Aceitação

1. THE Sidebar SHALL exibir o label "RH" no lugar de "Equipe" para o item de navegação que aponta para a rota `/team`.
2. THE System SHALL manter a rota `/team` inalterada após a renomeação do label.
3. THE System SHALL manter todos os links internos e referências de rota existentes apontando para `/team` sem alteração.
4. WHEN o usuário acessa a rota `/team`, THE System SHALL exibir o módulo RH com todas as suas abas e funcionalidades.

---

### Requisito 22: Cadastro de Colaborador — hire_date e Remoção de commission_percent

**User Story:** Como HR_Manager, quero que o formulário de cadastro do colaborador inclua a data de admissão e não exiba mais os campos de comissão/bônus, para que os dados cadastrais fiquem separados das configurações de remuneração variável.

#### Critérios de Aceitação

1. THE EmployeeFormModal e o EditCollaboratorDialog SHALL exibir um campo "Data de Admissão" mapeado para `metadata.hire_date`, do tipo `date`.
2. WHEN o formulário de cadastro é salvo, THE System SHALL persistir `hire_date` no campo `metadata.hire_date` do Profile.
3. THE EmployeeFormModal e o EditCollaboratorDialog NÃO SHALL exibir os campos `commission_percent`, `commission_rate`, `bonus_rate_120`, `bonus_rate_135` ou `bonus_rate_150`.
4. WHEN o EditCollaboratorDialog é aberto para um colaborador que possui `commission_percent` no metadata, THE System SHALL ignorar esse campo no formulário de edição, sem removê-lo do banco de dados.
5. THE System SHALL exibir `hire_date` formatado como `DD/MM/YYYY` nas listagens e no detalhe do colaborador.
