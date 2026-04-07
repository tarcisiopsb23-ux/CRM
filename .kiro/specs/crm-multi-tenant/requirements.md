# Requirements Document

## Introduction

Transformação do CRM atual de single-tenant para multi-tenant, mantendo os dados dos clientes no banco Supabase do CRM. A autenticação, controle de planos e limites de usuários passam a ser gerenciados por um SaaS externo da agência (banco separado). Cada tenant (cliente da agência) pode ter múltiplos usuários com acesso ao CRM, respeitando o limite definido pelo plano contratado no SaaS. A sessão de suporte da agência continua funcionando.

---

## Glossary

- **CRM_DB**: Banco de dados Supabase do CRM, onde ficam os dados dos clientes (campaigns, leads, KPIs, etc.)
- **SaaS_DB**: Banco de dados separado do SaaS externo da agência, responsável por autenticação, planos e limites
- **Tenant**: Um cliente da agência, identificado por um `tenant_id` único no CRM_DB
- **CRM_User**: Usuário com acesso ao dashboard do CRM, vinculado a um Tenant
- **SaaS_Auth**: Serviço de autenticação do SaaS externo da agência
- **Session_Token**: Token JWT emitido pelo SaaS_Auth após login bem-sucedido, contendo `tenant_id`, `user_id` e `role`
- **Plan**: Plano contratado pelo Tenant no SaaS, que define o número máximo de CRM_Users permitidos
- **Support_Session**: Sessão especial da agência com acesso a qualquer Tenant sem restrição de plano
- **Agency**: A agência proprietária do SaaS e do CRM
- **RLS**: Row Level Security — mecanismo do Supabase para isolar dados por tenant no CRM_DB

---

## Requirements

### Requirement 1: Isolamento de Dados por Tenant

**User Story:** Como agência, quero que os dados de cada cliente fiquem isolados no mesmo banco CRM, para que um tenant nunca acesse dados de outro.

#### Acceptance Criteria

1. THE CRM_DB SHALL associar cada registro das tabelas `clients`, `campaign_data`, `daily_metrics`, `client_kpis`, `client_kpi_history`, `crm_leads`, `ad_click_sessions`, `client_conversation_kpis` a um `tenant_id` do tipo UUID.
2. THE CRM_DB SHALL aplicar Row Level Security (RLS) em todas as tabelas listadas no critério 1, de forma que cada query retorne apenas registros cujo `tenant_id` corresponda ao tenant autenticado na sessão.
3. WHEN uma query é executada sem um `tenant_id` válido na sessão, THE CRM_DB SHALL retornar zero registros para todas as tabelas protegidas por RLS.
4. IF um CRM_User tenta acessar um registro de outro tenant, THEN THE CRM_DB SHALL rejeitar a operação e retornar erro de autorização.
5. THE CRM_DB SHALL remover todos os filtros `LIMIT 1` das queries que existiam para simular isolamento single-tenant, substituindo-os pelo isolamento via RLS.

---

### Requirement 2: Autenticação via SaaS Externo

**User Story:** Como CRM_User, quero fazer login com minhas credenciais do SaaS da agência, para que eu não precise de uma senha separada para o CRM.

#### Acceptance Criteria

1. WHEN um CRM_User submete email e senha na tela de login do CRM, THE CRM_Frontend SHALL enviar as credenciais ao SaaS_Auth para validação.
2. WHEN o SaaS_Auth valida as credenciais com sucesso, THE SaaS_Auth SHALL retornar um Session_Token contendo `tenant_id`, `user_id` e `role`.
3. WHEN o CRM_Frontend recebe um Session_Token válido, THE CRM_Frontend SHALL armazenar o token em memória de sessão e utilizá-lo em todas as requisições subsequentes ao CRM_DB.
4. WHEN o Session_Token expira, THE CRM_Frontend SHALL redirecionar o CRM_User para a tela de login sem expor dados da sessão anterior.
5. IF o SaaS_Auth retorna erro de credenciais inválidas, THEN THE CRM_Frontend SHALL exibir mensagem de erro genérica sem revelar se o email ou a senha estão incorretos.
6. THE CRM_Frontend SHALL remover o mecanismo atual de autenticação via RPC `validate_client_dashboard_password` com senha armazenada em `clients.metadata`.

---

### Requirement 3: Propagação do Tenant para o CRM_DB

**User Story:** Como desenvolvedor, quero que o `tenant_id` do Session_Token seja propagado para o CRM_DB em cada requisição, para que o RLS funcione corretamente.

#### Acceptance Criteria

1. WHEN o CRM_Frontend realiza uma requisição ao CRM_DB, THE CRM_Frontend SHALL incluir o Session_Token no header de autorização da requisição.
2. THE CRM_DB SHALL extrair o `tenant_id` do Session_Token e configurá-lo como variável de sessão (`app.current_tenant_id`) antes de executar qualquer query.
3. THE CRM_DB SHALL utilizar a variável de sessão `app.current_tenant_id` como critério de filtragem nas políticas RLS de todas as tabelas protegidas.
4. IF o Session_Token não contém um `tenant_id` válido, THEN THE CRM_DB SHALL rejeitar a requisição com erro de autenticação.

---

### Requirement 4: Múltiplos Usuários por Tenant

**User Story:** Como cliente da agência (tenant), quero que múltiplos membros da minha equipe acessem o CRM, para que não precisemos compartilhar uma única senha.

#### Acceptance Criteria

1. THE CRM_DB SHALL manter uma tabela `tenant_users` que associa `user_id` (do SaaS_Auth) a `tenant_id`, com campos `role` e `created_at`.
2. WHEN um CRM_User faz login com sucesso, THE CRM_Frontend SHALL carregar os dados do tenant correspondente ao `tenant_id` do Session_Token.
3. THE CRM_DB SHALL suportar múltiplos registros em `tenant_users` para o mesmo `tenant_id`, permitindo que um tenant tenha mais de um CRM_User ativo simultaneamente.
4. WHEN dois CRM_Users do mesmo tenant acessam o CRM ao mesmo tempo, THE CRM_DB SHALL retornar os mesmos dados para ambos, respeitando o isolamento de tenant.

---

### Requirement 5: Controle de Limite de Usuários por Plano

**User Story:** Como agência, quero que o número de usuários por tenant seja limitado pelo plano contratado no SaaS, para que os limites comerciais sejam respeitados.

#### Acceptance Criteria

1. THE SaaS_Auth SHALL expor um endpoint que retorna o número máximo de CRM_Users permitidos para um dado `tenant_id` com base no plano ativo.
2. WHEN um CRM_User tenta convidar um novo usuário para o tenant, THE CRM_Frontend SHALL consultar o SaaS_Auth para verificar se o limite do plano foi atingido.
3. IF o número atual de CRM_Users do tenant é igual ao limite do plano, THEN THE CRM_Frontend SHALL bloquear o convite e exibir mensagem informando o limite atingido e o plano atual.
4. WHEN o plano de um tenant é atualizado no SaaS para um limite maior, THE CRM_Frontend SHALL refletir o novo limite na próxima verificação sem necessidade de ação manual.
5. THE CRM_DB SHALL armazenar apenas o `user_id` e `tenant_id` na tabela `tenant_users`, sem replicar informações de plano do SaaS_DB para o CRM_DB.

---

### Requirement 6: Cadastro de Usuários Adicionais no CRM

**User Story:** Como administrador de um tenant, quero convidar novos usuários diretamente pelo CRM, para que eu não precise acessar o painel do SaaS para cada adição.

#### Acceptance Criteria

1. WHEN um CRM_User com role `admin` acessa a tela de gerenciamento de usuários, THE CRM_Frontend SHALL exibir a lista de CRM_Users ativos do tenant e o limite do plano atual.
2. WHEN um admin submete o email de um novo usuário para convite, THE CRM_Frontend SHALL enviar a solicitação de criação ao SaaS_Auth, que é responsável por criar a conta e enviar o convite.
3. WHEN o SaaS_Auth confirma a criação do novo usuário, THE CRM_DB SHALL registrar o novo `user_id` na tabela `tenant_users` com role `member`.
4. IF o SaaS_Auth retorna erro ao criar o usuário (ex: email já cadastrado, limite atingido), THEN THE CRM_Frontend SHALL exibir a mensagem de erro retornada pelo SaaS_Auth.
5. WHEN um admin remove um CRM_User do tenant, THE CRM_DB SHALL excluir o registro correspondente em `tenant_users` e THE CRM_Frontend SHALL notificar o SaaS_Auth para revogar o acesso.

---

### Requirement 7: Sessão de Suporte da Agência

**User Story:** Como agência, quero manter uma sessão de suporte que acessa qualquer tenant, para que possamos prestar suporte técnico sem precisar das credenciais do cliente.

#### Acceptance Criteria

1. WHEN um usuário da agência faz login com credenciais de suporte no SaaS_Auth, THE SaaS_Auth SHALL emitir um Session_Token com `role = support` e sem `tenant_id` fixo.
2. WHEN o CRM_Frontend detecta `role = support` no Session_Token, THE CRM_Frontend SHALL exibir um seletor de tenant para que o agente de suporte escolha qual tenant visualizar.
3. WHEN um agente de suporte seleciona um tenant, THE CRM_Frontend SHALL incluir o `tenant_id` selecionado nas requisições ao CRM_DB para aquela sessão.
4. THE CRM_DB SHALL aceitar requisições de suporte com `tenant_id` arbitrário quando o Session_Token contiver `role = support`, sem restrição de RLS por tenant.
5. THE CRM_Frontend SHALL exibir um indicador visual permanente quando a sessão ativa for uma Support_Session, para distingui-la de uma sessão de CRM_User normal.
6. THE CRM_Frontend SHALL remover o mecanismo atual de suporte via RPC `validate_support_password` com senha armazenada em `clients.metadata`.

---

### Requirement 8: Migração dos Dados Existentes

**User Story:** Como agência, quero que os dados do banco CRM atual sejam migrados para o modelo multi-tenant sem perda de dados, para que os clientes existentes não sejam impactados.

#### Acceptance Criteria

1. THE Migration_Script SHALL adicionar a coluna `tenant_id UUID NOT NULL` em todas as tabelas listadas no Requirement 1, critério 1.
2. THE Migration_Script SHALL popular o `tenant_id` de todos os registros existentes com o UUID do tenant correspondente ao cliente atual (único cliente no banco single-tenant).
3. THE Migration_Script SHALL adicionar a coluna `client_id UUID` na tabela `crm_leads`, que atualmente não possui essa coluna, e populá-la com o `tenant_id` do cliente existente.
4. WHEN a Migration_Script é executada, THE CRM_DB SHALL manter todos os dados existentes intactos, sem exclusão ou alteração de valores de negócio.
5. THE Migration_Script SHALL ser idempotente: executada mais de uma vez no mesmo banco, THE Migration_Script SHALL produzir o mesmo resultado sem erros.

---

### Requirement 9: Compatibilidade com Integrações Existentes (OAuth, Edge Functions)

**User Story:** Como agência, quero que as integrações com Meta Ads, Google Ads e GA4 continuem funcionando após a migração, para que os clientes não percam acesso aos dados de performance.

#### Acceptance Criteria

1. THE CRM_DB SHALL manter a tabela de tokens OAuth associada a `tenant_id` em vez de `client_id` (ou garantir que `client_id` seja equivalente a `tenant_id` após a migração).
2. WHEN uma Edge Function (meta-ads-metrics, gads-metrics, ga4-metrics) é invocada, THE Edge_Function SHALL receber o `tenant_id` como parâmetro e utilizá-lo para buscar o token OAuth correspondente no CRM_DB.
3. IF uma Edge Function não encontra token OAuth válido para o `tenant_id` fornecido, THEN THE Edge_Function SHALL retornar erro descritivo sem expor tokens de outros tenants.
4. THE oauth-exchange Edge Function SHALL associar novos tokens ao `tenant_id` correto extraído do Session_Token da requisição.

