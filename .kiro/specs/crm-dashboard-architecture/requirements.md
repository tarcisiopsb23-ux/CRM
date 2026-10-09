# Requirements Document

## Introduction

Arquitetura completa do sistema CRM e Dashboard desenvolvido pela agência para seus parceiros. O sistema é hospedado no VPS de cada parceiro (modelo single-tenant), com banco de dados exclusivo por parceiro. A agência mantém controle centralizado de provisionamento e suporte técnico sem acesso direto ao banco do parceiro. O sistema integra WhatsApp (via agente n8n ou QR Code), rastreamento de conversões (Google Tag Manager, Meta Pixel), importação de dados via CSV e um dashboard com abas configuráveis por cliente.

Os specs existentes (`crm-database-schema`, `crm-dashboard-tab`, `crm-whatsapp`) cobrem partes específicas do sistema. Este documento especifica os requisitos de arquitetura transversal: modelo de hospedagem, gestão de acesso, integrações externas, rastreamento e configurações do perfil do parceiro.

## Glossary

- **Agência**: Empresa criadora e implementadora do CRM e Dashboard. Tem acesso privilegiado de suporte técnico.
- **Parceiro**: Cliente da agência que adquire o CRM/Dashboard para seu empreendimento. Acessa o sistema via credenciais próprias.
- **Cliente_do_Parceiro**: Pessoa física ou jurídica que contrata serviços do parceiro. Não tem acesso ao CRM/Dashboard.
- **CRM**: Sistema de gestão de relacionamento com clientes (leads, pipeline, interações) hospedado no VPS do parceiro.
- **Dashboard**: Painel de métricas e KPIs acessível ao parceiro via autenticação por e-mail e senha.
- **VPS_Parceiro**: Servidor Virtual Privado de propriedade ou contratado pelo parceiro, onde o CRM é hospedado.
- **Banco_Parceiro**: Instância de banco de dados exclusiva do parceiro, hospedada no VPS_Parceiro.
- **Agente_n8n**: Automação de fluxo de trabalho (n8n ou similar) usada para integração com WhatsApp e gestão de senhas.
- **Senha_Suporte**: Credencial temporária criada pela agência para acesso técnico ao CRM do parceiro.
- **Senha_Parceiro**: Credencial de acesso do parceiro ao seu próprio Dashboard/CRM.
- **GTM**: Google Tag Manager — sistema de gerenciamento de tags de rastreamento.
- **Meta_Pixel**: Código de rastreamento de conversões da Meta (Facebook/Instagram).
- **CSV_Import**: Funcionalidade de importação de registros de clientes/leads via arquivo CSV.
- **Column_Mapping**: Interface para associar colunas do CSV importado aos campos da tabela de destino.
- **RPC**: Remote Procedure Call — função SQL exposta pelo Supabase para operações seguras sem acesso direto ao banco.
- **metadata**: Campo JSONB na tabela `clients` que armazena configurações flexíveis do parceiro (flags de abas, senha, pixels, etc.).
- **dashboard_slug**: Identificador único do parceiro usado na URL do dashboard (`/dashboard/:slug`).

---

## Requirements

### Requirement 1: Modelo de Hospedagem Single-Tenant por Parceiro

**User Story:** Como agência, quero que cada parceiro tenha seu próprio banco de dados e instância do CRM no VPS dele, para que os dados de cada parceiro sejam completamente isolados dos demais.

#### Acceptance Criteria

1. THE Sistema SHALL hospedar uma instância independente do CRM por parceiro, sem compartilhamento de banco de dados entre parceiros distintos.
2. THE Banco_Parceiro SHALL ser exclusivo do parceiro, sem acesso a dados de outros parceiros ou da agência.
3. WHEN um parceiro acessa o Dashboard, THE Sistema SHALL autenticar o parceiro exclusivamente contra o Banco_Parceiro correspondente ao `dashboard_slug` informado.
4. THE Sistema SHALL garantir que o parceiro não tenha acesso ao banco de dados da agência em nenhuma operação.
5. THE Sistema SHALL garantir que o Cliente_do_Parceiro não tenha acesso ao CRM ou Dashboard do parceiro em nenhuma circunstância.

---

### Requirement 2: Autenticação do Parceiro por E-mail e Senha

**User Story:** Como parceiro, quero acessar meu Dashboard com e-mail e senha, para que meu acesso seja seguro e personalizado.

#### Acceptance Criteria

1. WHEN o parceiro acessa a URL `/dashboard/:slug`, THE Dashboard SHALL exibir uma tela de login solicitando e-mail e senha.
2. WHEN o parceiro submete e-mail e senha válidos para o slug informado, THE Dashboard SHALL autenticar o parceiro e exibir o conteúdo do dashboard.
3. IF o e-mail ou a senha informados não corresponderem ao registro do parceiro, THEN THE Dashboard SHALL exibir mensagem de erro sem revelar qual campo está incorreto.
4. THE Sistema SHALL armazenar a senha do parceiro no campo `metadata->>'dashboard_password'` da tabela `clients` do Banco_Parceiro.
5. WHEN o parceiro faz login com senha temporária (`has_temp_password = true`), THE Dashboard SHALL solicitar a troca de senha antes de liberar o acesso ao conteúdo.
6. THE RPC `validate_client_dashboard_password` SHALL validar e-mail e senha sem expor o hash ou o valor da senha na resposta.
7. THE RPC `get_client_by_slug` SHALL retornar os dados públicos do parceiro (flags de abas, favicon, nome) sem expor a senha armazenada.

---

### Requirement 3: Gestão de Senhas pela Agência via Automação

**User Story:** Como agência, quero criar, resetar e recuperar senhas do parceiro sem precisar acessar diretamente o banco do parceiro, para que o suporte técnico seja ágil e seguro.

#### Acceptance Criteria

1. THE Sistema SHALL expor uma RPC `recover_client_password` que permita à agência definir uma senha temporária para um parceiro, validando slug e e-mail.
2. WHEN a RPC `recover_client_password` é chamada com slug e e-mail válidos, THE Sistema SHALL atualizar `metadata->>'dashboard_password'` e definir `has_temp_password = true` no registro do parceiro.
3. THE Sistema SHALL expor uma RPC `update_client_dashboard_password` que permita ao parceiro trocar a senha temporária por uma definitiva, definindo `has_temp_password = false`.
4. WHERE um Agente_n8n estiver configurado, THE Sistema SHALL permitir que a agência acione as RPCs de gestão de senha via chamadas HTTP autenticadas, sem necessidade de acesso direto ao Banco_Parceiro.
5. IF o slug ou e-mail informados na RPC `recover_client_password` não corresponderem a nenhum parceiro, THEN THE Sistema SHALL retornar resposta vazia sem revelar a existência ou não do registro.

---

### Requirement 4: Senha de Suporte Técnico da Agência

**User Story:** Como agência, quero criar uma senha de suporte técnico no CRM do parceiro, para que eu possa acessar o sistema do parceiro para fins de diagnóstico sem usar as credenciais do parceiro.

#### Acceptance Criteria

1. THE Sistema SHALL suportar um campo `metadata->>'support_password'` na tabela `clients` para armazenar a senha de suporte técnico da agência.
2. WHEN a agência acessa o Dashboard com a senha de suporte, THE Dashboard SHALL autenticar o acesso e registrar que a sessão é de suporte técnico.
3. THE Sistema SHALL expor uma RPC para que a agência crie ou redefina a senha de suporte técnico de um parceiro, validando o slug.
4. WHEN uma sessão de suporte técnico está ativa, THE Dashboard SHALL exibir um indicador visual diferenciado informando que o acesso é de suporte.
5. IF a senha de suporte não estiver configurada para um parceiro, THEN THE Sistema SHALL tratar a tentativa de login com senha de suporte como credencial inválida.

---

### Requirement 5: Integração com WhatsApp — Agente Virtual n8n

**User Story:** Como parceiro, quero integrar meu CRM com um agente virtual de WhatsApp via n8n, para que conversas do WhatsApp alimentem automaticamente o pipeline de leads.

#### Acceptance Criteria

1. THE Sistema SHALL aceitar webhooks do Agente_n8n para criação e atualização de leads no CRM do parceiro.
2. WHEN o Agente_n8n envia dados de uma conversa do WhatsApp, THE Sistema SHALL criar ou atualizar o lead correspondente na tabela `crm_leads` com os campos: nome, telefone, `whatsapp_link`, `origin = 'whatsapp'`, `last_contact_at`.
3. THE Sistema SHALL suportar integração tanto com a API Oficial do WhatsApp Business quanto com soluções não-oficiais via Agente_n8n.
4. WHERE a integração com Agente_n8n estiver configurada, THE Dashboard SHALL exibir o status da conexão com o agente na seção de configurações de integrações.
5. IF o webhook do Agente_n8n contiver dados inválidos ou incompletos, THEN THE Sistema SHALL retornar HTTP 400 com mensagem descritiva sem criar registros parciais.

---

### Requirement 6: Integração com WhatsApp — QR Code para Identificação de Conversas

**User Story:** Como parceiro, quero conectar meu WhatsApp via QR Code para identificar conversas e alimentar o CRM, para que eu possa usar o sistema sem precisar de API oficial.

#### Acceptance Criteria

1. THE Sistema SHALL suportar autenticação do WhatsApp Web via QR Code usando a biblioteca `whatsapp-web.js` com persistência de sessão via LocalAuth.
2. WHEN o parceiro escaneia o QR Code, THE Sistema SHALL estabelecer a conexão e persistir a sessão localmente para evitar re-autenticação a cada reinicialização.
3. WHEN uma mensagem é recebida via WhatsApp Web, THE Sistema SHALL extrair nome, telefone, conteúdo e timestamp e criar ou atualizar o lead correspondente no CRM.
4. THE Sistema SHALL processar apenas mensagens recebidas em chats individuais, ignorando mensagens de grupos e mensagens enviadas pelo próprio usuário.
5. IF a sessão do WhatsApp Web expirar, THEN THE Sistema SHALL gerar um novo QR Code automaticamente sem encerrar o processo.
6. THE Dashboard SHALL exibir o status da conexão WhatsApp (conectado, aguardando QR, desconectado) na seção de configurações de integrações.

---

### Requirement 7: Rastreamento com Google Tag Manager

**User Story:** Como parceiro, quero configurar o Google Tag Manager no meu dashboard, para que eu possa rastrear eventos e conversões dos meus clientes sem precisar da agência.

#### Acceptance Criteria

1. THE Dashboard SHALL suportar a inclusão de um ID de contêiner do GTM (formato `GTM-XXXXXXX`) nas configurações de integrações do perfil do parceiro.
2. WHEN um ID de GTM válido está configurado, THE Dashboard SHALL injetar o snippet do GTM no `<head>` e no `<body>` da página conforme a especificação oficial do Google.
3. WHEN o parceiro salva um novo ID de GTM, THE Sistema SHALL armazenar o valor no campo `metadata->>'gtm_id'` do registro do parceiro.
4. IF o campo `metadata->>'gtm_id'` estiver ausente ou vazio, THEN THE Dashboard SHALL não injetar nenhum snippet de GTM.
5. THE Dashboard SHALL validar o formato do ID de GTM antes de salvar, rejeitando valores que não correspondam ao padrão `GTM-[A-Z0-9]+`.

---

### Requirement 8: Rastreamento com Meta Pixel

**User Story:** Como parceiro, quero configurar o Meta Pixel no meu dashboard, para que eu possa rastrear conversões de campanhas do Facebook e Instagram sem precisar da agência.

#### Acceptance Criteria

1. THE Dashboard SHALL suportar a inclusão de um ID de Meta Pixel (numérico, 15-16 dígitos) nas configurações de integrações do perfil do parceiro.
2. WHEN um ID de Meta Pixel válido está configurado, THE Dashboard SHALL injetar o snippet do Meta Pixel no `<head>` da página conforme a especificação oficial da Meta.
3. WHEN o parceiro salva um novo ID de Meta Pixel, THE Sistema SHALL armazenar o valor no campo `metadata->>'meta_pixel_id'` do registro do parceiro.
4. IF o campo `metadata->>'meta_pixel_id'` estiver ausente ou vazio, THEN THE Dashboard SHALL não injetar nenhum snippet de Meta Pixel.
5. THE Dashboard SHALL validar o formato do ID de Meta Pixel antes de salvar, rejeitando valores que não sejam numéricos com 15 a 16 dígitos.

---

### Requirement 9: Contabilização de Conversões

**User Story:** Como parceiro, quero que o sistema contabilize conversões automaticamente, para que eu possa medir o resultado das minhas campanhas de marketing.

#### Acceptance Criteria

1. WHEN um lead tem o status atualizado para `fechado` na tabela `crm_leads`, THE Sistema SHALL registrar o evento como uma conversão associada ao parceiro.
2. WHERE o GTM estiver configurado, THE Dashboard SHALL disparar um evento `conversion` via `dataLayer.push` quando um lead for marcado como fechado.
3. WHERE o Meta_Pixel estiver configurado, THE Dashboard SHALL disparar o evento `Purchase` via `fbq('track', 'Purchase')` quando um lead for marcado como fechado.
4. THE Dashboard SHALL exibir o total de conversões registradas no período selecionado na seção de métricas do dashboard.
5. THE Sistema SHALL armazenar o histórico de conversões com timestamp, `lead_id` e `campaign_id` (quando disponível) para auditoria.

---

### Requirement 10: Configurações de Perfil e Integrações pelo Parceiro

**User Story:** Como parceiro, quero acessar e configurar minhas integrações diretamente no perfil do dashboard, para que eu não precise solicitar suporte da agência para ajustes de configuração.

#### Acceptance Criteria

1. THE Dashboard SHALL disponibilizar uma tela de perfil acessível a partir do menu do dashboard autenticado.
2. THE Perfil SHALL permitir que o parceiro altere sua senha atual, exigindo confirmação da senha atual antes de aceitar a nova.
3. WHEN o parceiro submete a troca de senha com senha atual incorreta, THE Sistema SHALL rejeitar a operação e exibir mensagem de erro.
4. THE Perfil SHALL exibir uma seção de "Integrações" com campos para: ID do GTM, ID do Meta Pixel, chave de API do Agente_n8n e URL do webhook do WhatsApp.
5. WHEN o parceiro salva as configurações de integração, THE Sistema SHALL persistir os valores nos campos correspondentes do `metadata` do parceiro via RPC autenticada.
6. THE Perfil SHALL exibir o status atual de cada integração configurada (ativa, inativa, erro de conexão).
7. IF uma integração estiver com erro de conexão, THEN THE Perfil SHALL exibir uma mensagem descritiva do erro sem expor credenciais ou tokens.

---

### Requirement 11: Importação de Leads via CSV

**User Story:** Como parceiro, quero importar uma lista de leads a partir de um arquivo CSV, para que eu possa migrar dados de outras ferramentas sem precisar cadastrar cada lead manualmente.

#### Acceptance Criteria

1. THE Dashboard SHALL disponibilizar uma tela de importação de CSV acessível a partir do menu do CRM.
2. WHEN o parceiro faz upload de um arquivo CSV, THE Sistema SHALL analisar o arquivo e exibir uma prévia das primeiras 5 linhas com os cabeçalhos detectados.
3. THE Tela_de_Importação SHALL exibir uma interface de mapeamento de colunas onde o parceiro associa cada coluna do CSV a um campo da tabela `crm_leads`.
4. THE Tela_de_Importação SHALL listar os campos disponíveis para mapeamento: `name`, `phone`, `email`, `address`, `company`, `origin`, `notes`, `proposal_value`, `potential_value`, `temperature`, `status`.
5. WHEN o parceiro confirma o mapeamento e inicia a importação, THE Sistema SHALL inserir os registros na tabela `crm_leads` respeitando os campos mapeados e os valores padrão para campos não mapeados.
6. IF uma linha do CSV contiver o campo `name` vazio ou ausente, THEN THE Sistema SHALL ignorar aquela linha e registrá-la no relatório de erros da importação.
7. WHEN a importação é concluída, THE Sistema SHALL exibir um relatório com: total de linhas processadas, total de registros importados com sucesso e total de linhas ignoradas com os motivos.
8. THE Sistema SHALL suportar arquivos CSV com separadores vírgula (`,`) e ponto-e-vírgula (`;`), detectando automaticamente o separador utilizado.
9. THE Sistema SHALL suportar arquivos CSV com codificação UTF-8 e UTF-8 com BOM.
10. IF o arquivo CSV exceder 5 MB, THEN THE Sistema SHALL rejeitar o upload e exibir mensagem informando o limite máximo.

---

### Requirement 12: Isolamento de Acesso entre Parceiros e Agência

**User Story:** Como agência, quero garantir que os dados de cada parceiro sejam completamente isolados, para que nenhum parceiro acesse dados de outro e nenhum cliente do parceiro acesse o CRM.

#### Acceptance Criteria

1. THE Sistema SHALL garantir que as RPCs de acesso a dados do parceiro validem o `dashboard_slug` antes de retornar qualquer dado.
2. THE Sistema SHALL garantir que o parceiro autenticado acesse apenas os dados do seu próprio `client_id` nas consultas ao banco.
3. THE Sistema SHALL garantir que nenhuma rota ou endpoint do CRM seja acessível sem autenticação válida.
4. THE Sistema SHALL garantir que o Cliente_do_Parceiro não tenha credenciais de acesso ao Dashboard ou CRM do parceiro.
5. WHEN uma requisição é feita com credenciais inválidas ou expiradas, THE Sistema SHALL retornar HTTP 401 e redirecionar para a tela de login.
6. THE Sistema SHALL usar `SECURITY DEFINER` nas RPCs do Supabase para garantir que as funções executem com permissões controladas, independentemente do papel do usuário chamador.

---

### Requirement 13: Parser e Serialização de Configurações de Integração

**User Story:** Como sistema, quero que as configurações de integração armazenadas no campo `metadata` JSONB sejam lidas e escritas de forma consistente, para que não haja perda ou corrupção de dados de configuração.

#### Acceptance Criteria

1. THE Sistema SHALL ler as configurações de integração do campo `metadata` JSONB usando acesso tipado com valores padrão para campos ausentes.
2. WHEN o parceiro salva configurações de integração, THE Sistema SHALL serializar os valores para o formato JSONB usando `jsonb_build_object` ou equivalente, preservando os campos existentes não modificados.
3. THE Sistema SHALL garantir que a operação de leitura seguida de escrita seguida de leitura (`parse → serialize → parse`) produza um objeto equivalente ao original (propriedade round-trip).
4. IF um campo do `metadata` contiver um valor de tipo inesperado (ex: string onde se espera booleano), THEN THE Sistema SHALL usar o valor padrão do campo sem lançar exceção.
5. THE Sistema SHALL validar os valores de configuração antes de persistir, rejeitando formatos inválidos com mensagem descritiva.

