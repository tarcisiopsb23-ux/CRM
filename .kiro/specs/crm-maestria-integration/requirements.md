# Requirements Document

## Introduction

Módulo de integração entre o **Maestr.ia** (sistema de gestão da agência) e o **C8 Control** (CRM multi-tenant dos clientes). O objetivo é separar responsabilidades: o Maestr.ia controla exclusivamente o aspecto financeiro e os limites de acesso de cada tenant, enquanto o C8 Control gerencia autenticação, dados e configurações individuais. A comunicação é unidirecional — o Maestr.ia publica, o C8 Control consome via API autenticada por chave de serviço. Usuários do C8 Control nunca acessam o Maestr.ia; usuários do Maestr.ia nunca acessam o C8 Control.

---

## Glossary

- **Maestr.ia**: Sistema de gestão da agência (Supabase: owwaulaenabbdalycusx.supabase.co), responsável por controle financeiro e limites de acesso dos tenants
- **C8_Control**: CRM multi-tenant dos clientes da agência (Supabase: xcymhcqbyyuozkzhpxgi.supabase.co), responsável por autenticação, dados e configurações de cada tenant
- **Tenant**: Um cliente da agência, identificado por um `tenant_id` UUID único, presente em ambos os sistemas com o mesmo valor
- **CRM_Tenant_Config**: Tabela no Maestr.ia que centraliza o controle de status, plano e contrato de cada tenant do C8 Control
- **Tenant_Config_Cache**: Tabela no C8 Control que armazena localmente as configurações vindas do Maestr.ia, evitando chamadas síncronas a cada requisição
- **CRM_API_KEY**: Chave secreta compartilhada entre os dois sistemas, usada para autenticar chamadas da Edge Function `tenant-status` à Edge Function `crm-tenant-api`. Nunca exposta ao frontend
- **Agency_Admin**: Usuário do Maestr.ia com permissão de gerenciar tenants do C8 Control (role de agência)
- **Support_User**: Usuário `suporte@agenciac8.com.br` com `role = 'support'` no JWT do C8 Control, que acessa todos os tenants via bypass de RLS. Não é gerenciado pelo Maestr.ia
- **Tenant_Status**: Estado atual de acesso de um tenant: `ativo`, `bloqueado`, `suspenso` ou `cancelado`
- **crm-tenant-api**: Edge Function no Maestr.ia que expõe a API de leitura de configurações de tenants, autenticada por CRM_API_KEY
- **tenant-status**: Edge Function no C8 Control que consulta a `crm-tenant-api` e atualiza o Tenant_Config_Cache
- **useTenantStatus**: Hook React no C8 Control que consome o Tenant_Config_Cache e gerencia sincronização periódica

---

## Requirements

### Requirement 1: Tabela de Configuração de Tenants no Maestr.ia

**User Story:** Como Agency_Admin, quero uma tabela centralizada no Maestr.ia com o status e configurações de cada tenant do C8 Control, para que eu possa gerenciar contratos e acessos sem precisar acessar o banco do C8 Control.

#### Acceptance Criteria

1. THE Maestr.ia SHALL manter uma tabela `crm_tenant_config` com os campos: `tenant_id` (UUID, único), `status` (TEXT, valores permitidos: `ativo`, `bloqueado`, `suspenso`, `cancelado`), `max_users` (INTEGER), `plan_name` (TEXT), `blocked_reason` (TEXT, nullable), `contract_start` (DATE, nullable), `contract_end` (DATE, nullable), `monthly_value` (NUMERIC(10,2), nullable), `client_name` (TEXT, nullable), `notes` (TEXT, nullable), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ).
2. THE Maestr.ia SHALL aplicar um trigger que atualiza automaticamente o campo `updated_at` da tabela `crm_tenant_config` a cada operação de UPDATE.
3. THE Maestr.ia SHALL aplicar Row Level Security na tabela `crm_tenant_config` de forma que apenas usuários autenticados com role de agência possam ler ou modificar os registros.
4. IF um registro é inserido em `crm_tenant_config` sem valor explícito para `status`, THEN THE Maestr.ia SHALL definir `status = 'ativo'` como valor padrão.
5. IF um registro é inserido em `crm_tenant_config` sem valor explícito para `max_users`, THEN THE Maestr.ia SHALL definir `max_users = 3` como valor padrão.
6. THE Maestr.ia SHALL criar índices em `crm_tenant_config` nas colunas `tenant_id` e `status` para garantir performance nas consultas de listagem e filtragem.

---

### Requirement 2: Tabela de Pagamentos no Maestr.ia

**User Story:** Como Agency_Admin, quero registrar e acompanhar os pagamentos de cada tenant no Maestr.ia, para que o controle financeiro fique centralizado e separado do C8 Control.

#### Acceptance Criteria

1. THE Maestr.ia SHALL manter uma tabela `crm_payments` com os campos: `id` (UUID), `tenant_id` (UUID, FK para `crm_tenant_config.tenant_id`), `description` (TEXT), `amount` (NUMERIC(10,2)), `due_date` (DATE), `paid_at` (TIMESTAMPTZ, nullable), `status` (TEXT, valores permitidos: `pendente`, `pago`, `vencido`, `cancelado`), `payment_method` (TEXT, nullable), `notes` (TEXT, nullable), `created_at` (TIMESTAMPTZ).
2. IF um registro é inserido em `crm_payments` sem valor explícito para `status`, THEN THE Maestr.ia SHALL definir `status = 'pendente'` como valor padrão.
3. THE Maestr.ia SHALL aplicar Row Level Security na tabela `crm_payments` de forma que apenas usuários autenticados com role de agência possam ler ou modificar os registros.
4. THE Maestr.ia SHALL criar índices em `crm_payments` nas colunas `tenant_id`, `status` e `due_date` para garantir performance nas consultas de listagem e filtragem por vencimento.

---

### Requirement 3: Edge Function `crm-tenant-api` no Maestr.ia

**User Story:** Como C8_Control, quero consumir uma API segura no Maestr.ia para obter as configurações de um tenant, para que o C8 Control possa verificar status e limites sem acesso direto ao banco do Maestr.ia.

#### Acceptance Criteria

1. THE crm-tenant-api SHALL validar o header `x-crm-api-key` em todas as requisições e retornar HTTP 401 com mensagem de erro quando a chave estiver ausente ou incorreta.
2. WHEN uma requisição GET com parâmetro `tenant_id` válido é recebida, THE crm-tenant-api SHALL retornar um objeto JSON com os campos `tenant_id`, `status`, `max_users`, `plan_name`, `blocked_reason` e `contract_end` do registro correspondente em `crm_tenant_config`.
3. WHEN uma requisição GET com parâmetro `tenant_id` é recebida e não existe registro correspondente em `crm_tenant_config`, THE crm-tenant-api SHALL retornar um objeto JSON com valores padrão: `{ status: "ativo", max_users: 3, plan_name: "Starter" }`.
4. WHEN uma requisição GET com parâmetro `action=list` é recebida, THE crm-tenant-api SHALL retornar um array JSON com todos os registros de `crm_tenant_config`, contendo os campos `tenant_id`, `status`, `max_users`, `plan_name`, `client_name` e `contract_end`, ordenados por `client_name`.
5. THE crm-tenant-api SHALL utilizar a service role key do Maestr.ia para acessar o banco de dados, nunca a anon key.
6. THE CRM_API_KEY SHALL ser armazenada exclusivamente como secret das Edge Functions do Maestr.ia e nunca exposta em código-fonte ou variáveis de ambiente do frontend.

---

### Requirement 4: Módulo Gerencial no Frontend do Maestr.ia

**User Story:** Como Agency_Admin, quero um módulo gerencial no Maestr.ia para visualizar, cadastrar e gerenciar todos os tenants do C8 Control, para que eu possa controlar contratos e acessos sem precisar de ferramentas externas.

#### Acceptance Criteria

1. THE Maestr.ia SHALL exibir o módulo gerencial apenas para usuários autenticados com role de agência, redirecionando para `/dashboard` qualquer usuário sem essa permissão.
2. THE Maestr.ia SHALL exibir uma lista de todos os tenants cadastrados em `crm_tenant_config` com as colunas: nome do cliente, plano, status, vencimento do contrato e ações disponíveis.
3. THE Maestr.ia SHALL permitir filtrar a lista de tenants por status (`ativo`, `bloqueado`, `suspenso`, `cancelado`) e buscar por nome do cliente.
4. WHEN um Agency_Admin submete o formulário de cadastro de novo tenant com `tenant_id`, nome, plano, limite de usuários, valor mensal e data de início, THE Maestr.ia SHALL criar um registro em `crm_tenant_config` com os dados fornecidos.
5. WHEN um Agency_Admin altera o status de um tenant para `bloqueado`, THE Maestr.ia SHALL exigir o preenchimento do campo `blocked_reason` antes de salvar a alteração.
6. WHEN um Agency_Admin renova o contrato de um tenant, THE Maestr.ia SHALL atualizar o campo `contract_end` em `crm_tenant_config` com a nova data informada.
7. WHEN um Agency_Admin registra um pagamento manual para um tenant, THE Maestr.ia SHALL criar um registro em `crm_payments` com os dados fornecidos e atualizar o campo `paid_at` quando o status for `pago`.
8. THE Maestr.ia SHALL exibir alerta visual para tenants cujo `contract_end` esteja dentro dos próximos 30 dias a partir da data atual.
9. THE Maestr.ia SHALL exibir a lista de pagamentos pendentes e vencidos de cada tenant na tela de gestão individual.

---

### Requirement 5: Tabela de Cache no C8 Control

**User Story:** Como C8_Control, quero armazenar localmente as configurações vindas do Maestr.ia em uma tabela de cache, para que a verificação de status não dependa de chamadas síncronas ao Maestr.ia a cada requisição.

#### Acceptance Criteria

1. THE C8_Control SHALL manter uma tabela `tenant_config_cache` com os campos: `tenant_id` (UUID, PK), `status` (TEXT), `max_users` (INTEGER), `plan_name` (TEXT), `blocked_reason` (TEXT, nullable), `contract_end` (DATE, nullable), `synced_at` (TIMESTAMPTZ).
2. THE C8_Control SHALL aplicar Row Level Security na tabela `tenant_config_cache` de forma que cada tenant leia apenas seu próprio registro, e usuários com `role = 'support'` no JWT leiam qualquer registro.
3. THE C8_Control SHALL permitir operações de INSERT e UPDATE na tabela `tenant_config_cache` apenas via service role key (Edge Function `tenant-status`), bloqueando escrita por usuários autenticados via anon key.
4. IF um registro é inserido em `tenant_config_cache` sem valor explícito para `status`, THEN THE C8_Control SHALL definir `status = 'ativo'` como valor padrão.

---

### Requirement 6: Edge Function `tenant-status` no C8 Control

**User Story:** Como C8_Control, quero uma Edge Function que consulte o Maestr.ia e atualize o cache local, para que o status do tenant esteja sempre disponível localmente sem expor a CRM_API_KEY ao frontend.

#### Acceptance Criteria

1. THE tenant-status SHALL extrair o `tenant_id` do JWT da requisição e retornar HTTP 401 quando o `tenant_id` não estiver presente no token.
2. WHEN invocada com um JWT válido contendo `tenant_id`, THE tenant-status SHALL realizar uma requisição GET à `crm-tenant-api` com o header `x-crm-api-key` e o parâmetro `tenant_id`.
3. WHEN a `crm-tenant-api` retorna com sucesso, THE tenant-status SHALL realizar um UPSERT na tabela `tenant_config_cache` do C8 Control com os dados recebidos, atualizando o campo `synced_at` com o timestamp atual.
4. IF a `crm-tenant-api` retornar erro HTTP ou timeout, THEN THE tenant-status SHALL retornar HTTP 503 com mensagem descritiva sem sobrescrever o cache existente.
5. THE CRM_API_KEY e a MAESTRIA_CRM_API_URL SHALL ser armazenadas exclusivamente como secrets das Edge Functions do C8 Control e nunca expostas ao frontend.
6. THE tenant-status SHALL utilizar a service role key do C8 Control para realizar o UPSERT na tabela `tenant_config_cache`, garantindo que a operação não seja bloqueada pelo RLS.

---

### Requirement 7: Verificação de Status no Login do C8 Control

**User Story:** Como C8_Control, quero verificar o status do tenant imediatamente após o login, para que tenants bloqueados ou cancelados não consigam acessar o dashboard.

#### Acceptance Criteria

1. WHEN um usuário conclui o login com sucesso no C8 Control, THE C8_Control SHALL consultar a tabela `tenant_config_cache` para obter o status atual do tenant antes de redirecionar para o dashboard.
2. IF o status do tenant no cache for `bloqueado`, THEN THE C8_Control SHALL encerrar a sessão do usuário e exibir a mensagem: `"Acesso bloqueado: {blocked_reason}"`, onde `{blocked_reason}` é o valor do campo correspondente no cache, ou `"Entre em contato com a agência."` quando o campo estiver vazio.
3. IF o status do tenant no cache for `cancelado`, THEN THE C8_Control SHALL encerrar a sessão do usuário e exibir a mensagem: `"Contrato cancelado. Entre em contato com a agência."`.
4. IF o status do tenant no cache for `suspenso`, THEN THE C8_Control SHALL encerrar a sessão do usuário e exibir mensagem informando a suspensão e orientando o contato com a agência.
5. WHEN o cache não contém registro para o tenant (primeira sincronização), THE C8_Control SHALL invocar a Edge Function `tenant-status` para popular o cache antes de verificar o status.
6. THE C8_Control SHALL aplicar a verificação de status apenas para usuários com `tenant_id` no JWT, nunca para o Support_User com `role = 'support'`.

---

### Requirement 8: Sincronização Periódica do Cache

**User Story:** Como C8_Control, quero sincronizar o cache de configurações do tenant a cada 30 minutos enquanto o usuário está logado, para que alterações feitas no Maestr.ia (como bloqueio) sejam refletidas sem exigir novo login.

#### Acceptance Criteria

1. WHEN um usuário está com sessão ativa no C8 Control, THE useTenantStatus SHALL invocar a Edge Function `tenant-status` imediatamente ao montar o componente principal do dashboard.
2. WHILE uma sessão de usuário está ativa no C8 Control, THE useTenantStatus SHALL invocar a Edge Function `tenant-status` a cada 30 minutos.
3. WHEN a sincronização periódica detecta que o status do tenant mudou para `bloqueado` ou `cancelado`, THE C8_Control SHALL encerrar a sessão do usuário e exibir a mensagem de bloqueio correspondente.
4. WHEN o componente que utiliza o useTenantStatus é desmontado, THE useTenantStatus SHALL cancelar o intervalo de sincronização para evitar chamadas desnecessárias.
5. THE useTenantStatus SHALL expor o status atual, `blocked_reason`, `contract_end`, `plan_name` e `max_users` para consumo pelos componentes do dashboard.
6. THE useTenantStatus SHALL aplicar a sincronização periódica apenas para usuários com `tenant_id` no JWT, nunca para o Support_User com `role = 'support'`.

---

### Requirement 9: Aviso de Contrato Próximo do Vencimento no C8 Control

**User Story:** Como usuário do C8 Control, quero ser avisado quando o contrato do meu tenant estiver próximo do vencimento, para que eu possa contatar a agência com antecedência.

#### Acceptance Criteria

1. WHEN o campo `contract_end` do Tenant_Config_Cache indica uma data dentro dos próximos 30 dias a partir da data atual, THE useTenantStatus SHALL retornar `isNearExpiry = true`.
2. WHEN `isNearExpiry` for `true`, THE C8_Control SHALL exibir um banner de aviso no dashboard informando a data de vencimento do contrato e orientando o contato com a agência.
3. THE C8_Control SHALL exibir o banner de aviso de vencimento apenas para usuários com `tenant_id` no JWT, nunca para o Support_User com `role = 'support'`.
4. WHEN o campo `contract_end` for `null` no Tenant_Config_Cache, THE useTenantStatus SHALL retornar `isNearExpiry = false`, indicando contrato sem data de expiração definida.

---

### Requirement 10: Isolamento do Support_User

**User Story:** Como agência, quero garantir que o Support_User do C8 Control não seja afetado pelas verificações de status do Maestr.ia, para que o suporte técnico nunca seja bloqueado por restrições de contrato de um tenant.

#### Acceptance Criteria

1. THE C8_Control SHALL identificar o Support_User exclusivamente pelo claim `role = 'support'` no JWT, sem consultar o Maestr.ia ou o Tenant_Config_Cache para esse usuário.
2. THE C8_Control SHALL ignorar todas as verificações de status de tenant (bloqueio, suspensão, cancelamento, vencimento) para requisições com `role = 'support'` no JWT.
3. THE C8_Control SHALL nunca registrar o Support_User na tabela `tenant_users` de nenhum tenant.
4. THE C8_Control SHALL nunca contabilizar o Support_User no limite de usuários (`max_users`) de nenhum tenant.
5. THE Maestr.ia SHALL não gerenciar o acesso do Support_User ao C8 Control — esse controle é exclusivo do claim `role = 'support'` no JWT emitido pelo banco do C8 Control.

---

### Requirement 11: Segurança da Comunicação entre Sistemas

**User Story:** Como agência, quero que a comunicação entre Maestr.ia e C8 Control seja segura e que a CRM_API_KEY nunca seja exposta ao frontend, para que nenhum usuário possa simular chamadas à API do Maestr.ia.

#### Acceptance Criteria

1. THE CRM_API_KEY SHALL ser armazenada exclusivamente como secret das Edge Functions de ambos os sistemas (Maestr.ia e C8 Control), nunca em variáveis de ambiente do frontend, código-fonte versionado ou localStorage.
2. THE C8_Control SHALL nunca realizar chamadas diretas à `crm-tenant-api` a partir do frontend — toda comunicação com o Maestr.ia SHALL ocorrer exclusivamente via Edge Function `tenant-status` no servidor.
3. THE crm-tenant-api SHALL rejeitar qualquer requisição que não contenha o header `x-crm-api-key` com o valor correto, retornando HTTP 401.
4. THE C8_Control SHALL nunca escrever dados no Maestr.ia — a comunicação é estritamente unidirecional: Maestr.ia publica, C8 Control consome.
5. THE Maestr.ia SHALL nunca expor dados de outros tenants em resposta a uma requisição com `tenant_id` específico — cada chamada à `crm-tenant-api` retorna apenas os dados do tenant solicitado.

