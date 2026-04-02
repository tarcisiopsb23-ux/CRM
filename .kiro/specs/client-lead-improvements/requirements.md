# Documento de Requisitos

## Introdução

Este documento especifica as melhorias solicitadas para o sistema CRM, focando em persistência de estado da interface, novos campos de cadastro, unificação de nomenclaturas, cálculos dinâmicos de faturamento, gestão de indicadores e correções nos dashboards de cliente.

O sistema é um CRM desenvolvido em React/TypeScript com Supabase como backend, que gerencia leads, clientes, contratos e indicadores de performance.

## Glossário

- **Sistema_CRM**: O sistema de gerenciamento de relacionamento com clientes descrito neste documento
- **Tela**: Interface de usuário que exibe formulários e dados de clientes ou leads
- **Pop_up**: Janela modal sobreposta à interface principal
- **Cliente**: Registro de empresa ou pessoa que possui contrato ativo ou histórico com a organização
- **Lead**: Registro de potencial cliente em processo de qualificação no funil de vendas
- **Indicador**: Métrica de performance (KPI) registrada manualmente para acompanhamento do cliente
- **Dashboard_Cliente**: Interface pública de visualização de métricas acessível pelo cliente
- **Dashboard_Performance**: Seção do dashboard que exibe métricas de campanhas e anúncios
- **Dashboard_Atendimento**: Seção do dashboard que exibe métricas de conversas e atendimento
- **Faturamento_Dinâmico**: Valor calculado automaticamente com base no histórico de indicadores
- **Faturamento_Manual**: Valor informado manualmente pelo usuário no cadastro
- **Origem**: Campo que identifica a fonte de aquisição do cliente ou lead
- **Nicho**: Campo que identifica o segmento de mercado do cliente ou lead
- **Decisor**: Pessoa responsável por tomar decisões na empresa cliente
- **Logout_Automático**: Encerramento automático da sessão por inatividade ou tempo limite
- **Sessão**: Período de uso contínuo do sistema por um usuário autenticado

## Requisitos

### Requisito 1: Persistência de Estado da Interface

**User Story:** Como usuário do CRM, quero que os dados preenchidos nas telas permaneçam salvos durante minha sessão, para que eu não perca informações ao navegar entre telas ou fechar pop-ups temporariamente.

#### Acceptance Criteria

1. WHEN o usuário preenche campos em uma tela de cadastro ou edição, THE Sistema_CRM SHALL preservar os valores preenchidos na memória da sessão
2. WHEN o usuário fecha um Pop_up sem salvar, THE Sistema_CRM SHALL manter os dados preenchidos disponíveis caso o Pop_up seja reaberto na mesma Sessão
3. WHEN o usuário navega para outra tela e retorna, THE Sistema_CRM SHALL restaurar os valores previamente preenchidos que não foram salvos
4. IF ocorre Logout_Automático por tempo de inatividade, THEN THE Sistema_CRM SHALL limpar todos os dados não salvos da memória
5. WHEN o usuário realiza atualização manual da página (refresh), THE Sistema_CRM SHALL limpar todos os dados não salvos da memória
6. WHEN o usuário navega manualmente para a tela anterior usando botão de voltar, THE Sistema_CRM SHALL limpar os dados não salvos da tela atual

### Requisito 2: Campos de Origem e Nicho no Cadastro

**User Story:** Como usuário do CRM, quero registrar a origem e o nicho de clientes e leads, para que eu possa segmentar e analisar minha base por fonte de aquisição e segmento de mercado.

#### Acceptance Criteria

1. THE Sistema_CRM SHALL incluir o campo Origem no formulário de cadastro de Cliente
2. THE Sistema_CRM SHALL incluir o campo Nicho no formulário de cadastro de Cliente
3. THE Sistema_CRM SHALL incluir o campo Origem no formulário de cadastro de Lead
4. THE Sistema_CRM SHALL incluir o campo Nicho no formulário de cadastro de Lead
5. WHEN o usuário acessa o campo Origem, THE Sistema_CRM SHALL exibir as opções: Indicação, Prospecção, Tráfego Pago, Tráfego Orgânico, Outra
6. WHEN o usuário acessa o campo Nicho, THE Sistema_CRM SHALL exibir as opções: Restaurante, Clínica, Autônomo(a), Academia, Oficina, Varejo, E-commerce, Advocacia, Infoproduto, SaaS, Outro
7. THE Sistema_CRM SHALL armazenar os valores de Origem e Nicho no banco de dados Supabase
8. WHEN um Lead é convertido para Cliente, THE Sistema_CRM SHALL transferir os valores de Origem e Nicho do Lead para o Cliente

### Requisito 3: Unificação de Campos Responsável e Decisor

**User Story:** Como usuário do CRM, quero ter campos claros e sem ambiguidade para identificar o decisor da empresa cliente, para que eu possa registrar corretamente o contato principal para tomada de decisões.

#### Acceptance Criteria

1. THE Sistema_CRM SHALL remover o campo responsável_name do formulário de cadastro de Cliente
2. THE Sistema_CRM SHALL remover o campo responsável_phone do formulário de cadastro de Cliente
3. THE Sistema_CRM SHALL manter apenas o campo decision_maker_name no formulário de cadastro de Cliente
4. THE Sistema_CRM SHALL manter apenas o campo decision_maker_phone no formulário de cadastro de Cliente
5. THE Sistema_CRM SHALL remover o campo responsável_name do formulário de cadastro de Lead
6. THE Sistema_CRM SHALL remover o campo responsável_phone do formulário de cadastro de Lead
7. THE Sistema_CRM SHALL manter apenas o campo decision_maker_name no formulário de cadastro de Lead
8. THE Sistema_CRM SHALL manter apenas o campo decision_maker_phone no formulário de cadastro de Lead
9. WHEN exibe dados existentes que possuem valores em campos responsável, THE Sistema_CRM SHALL migrar automaticamente esses valores para os campos decision_maker correspondentes

### Requisito 4: Faturamento Dinâmico no Cadastro do Cliente

**User Story:** Como usuário do CRM, quero que o campo de faturamento seja calculado automaticamente quando houver histórico de indicadores, para que eu tenha dados precisos sem digitação manual repetitiva.

#### Acceptance Criteria

1. WHEN o usuário acessa o formulário de cadastro de Cliente que possui histórico de faturamento nos Indicadores, THE Sistema_CRM SHALL calcular a média dos valores de faturamento registrados
2. WHEN o usuário acessa o formulário de cadastro de Cliente que possui histórico de faturamento nos Indicadores, THE Sistema_CRM SHALL exibir o campo Faturamento_Dinâmico com o valor calculado em modo somente leitura
3. WHEN o usuário acessa o formulário de cadastro de Cliente que NÃO possui histórico de faturamento nos Indicadores, THE Sistema_CRM SHALL exibir o campo Faturamento_Manual editável
4. WHEN o usuário acessa o formulário de cadastro de Lead, THE Sistema_CRM SHALL exibir o campo Faturamento_Manual editável
5. THE Sistema_CRM SHALL ocultar o campo Faturamento_Manual quando o campo Faturamento_Dinâmico estiver visível
6. THE Sistema_CRM SHALL ocultar o campo Faturamento_Dinâmico quando o campo Faturamento_Manual estiver visível
7. WHEN o Sistema_CRM calcula a média de faturamento, THE Sistema_CRM SHALL considerar apenas registros de Indicadores com valores numéricos válidos maiores que zero
8. WHEN o Sistema_CRM calcula a média de faturamento, THE Sistema_CRM SHALL arredondar o resultado para duas casas decimais

### Requisito 5: Gestão de Indicadores Registrados

**User Story:** Como usuário do CRM, quero poder excluir ou editar indicadores já registrados para um cliente, para que eu possa corrigir erros ou remover dados obsoletos.

#### Acceptance Criteria

1. WHEN o usuário visualiza a lista de Indicadores registrados para um Cliente, THE Sistema_CRM SHALL exibir um botão de Editar para cada Indicador
2. WHEN o usuário visualiza a lista de Indicadores registrados para um Cliente, THE Sistema_CRM SHALL exibir um botão de Excluir para cada Indicador
3. WHEN o usuário clica no botão Editar de um Indicador, THE Sistema_CRM SHALL abrir um formulário preenchido com os dados atuais do Indicador
4. WHEN o usuário modifica os dados de um Indicador e confirma, THE Sistema_CRM SHALL atualizar o registro no banco de dados Supabase
5. WHEN o usuário clica no botão Excluir de um Indicador, THE Sistema_CRM SHALL solicitar confirmação antes de prosseguir
6. WHEN o usuário confirma a exclusão de um Indicador, THE Sistema_CRM SHALL remover o registro do banco de dados Supabase
7. WHEN um Indicador é excluído ou editado, THE Sistema_CRM SHALL recalcular o Faturamento_Dinâmico se aplicável

### Requisito 6: Independência do Dashboard do Cliente

**User Story:** Como cliente com acesso ao dashboard público, quero que meu acesso seja independente do sistema de autenticação principal, para que eu possa visualizar minhas métricas sem depender de credenciais do sistema interno.

#### Acceptance Criteria

1. THE Sistema_CRM SHALL manter o Dashboard_Cliente em um sistema de autenticação separado do sistema principal
2. WHEN um Cliente acessa o Dashboard_Cliente, THE Sistema_CRM SHALL validar credenciais usando o campo dashboard_password armazenado nos metadados do Cliente
3. THE Sistema_CRM SHALL armazenar a sessão do Dashboard_Cliente em localStorage com chave específica por slug do cliente
4. WHEN ocorre Logout_Automático no sistema principal, THE Sistema_CRM SHALL manter a sessão do Dashboard_Cliente ativa
5. WHEN o Cliente fecha o navegador, THE Sistema_CRM SHALL manter a sessão do Dashboard_Cliente ativa no localStorage
6. WHEN o Cliente realiza logout explícito no Dashboard_Cliente, THE Sistema_CRM SHALL remover apenas a sessão do Dashboard_Cliente do localStorage

### Requisito 7: Correção de Exibição de Dados nos Dashboards

**User Story:** Como cliente com acesso ao dashboard, quero visualizar dados reais e atualizados nos dashboards de performance e atendimento, para que eu possa acompanhar os resultados das campanhas e do atendimento.

#### Acceptance Criteria

1. WHEN o Dashboard_Performance é carregado, THE Sistema_CRM SHALL buscar dados reais de campanhas da tabela hub_performance_reports
2. WHEN o Dashboard_Performance é carregado, THE Sistema_CRM SHALL buscar dados reais de métricas diárias da tabela hub_performance_daily_metrics
3. WHEN o Dashboard_Performance é carregado, THE Sistema_CRM SHALL buscar dados reais de KPIs da tabela client_kpis e client_kpi_history
4. WHEN o Dashboard_Atendimento é carregado, THE Sistema_CRM SHALL buscar dados reais de conversas da tabela conversation_kpis
5. THE Sistema_CRM SHALL exibir valores numéricos reais nos cards de métricas do Dashboard_Performance
6. THE Sistema_CRM SHALL exibir valores numéricos reais nos cards de métricas do Dashboard_Atendimento
7. WHEN não houver dados disponíveis para um período, THE Sistema_CRM SHALL exibir zero ou mensagem indicando ausência de dados
8. THE Sistema_CRM SHALL atualizar os gráficos do Dashboard_Performance com dados reais das queries executadas

### Requisito 8: Vinculação de Blocos com Dados Reais

**User Story:** Como desenvolvedor do sistema, quero garantir que todos os blocos visuais do dashboard estejam conectados às fontes de dados corretas, para que os clientes visualizem informações precisas e atualizadas.

#### Acceptance Criteria

1. THE Sistema_CRM SHALL vincular o bloco de Investimento aos dados da coluna total_spend da tabela hub_performance_daily_metrics
2. THE Sistema_CRM SHALL vincular o bloco de Leads aos dados da coluna total_leads da tabela hub_performance_daily_metrics
3. THE Sistema_CRM SHALL vincular o bloco de Vendas aos dados da coluna total_sales da tabela hub_performance_daily_metrics
4. THE Sistema_CRM SHALL vincular o bloco de Faturamento aos dados da coluna revenue da tabela hub_performance_daily_metrics
5. THE Sistema_CRM SHALL vincular o bloco de ROAS ao cálculo (revenue / total_spend) usando dados da tabela hub_performance_daily_metrics
6. THE Sistema_CRM SHALL vincular o bloco de Taxa de Conversão ao cálculo (total_sales / total_leads × 100) usando dados da tabela hub_performance_daily_metrics
7. THE Sistema_CRM SHALL vincular os gráficos de evolução temporal aos dados agrupados por data da tabela hub_performance_daily_metrics
8. THE Sistema_CRM SHALL vincular a tabela de campanhas aos dados da tabela hub_performance_reports
9. THE Sistema_CRM SHALL vincular os cards de KPIs aos dados das tabelas client_kpis e client_kpi_history
10. THE Sistema_CRM SHALL vincular os blocos de atendimento aos dados da tabela conversation_kpis quando o Dashboard_Atendimento estiver ativo
