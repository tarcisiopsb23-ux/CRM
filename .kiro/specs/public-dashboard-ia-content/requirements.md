# Requirements Document

## Introduction

Esta feature evolui o Dashboard Público do CRM (`/public/dashboard/:slug`) de uma página monolítica para um sistema com layout de sidebar colapsável, nova estrutura de rotas e um módulo completo de **Conteúdo IA** — permitindo que clientes com o flag `show_ia_content = true` gerenciem agenda musical, promoções, sugestões da semana, eventos especiais, avisos e configurações do agente de IA diretamente pelo dashboard público. O conteúdo IA é armazenado no Supabase próprio do cliente (credenciais dinâmicas), não no banco do CRM. O projeto separado "Novo Public Dashboard" (pasta `Novo Public Dashboard/`) serve como referência de UI/UX e será descartado após a implementação.

## Glossary

- **Dashboard_Público**: A aplicação React acessível em `/public/dashboard/:slug`, protegida por senha, sem autenticação Supabase do CRM.
- **Sidebar**: Painel de navegação lateral colapsável presente em todas as rotas do Dashboard_Público após o login.
- **Slug**: Identificador único de URL do cliente (campo `dashboard_slug` na tabela `clients`).
- **Client_Auth**: Objeto JSON salvo em `localStorage` com chave `client_auth_{slug}` após login bem-sucedido.
- **Módulo_Resultados**: Grupo de navegação da sidebar contendo as seções Performance e Atendimento.
- **Módulo_Conteúdo_IA**: Grupo de navegação da sidebar contendo Agenda, Promoções, Sugestões, Eventos, Avisos e Configurações — visível apenas quando `show_ia_content = true`.
- **show_ia_content**: Boolean no cadastro do cliente (campo na tabela `clients`) que habilita o Módulo_Conteúdo_IA no Dashboard_Público.
- **Client_Supabase**: Instância Supabase própria do cliente, acessada via `client_supabase_url` e `client_supabase_anon_key` armazenados no cadastro do cliente no CRM.
- **Dynamic_Client**: Instância `SupabaseClient` criada em runtime com as credenciais do Client_Supabase do cliente autenticado.
- **Dashboard_Geral**: Nova rota raiz do Dashboard_Público (`/public/dashboard/:slug`) com visão consolidada de KPIs, conteúdo IA ativo e feed de atividade.
- **Performance_Page**: Página com o conteúdo atual de campanhas e métricas de anúncios, acessível em `/public/dashboard/:slug/performance`.
- **Atendimento_Page**: Página com KPIs de conversas automatizadas, acessível em `/public/dashboard/:slug/atendimento`.
- **Agenda_Page**: Página CRUD de agenda musical, acessível em `/public/dashboard/:slug/agenda`.
- **Promocoes_Page**: Página CRUD de promoções, acessível em `/public/dashboard/:slug/promocoes`.
- **Sugestoes_Page**: Página CRUD de sugestões da semana, acessível em `/public/dashboard/:slug/sugestoes`.
- **Eventos_Page**: Página CRUD de eventos especiais, acessível em `/public/dashboard/:slug/eventos`.
- **Avisos_Page**: Página CRUD de avisos, acessível em `/public/dashboard/:slug/avisos`.
- **Configuracoes_Page**: Página de configurações do agente IA, acessível em `/public/dashboard/:slug/configuracoes`.
- **CRM_Admin**: Usuário autenticado no CRM (Maestria) que gerencia o cadastro de clientes.
- **ClientIntegrationsTab**: Componente React em `src/components/clients/ClientIntegrationsTab.tsx` que exibe a aba de integrações do cliente no CRM.
- **Migration_SQL**: Script SQL para criação das tabelas no Client_Supabase.

---

## Requirements

### Requirement 1: Layout com Sidebar Colapsável

**User Story:** Como cliente autenticado no Dashboard_Público, quero uma sidebar de navegação colapsável com grupos "Resultados" e "Conteúdo IA", para que eu possa navegar entre as seções sem perder o contexto visual.

#### Acceptance Criteria

1. WHEN o cliente acessa qualquer rota do Dashboard_Público após autenticação, THE Dashboard_Público SHALL renderizar um layout com sidebar colapsável à esquerda e área de conteúdo principal à direita.
2. THE Sidebar SHALL exibir o grupo "Resultados" contendo os itens "Dashboard Geral", "Performance" e "Atendimento".
3. WHEN `show_ia_content` for `true` no Client_Auth, THE Sidebar SHALL exibir o grupo "Conteúdo IA" contendo os itens "Agenda Musical", "Promoções", "Sugestões da Semana", "Eventos Especiais", "Avisos" e "Configurações".
4. WHEN `show_ia_content` for `false` ou ausente no Client_Auth, THE Sidebar SHALL ocultar completamente o grupo "Conteúdo IA".
5. WHEN o usuário clica no botão de colapso da sidebar, THE Sidebar SHALL alternar entre o estado expandido (com rótulos de texto visíveis) e o estado colapsado (apenas ícones visíveis).
6. THE Sidebar SHALL destacar visualmente o item de navegação correspondente à rota ativa.
7. THE Sidebar SHALL exibir o nome do cliente e um indicador de status da sessão no rodapé.
8. THE Dashboard_Público SHALL manter o layout com sidebar em todas as rotas autenticadas, incluindo as rotas de Conteúdo IA.

---

### Requirement 2: Nova Estrutura de Rotas

**User Story:** Como cliente autenticado no Dashboard_Público, quero que cada seção tenha sua própria URL, para que eu possa navegar diretamente para uma seção específica e compartilhar links.

#### Acceptance Criteria

1. THE Dashboard_Público SHALL responder às seguintes rotas após autenticação:
   - `/public/dashboard/:slug` → Dashboard_Geral
   - `/public/dashboard/:slug/performance` → Performance_Page
   - `/public/dashboard/:slug/atendimento` → Atendimento_Page
   - `/public/dashboard/:slug/agenda` → Agenda_Page
   - `/public/dashboard/:slug/promocoes` → Promocoes_Page
   - `/public/dashboard/:slug/sugestoes` → Sugestoes_Page
   - `/public/dashboard/:slug/eventos` → Eventos_Page
   - `/public/dashboard/:slug/avisos` → Avisos_Page
   - `/public/dashboard/:slug/configuracoes` → Configuracoes_Page
2. WHEN um cliente não autenticado acessa qualquer rota do Dashboard_Público, THE Dashboard_Público SHALL redirecionar para `/public/dashboard/:slug/login`.
3. WHEN um cliente autenticado com `show_ia_content = false` acessa uma rota de Conteúdo IA diretamente pela URL, THE Dashboard_Público SHALL redirecionar para `/public/dashboard/:slug`.
4. THE App.tsx SHALL registrar todas as rotas listadas no critério 1 usando React Router DOM.

---

### Requirement 3: Dashboard Geral (Visão Consolidada)

**User Story:** Como cliente autenticado no Dashboard_Público, quero uma página inicial com visão consolidada dos principais indicadores, para que eu tenha uma visão rápida do desempenho geral sem precisar navegar entre seções.

#### Acceptance Criteria

1. THE Dashboard_Geral SHALL exibir cards de resumo com: número de campanhas ativas no período, total de leads do período, KPIs principais (faturamento e ROAS quando disponíveis) e, WHEN `show_ia_content = true`, contagem de itens de Conteúdo IA ativos por categoria.
2. THE Dashboard_Geral SHALL exibir um gráfico de barras com a atividade semanal de leads e investimento dos últimos 7 dias.
3. WHEN `show_ia_content = true` e houver eventos na tabela `ai_schedule` com status `active` e data futura, THE Dashboard_Geral SHALL exibir o próximo evento da agenda com artista, data e horário.
4. WHEN `show_ia_content = true` e houver registros na tabela `ai_notices` com `status = 'active'` e `priority = 'alta'`, THE Dashboard_Geral SHALL exibir os avisos de prioridade alta em destaque.
5. THE Dashboard_Geral SHALL exibir um feed de atividade recente com as últimas ações registradas nas seções de Performance e Conteúdo IA.
6. WHEN os dados de campanhas ou KPIs não estiverem disponíveis, THE Dashboard_Geral SHALL exibir estados vazios informativos em vez de erros.

---

### Requirement 4: Credenciais do Client_Supabase no Cadastro do Cliente

**User Story:** Como CRM_Admin, quero cadastrar as credenciais do Supabase próprio do cliente e habilitar o módulo de Conteúdo IA, para que o Dashboard_Público possa se conectar ao banco de dados do cliente.

#### Acceptance Criteria

1. THE ClientIntegrationsTab SHALL exibir uma seção "Conteúdo IA" com campos de texto para `client_supabase_url` e `client_supabase_anon_key`.
2. THE ClientIntegrationsTab SHALL exibir um toggle boolean `show_ia_content` (padrão `false`) na seção "Conteúdo IA".
3. WHEN `show_ia_content` for `true` e `client_supabase_url` ou `client_supabase_anon_key` estiverem vazios, THE ClientIntegrationsTab SHALL exibir uma mensagem de validação informando que as credenciais são obrigatórias para habilitar o Conteúdo IA e SHALL impedir o salvamento.
4. WHEN o CRM_Admin salva as configurações com credenciais válidas e `show_ia_content = true`, THE ClientIntegrationsTab SHALL persistir os campos `client_supabase_url`, `client_supabase_anon_key` e `show_ia_content` na tabela `clients` do CRM.
5. THE ClientIntegrationsTab SHALL exibir um botão "Testar Conexão" que, WHEN clicado, tenta criar um Dynamic_Client com as credenciais informadas e exibe o resultado (sucesso ou erro de conexão).
6. THE ClientIntegrationsTab SHALL exibir o SQL de migration (Requirement 9) em um bloco de código copiável para que o CRM_Admin possa executá-lo no Client_Supabase.

---

### Requirement 5: Persistência das Credenciais no Client_Auth

**User Story:** Como cliente autenticado no Dashboard_Público, quero que as credenciais do meu Supabase sejam carregadas automaticamente após o login, para que as seções de Conteúdo IA funcionem sem configuração adicional.

#### Acceptance Criteria

1. WHEN o login no Dashboard_Público é bem-sucedido, THE PublicDashboardLoginPage SHALL incluir `client_supabase_url`, `client_supabase_anon_key` e `show_ia_content` no objeto Client_Auth salvo no `localStorage`.
2. THE PublicDashboardLoginPage SHALL buscar os campos `client_supabase_url`, `client_supabase_anon_key` e `show_ia_content` da tabela `clients` via RPC `get_client_by_slug` ou query equivalente durante o processo de login.
3. WHEN `client_supabase_url` ou `client_supabase_anon_key` estiverem ausentes no banco, THE PublicDashboardLoginPage SHALL salvar esses campos como `null` no Client_Auth sem bloquear o login.
4. THE Dashboard_Público SHALL re-buscar os dados do cliente via RPC ao carregar, atualizando o Client_Auth no `localStorage` com os valores mais recentes de `show_ia_content`, `client_supabase_url` e `client_supabase_anon_key`.

---

### Requirement 6: Dynamic_Client para Conteúdo IA

**User Story:** Como cliente autenticado no Dashboard_Público com `show_ia_content = true`, quero que as seções de Conteúdo IA se conectem ao meu próprio Supabase, para que os dados sejam isolados por cliente.

#### Acceptance Criteria

1. THE Dashboard_Público SHALL exportar uma função `createClientSupabase(url: string, key: string): SupabaseClient` que cria uma instância Supabase com as credenciais fornecidas.
2. WHEN uma página de Conteúdo IA é renderizada, THE Dashboard_Público SHALL criar o Dynamic_Client usando `client_supabase_url` e `client_supabase_anon_key` do Client_Auth.
3. IF `client_supabase_url` ou `client_supabase_anon_key` estiverem ausentes no Client_Auth, THEN THE Dashboard_Público SHALL exibir uma mensagem de erro informando que as credenciais do Supabase não estão configuradas e SHALL não tentar criar o Dynamic_Client.
4. THE Dynamic_Client SHALL ser usado exclusivamente nas páginas de Conteúdo IA e não SHALL substituir o cliente Supabase principal do CRM.

---

### Requirement 7: CRUD de Agenda Musical

**User Story:** Como cliente autenticado no Dashboard_Público com `show_ia_content = true`, quero gerenciar a agenda musical do meu estabelecimento, para que o agente de IA possa comunicar shows e apresentações aos clientes.

#### Acceptance Criteria

1. THE Agenda_Page SHALL listar todos os registros da tabela `ai_schedule` do Client_Supabase ordenados por data.
2. THE Agenda_Page SHALL exibir para cada registro: artista, data, horário, descrição e status (ativo/inativo).
3. WHEN o usuário clica em "Adicionar Evento", THE Agenda_Page SHALL exibir um formulário com campos: artista (obrigatório), data (obrigatório), horário (obrigatório), descrição e status inicial.
4. WHEN o formulário de criação é submetido com dados válidos, THE Agenda_Page SHALL inserir o registro na tabela `ai_schedule` via Dynamic_Client e atualizar a listagem.
5. WHEN o usuário clica em editar um registro, THE Agenda_Page SHALL exibir o formulário preenchido com os dados atuais e, WHEN salvo, SHALL atualizar o registro na tabela `ai_schedule`.
6. WHEN o usuário clica em excluir um registro e confirma, THE Agenda_Page SHALL remover o registro da tabela `ai_schedule` via Dynamic_Client.
7. WHEN o usuário alterna o toggle de status de um registro, THE Agenda_Page SHALL atualizar o campo `status` para `'active'` ou `'inactive'` na tabela `ai_schedule` via Dynamic_Client.
8. IF uma operação de escrita no Dynamic_Client falhar, THEN THE Agenda_Page SHALL exibir uma notificação de erro com a mensagem retornada.

---

### Requirement 8: CRUD de Promoções

**User Story:** Como cliente autenticado no Dashboard_Público com `show_ia_content = true`, quero gerenciar as promoções do meu estabelecimento, para que o agente de IA possa comunicar ofertas ativas aos clientes.

#### Acceptance Criteria

1. THE Promocoes_Page SHALL listar todos os registros da tabela `ai_promotions` do Client_Supabase.
2. THE Promocoes_Page SHALL exibir para cada registro: título, descrição, validade, tipo e status.
3. WHEN o usuário clica em "Nova Promoção", THE Promocoes_Page SHALL exibir um formulário com campos: título (obrigatório), descrição, validade, tipo e status inicial.
4. WHEN o formulário de criação é submetido com dados válidos, THE Promocoes_Page SHALL inserir o registro na tabela `ai_promotions` via Dynamic_Client e atualizar a listagem.
5. WHEN o usuário edita ou exclui um registro, THE Promocoes_Page SHALL atualizar ou remover o registro na tabela `ai_promotions` via Dynamic_Client.
6. WHEN o usuário alterna o toggle de status, THE Promocoes_Page SHALL atualizar o campo `status` na tabela `ai_promotions` via Dynamic_Client.
7. IF uma operação de escrita no Dynamic_Client falhar, THEN THE Promocoes_Page SHALL exibir uma notificação de erro.

---

### Requirement 9: CRUD de Sugestões da Semana

**User Story:** Como cliente autenticado no Dashboard_Público com `show_ia_content = true`, quero gerenciar as sugestões da semana, para que o agente de IA possa recomendar pratos ou produtos em destaque.

#### Acceptance Criteria

1. THE Sugestoes_Page SHALL listar todos os registros da tabela `ai_suggestions` do Client_Supabase.
2. THE Sugestoes_Page SHALL exibir para cada registro: nome, descrição, preço e status.
3. WHEN o usuário clica em "Nova Sugestão", THE Sugestoes_Page SHALL exibir um formulário com campos: nome (obrigatório), descrição, preço (numérico), URL de imagem e status inicial.
4. WHEN o formulário de criação é submetido com dados válidos, THE Sugestoes_Page SHALL inserir o registro na tabela `ai_suggestions` via Dynamic_Client e atualizar a listagem.
5. WHEN o usuário edita ou exclui um registro, THE Sugestoes_Page SHALL atualizar ou remover o registro na tabela `ai_suggestions` via Dynamic_Client.
6. WHEN o usuário alterna o toggle de status, THE Sugestoes_Page SHALL atualizar o campo `status` na tabela `ai_suggestions` via Dynamic_Client.
7. IF uma operação de escrita no Dynamic_Client falhar, THEN THE Sugestoes_Page SHALL exibir uma notificação de erro.

---

### Requirement 10: CRUD de Eventos Especiais

**User Story:** Como cliente autenticado no Dashboard_Público com `show_ia_content = true`, quero gerenciar eventos especiais do meu estabelecimento, para que o agente de IA possa divulgar festivais, datas comemorativas e programações sazonais.

#### Acceptance Criteria

1. THE Eventos_Page SHALL listar todos os registros da tabela `ai_events` do Client_Supabase ordenados por data.
2. THE Eventos_Page SHALL exibir para cada registro: título, descrição, data, horário e localização.
3. WHEN o usuário clica em "Novo Evento", THE Eventos_Page SHALL exibir um formulário com campos: título (obrigatório), descrição, data (obrigatório), horário, localização e status inicial.
4. WHEN o formulário de criação é submetido com dados válidos, THE Eventos_Page SHALL inserir o registro na tabela `ai_events` via Dynamic_Client e atualizar a listagem.
5. WHEN o usuário edita ou exclui um registro, THE Eventos_Page SHALL atualizar ou remover o registro na tabela `ai_events` via Dynamic_Client.
6. IF uma operação de escrita no Dynamic_Client falhar, THEN THE Eventos_Page SHALL exibir uma notificação de erro.

---

### Requirement 11: CRUD de Avisos

**User Story:** Como cliente autenticado no Dashboard_Público com `show_ia_content = true`, quero gerenciar avisos rápidos, para que o agente de IA possa comunicar mudanças imediatas como cancelamentos ou lotação máxima.

#### Acceptance Criteria

1. THE Avisos_Page SHALL listar todos os registros da tabela `ai_notices` do Client_Supabase.
2. THE Avisos_Page SHALL exibir para cada registro: mensagem, prioridade (alta/média/baixa), validade e status.
3. THE Avisos_Page SHALL diferenciar visualmente os avisos por prioridade: alta em vermelho, média em amarelo, baixa em cinza.
4. WHEN o usuário clica em "Novo Aviso", THE Avisos_Page SHALL exibir um formulário com campos: mensagem (obrigatório), prioridade (obrigatório, seleção entre alta/média/baixa), validade e status inicial.
5. WHEN o formulário de criação é submetido com dados válidos, THE Avisos_Page SHALL inserir o registro na tabela `ai_notices` via Dynamic_Client e atualizar a listagem.
6. WHEN o usuário edita ou exclui um registro, THE Avisos_Page SHALL atualizar ou remover o registro na tabela `ai_notices` via Dynamic_Client.
7. WHEN o usuário alterna o toggle de status, THE Avisos_Page SHALL atualizar o campo `status` na tabela `ai_notices` via Dynamic_Client.
8. IF uma operação de escrita no Dynamic_Client falhar, THEN THE Avisos_Page SHALL exibir uma notificação de erro.

---

### Requirement 12: Configurações do Agente IA

**User Story:** Como cliente autenticado no Dashboard_Público com `show_ia_content = true`, quero configurar os dados do estabelecimento e o comportamento do agente de IA, para que as respostas automáticas reflitam informações atualizadas.

#### Acceptance Criteria

1. THE Configuracoes_Page SHALL carregar o registro existente da tabela `ai_settings` do Client_Supabase ao ser renderizada.
2. THE Configuracoes_Page SHALL exibir campos editáveis para: nome do estabelecimento, telefone, Instagram, endereço, horário de funcionamento e mensagem de boas-vindas.
3. THE Configuracoes_Page SHALL exibir toggles para: resposta automática 24h e encaminhar para humano.
4. WHEN o usuário clica em "Salvar", THE Configuracoes_Page SHALL fazer upsert do registro na tabela `ai_settings` via Dynamic_Client (inserir se não existir, atualizar se existir).
5. IF o upsert no Dynamic_Client falhar, THEN THE Configuracoes_Page SHALL exibir uma notificação de erro com a mensagem retornada.
6. WHEN o upsert for bem-sucedido, THE Configuracoes_Page SHALL exibir uma notificação de sucesso.

---

### Requirement 13: Migration SQL para o Client_Supabase

**User Story:** Como CRM_Admin, quero um script SQL completo para criar as tabelas necessárias no Supabase do cliente, para que eu possa configurar o ambiente do cliente sem precisar criar as tabelas manualmente.

#### Acceptance Criteria

1. THE Migration_SQL SHALL criar a tabela `ai_schedule` com colunas: `id` (uuid, primary key, default gen_random_uuid()), `artist` (text, not null), `date` (date, not null), `time` (time, not null), `description` (text), `status` (text, not null, default 'active'), `created_at` (timestamptz, default now()).
2. THE Migration_SQL SHALL criar a tabela `ai_promotions` com colunas: `id` (uuid, primary key), `title` (text, not null), `description` (text), `validity` (text), `type` (text), `status` (text, not null, default 'active'), `created_at` (timestamptz, default now()).
3. THE Migration_SQL SHALL criar a tabela `ai_suggestions` com colunas: `id` (uuid, primary key), `name` (text, not null), `description` (text), `price` (numeric(10,2)), `image_url` (text), `status` (text, not null, default 'active'), `created_at` (timestamptz, default now()).
4. THE Migration_SQL SHALL criar a tabela `ai_events` com colunas: `id` (uuid, primary key), `title` (text, not null), `description` (text), `date` (date, not null), `time` (time), `location` (text), `created_at` (timestamptz, default now()).
5. THE Migration_SQL SHALL criar a tabela `ai_notices` com colunas: `id` (uuid, primary key), `message` (text, not null), `priority` (text, not null, check in ('alta','média','baixa')), `validity` (text), `status` (text, not null, default 'active'), `created_at` (timestamptz, default now()).
6. THE Migration_SQL SHALL criar a tabela `ai_settings` com colunas: `id` (uuid, primary key), `establishment_name` (text), `phone` (text), `instagram` (text), `address` (text), `opening_hours` (text), `welcome_message` (text), `auto_reply_24h` (boolean, default true), `forward_to_human` (boolean, default true), `created_at` (timestamptz, default now()), `updated_at` (timestamptz, default now()).
7. THE Migration_SQL SHALL habilitar Row Level Security (RLS) em todas as seis tabelas e criar políticas que permitam acesso público de leitura e escrita via `anon` key.
8. THE Migration_SQL SHALL ser idempotente, usando `CREATE TABLE IF NOT EXISTS` para todas as tabelas.

---

### Requirement 14: Atualização do Cadastro de Clientes no CRM (Banco de Dados)

**User Story:** Como CRM_Admin, quero que os novos campos de credenciais e o flag `show_ia_content` sejam persistidos na tabela `clients` do CRM, para que as informações estejam disponíveis ao carregar o Dashboard_Público.

#### Acceptance Criteria

1. THE tabela `clients` do CRM SHALL conter os campos `client_supabase_url` (text, nullable), `client_supabase_anon_key` (text, nullable) e `show_ia_content` (boolean, default false).
2. THE RPC `get_client_by_slug` SHALL retornar os campos `client_supabase_url`, `client_supabase_anon_key` e `show_ia_content` no resultado.
3. THE Migration_SQL do CRM SHALL adicionar os três campos à tabela `clients` usando `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
4. WHEN o CRM_Admin salva as configurações na ClientIntegrationsTab, THE ClientIntegrationsTab SHALL persistir os três campos na tabela `clients` via Supabase do CRM.

---

### Requirement 15: Preservação do Conteúdo Atual (Performance e Atendimento)

**User Story:** Como cliente autenticado no Dashboard_Público, quero que as seções de Performance e Atendimento continuem funcionando exatamente como antes, para que a evolução do layout não quebre funcionalidades existentes.

#### Acceptance Criteria

1. THE Performance_Page SHALL conter todo o conteúdo atualmente presente no `PublicDashboardPage.tsx` referente à aba "performance", incluindo métricas de anúncios, evolução diária, funil de conversão, top campanhas, KPIs e impacto da parceria.
2. THE Atendimento_Page SHALL conter todo o conteúdo atualmente presente no `PublicDashboardPage.tsx` referente à aba "atendimento", incluindo o componente `ConversationKpiDashboard`.
3. THE Dashboard_Público SHALL manter o mecanismo de auto-logout após 30 minutos de inatividade em todas as rotas.
4. THE Dashboard_Público SHALL manter o filtro de período (PeriodDropdown) e o menu de perfil (alterar senha, encerrar sessão) acessíveis em todas as rotas do Módulo_Resultados.
5. WHEN o cliente acessa `/public/dashboard/:slug` sem ter `dashboard_performance` ou `dashboard_atendimento` habilitados, THE Dashboard_Geral SHALL exibir o conteúdo consolidado sem redirecionar para as páginas desabilitadas.
