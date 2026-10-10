# Requirements Document

## Introduction

Este documento descreve os requisitos para o **Chat Interno** do sistema Maestr.IA CRM — um canal de mensagens de texto em tempo real (via polling leve) entre usuários da mesma organização. O chat é acessível diretamente na interface sem navegação para outra página, exibindo um ícone na barra superior quando não há conversa aberta e um painel flutuante quando há uma conversa ativa.

O chat suporta três tipos de conversa:
- **direct** — conversa 1:1 entre dois usuários da mesma organização
- **group** — grupo com múltiplos participantes, podendo ser criado manualmente ou vinculado automaticamente a uma equipe ou projeto
- **general** — canal único por organização, criado automaticamente, todos os membros participam

A stack é React + TypeScript + Supabase (PostgreSQL), com polling a cada 10 segundos para economizar conexões Realtime do plano Free do Supabase. Mensagens com mais de 90 dias são arquivadas/deletadas automaticamente. Não há suporte a arquivos/mídia nesta versão.

---

## Glossary

- **Chat_System**: O módulo de chat interno descrito neste documento.
- **Conversation**: Um canal de troca de mensagens entre participantes da mesma organização. Possui um `type`: `direct`, `group` ou `general`.
- **Direct_Conversation**: Conversa do tipo `direct` — exclusivamente entre dois usuários (1:1).
- **Group_Conversation**: Conversa do tipo `group` — grupo com nome definido e múltiplos participantes. Pode ser criado manualmente ou vinculado automaticamente a uma equipe (`linked_to: 'team'`) ou projeto (`linked_to: 'project'`).
- **General_Channel**: Conversa do tipo `general` — canal único por organização, criado automaticamente, do qual todos os membros fazem parte e que não pode ser deletado.
- **Linked_Group**: Um Group_Conversation com `linked_to` preenchido (`'team'` ou `'project'`), cujo ciclo de vida é gerenciado automaticamente pelo sistema via triggers SQL.
- **Manual_Group**: Um Group_Conversation com `linked_to` nulo, criado manualmente por um usuário com role `owner` ou `admin`.
- **Archived_Conversation**: Uma Conversation com `is_archived = true`, que preserva o histórico mas não permite envio de novas mensagens.
- **Message**: Uma mensagem de texto enviada por um usuário dentro de uma Conversation.
- **Participant**: Um usuário membro de uma Conversation.
- **Chat_Icon**: O ícone de acesso ao chat exibido na barra superior (ao lado das notificações) quando não há conversa aberta.
- **Chat_Panel**: O painel flutuante de chat que se sobrepõe ao conteúdo da página sem causar navegação.
- **Conversation_List**: A tela dentro do Chat_Panel que lista todas as conversas do usuário autenticado, separadas por seção: Geral, Equipes, Diretas e Arquivadas.
- **Message_Input**: O campo de texto dentro do Chat_Panel usado para digitar e enviar mensagens.
- **Poller**: O mecanismo de polling periódico (a cada 10 segundos) responsável por buscar novas mensagens e conversas.
- **Archiver**: O processo automatizado (Supabase scheduled job ou trigger) responsável por remover mensagens com mais de 90 dias.
- **Organization**: A organização à qual o usuário pertence, identificada pelo campo `organization_id` na tabela `profiles`.
- **Profile**: O perfil de usuário existente no sistema, com campos `id`, `full_name`, `avatar_url`, `role` e `organization_id`.
- **Unread_Badge**: Indicador visual (contador numérico) exibido sobre o Chat_Icon ou na Conversation_List para sinalizar mensagens não lidas.
- **Group_Owner**: O usuário que criou um Manual_Group. Possui permissão para adicionar/remover membros, renomear o grupo e deletá-lo.
- **Team**: Uma equipe da organização, representada pela tabela `teams` com campos `id`, `organization_id`, `name`, `slug`, `lead_id` e `type`.
- **Team_Member**: Um membro de uma equipe, representado pela tabela `team_members` com campos `team_id`, `profile_id` e `role`.
- **Project**: Um projeto da organização, representado pela tabela `projects` com campos `id`, `organization_id`, `title`, `status`, `team_id` e `assigned_to`.
- **Project_Member**: Um participante de um projeto, representado pela tabela `project_members` com campos `project_id`, `profile_id` e `role`.
- **Project_Participants_Section**: A seção da `ProjectDetailsPage` que exibe e gerencia os membros do projeto.

---

## Requirements

### Requirement 1: Acesso ao Chat pela Barra Superior

**User Story:** Como usuário autenticado, quero acessar o chat a partir da barra superior, para que eu possa iniciar ou retomar conversas sem sair da página em que estou.

#### Acceptance Criteria

1. THE Chat_System SHALL exibir o Chat_Icon na barra superior, posicionado ao lado do ícone de notificações existente.
2. WHEN o usuário clica no Chat_Icon, THE Chat_System SHALL abrir o Chat_Panel sem redirecionar o usuário para outra rota.
3. WHILE o Chat_Panel está aberto, THE Chat_System SHALL ocultar o Chat_Icon da barra superior e exibir um botão de fechar dentro do Chat_Panel.
4. WHEN o usuário fecha o Chat_Panel, THE Chat_System SHALL reexibir o Chat_Icon na barra superior.
5. WHEN há pelo menos uma mensagem não lida em qualquer conversa do usuário (de qualquer tipo: `direct`, `group` ou `general`), THE Chat_System SHALL exibir o Unread_Badge sobre o Chat_Icon com o total de mensagens não lidas.
6. IF o total de mensagens não lidas for maior que 99, THEN THE Chat_System SHALL exibir "99+" no Unread_Badge.

---

### Requirement 2: Painel de Chat Flutuante

**User Story:** Como usuário autenticado, quero que o chat abra em um painel flutuante sobre a página atual, para que eu possa conversar sem perder o contexto do trabalho em andamento.

#### Acceptance Criteria

1. THE Chat_Panel SHALL ser renderizado como um elemento sobreposto (overlay) fixo na tela, sem alterar a rota ou o conteúdo da página principal.
2. THE Chat_Panel SHALL exibir a Conversation_List como tela inicial quando aberto.
3. WHEN o usuário seleciona uma conversa na Conversation_List, THE Chat_Panel SHALL exibir as mensagens dessa conversa em ordem cronológica crescente.
4. THE Chat_Panel SHALL permitir que o usuário retorne à Conversation_List a partir de uma conversa aberta.
5. WHILE o Chat_Panel está aberto em uma conversa, THE Chat_System SHALL marcar automaticamente como lidas todas as mensagens recebidas nessa conversa.
6. THE Chat_Panel SHALL ser responsivo e funcionar corretamente em telas com largura mínima de 320px.

---

### Requirement 3: Listagem de Conversas com Seções por Tipo

**User Story:** Como usuário autenticado, quero ver a lista de todas as minhas conversas organizadas por tipo, para que eu possa identificar rapidamente o canal correto e quais têm mensagens não lidas.

#### Acceptance Criteria

1. THE Conversation_List SHALL exibir apenas conversas em que o usuário autenticado é Participant.
2. THE Conversation_List SHALL organizar as conversas em quatro seções visuais distintas, na seguinte ordem: **Geral** (General_Channel), **Equipes** (Group_Conversations com `linked_to = 'team'`), **Diretas** (Direct_Conversations) e **Arquivadas** (Archived_Conversations com `is_archived = true`).
3. THE Conversation_List SHALL exibir, para cada conversa: nome da conversa (ou nome do outro Participant em conversas `direct`), prévia da última mensagem e data/hora relativa da última mensagem.
4. THE Conversation_List SHALL ordenar as conversas dentro de cada seção pela data da última mensagem, da mais recente para a mais antiga.
5. WHEN uma conversa possui mensagens não lidas, THE Conversation_List SHALL exibir o Unread_Badge com o número de mensagens não lidas ao lado dessa conversa.
6. THE Conversation_List SHALL exibir um botão para iniciar uma nova conversa (Direct ou Manual_Group) com usuários da mesma organização.
7. IF o usuário não possui nenhuma conversa do tipo `direct` ou `group` ativa, THEN THE Conversation_List SHALL exibir uma mensagem informativa na seção correspondente indicando que não há conversas ainda.
8. THE Conversation_List SHALL exibir a seção "Arquivadas" colapsada por padrão, com indicador do número de conversas arquivadas.
9. WHEN o usuário expande a seção "Arquivadas", THE Conversation_List SHALL exibir as Archived_Conversations com indicação visual de que estão arquivadas.

---

### Requirement 4: Canal Geral da Agência (General Channel)

**User Story:** Como usuário autenticado, quero ter acesso a um canal geral da minha organização, para que eu possa me comunicar com todos os membros sem precisar criar um grupo manualmente.

#### Acceptance Criteria

1. THE Chat_System SHALL criar automaticamente um General_Channel para cada Organization no momento em que a organização é criada ou na primeira vez que qualquer usuário da organização acessa o Chat_Panel.
2. THE Chat_System SHALL garantir que exista no máximo um General_Channel por Organization.
3. WHEN um novo usuário é adicionado à Organization, THE Chat_System SHALL adicioná-lo automaticamente como Participant do General_Channel da organização.
4. THE Chat_System SHALL impedir que qualquer usuário delete o General_Channel.
5. THE Chat_System SHALL exibir o General_Channel na seção "Geral" da Conversation_List, sempre no topo da lista, independentemente da data da última mensagem.
6. THE Chat_System SHALL identificar o General_Channel com o nome da organização ou com o rótulo "Geral" quando exibido na Conversation_List.

---

### Requirement 5: Criação e Gerenciamento de Grupos Manuais

**User Story:** Como usuário com permissão de owner ou admin, quero criar grupos de conversa manuais com nome e membros selecionados, para que eu possa me comunicar com equipes específicas sem vínculo automático.

#### Acceptance Criteria

1. WHEN um usuário com role `owner` ou `admin` aciona a criação de novo grupo manual, THE Chat_System SHALL exibir um formulário solicitando: nome do grupo e seleção de membros da organização.
2. THE Chat_System SHALL exigir que o nome do grupo tenha entre 1 e 100 caracteres.
3. THE Chat_System SHALL exigir que o grupo tenha no mínimo 2 participantes além do criador.
4. WHEN o Manual_Group é criado, THE Chat_System SHALL registrar o criador como Group_Owner e adicioná-lo automaticamente como Participant.
5. WHILE o usuário autenticado é Group_Owner de um Manual_Group, THE Chat_System SHALL exibir opções para adicionar membros, remover membros, renomear o grupo e deletar o grupo.
6. WHEN o Group_Owner adiciona um membro ao grupo, THE Chat_System SHALL criar um registro de Participant para o novo membro nessa Conversation.
7. WHEN o Group_Owner remove um membro do grupo, THE Chat_System SHALL remover o registro de Participant desse membro nessa Conversation.
8. THE Chat_System SHALL exibir a lista de Participants de um Group_Conversation dentro do Chat_Panel quando o usuário solicitar.
9. IF um usuário com role diferente de `owner` ou `admin` tentar criar um grupo manual, THEN THE Chat_System SHALL impedir a ação e exibir uma mensagem de permissão insuficiente.
10. WHEN o Group_Owner deleta um Manual_Group, THE Chat_System SHALL remover permanentemente a conversa e todas as suas mensagens.
11. THE Chat_System SHALL impedir a deleção de Linked_Groups por qualquer usuário via interface.

---

### Requirement 6: Grupos Automáticos por Equipe

**User Story:** Como membro de uma equipe, quero que um grupo de chat seja criado automaticamente quando minha equipe é formada, para que eu possa me comunicar com os colegas de equipe sem configuração manual.

#### Acceptance Criteria

1. WHEN uma nova Team é criada no sistema, THE Chat_System SHALL criar automaticamente um Group_Conversation com `linked_to = 'team'` e `linked_id = team.id`, usando o nome da equipe como nome do grupo.
2. WHEN o Group_Conversation de equipe é criado, THE Chat_System SHALL adicionar automaticamente todos os Team_Members atuais da equipe como Participants.
3. WHEN um novo Team_Member é adicionado a uma Team, THE Chat_System SHALL adicioná-lo automaticamente como Participant do Group_Conversation vinculado a essa equipe.
4. WHEN um Team_Member é removido de uma Team, THE Chat_System SHALL removê-lo automaticamente do Group_Conversation vinculado a essa equipe.
5. WHEN uma Team é deletada, THE Chat_System SHALL arquivar o Group_Conversation vinculado, definindo `is_archived = true` e `archived_at = now()`, preservando o histórico de mensagens.
6. THE Chat_System SHALL impedir que qualquer usuário delete manualmente um Group_Conversation com `linked_to = 'team'`.
7. THE Chat_System SHALL exibir os grupos de equipe na seção "Equipes" da Conversation_List.
8. WHILE um Group_Conversation de equipe está arquivado, THE Chat_System SHALL impedir o envio de novas mensagens nessa conversa.

---

### Requirement 7: Grupos Automáticos por Projeto

**User Story:** Como membro de um projeto, quero poder criar um grupo de chat vinculado ao projeto a partir da página de detalhes, para que eu possa me comunicar com todos os envolvidos no projeto de forma centralizada.

#### Acceptance Criteria

1. THE Chat_System SHALL exibir um botão "Criar grupo de chat" na ProjectDetailsPage para projetos que ainda não possuem um Group_Conversation vinculado.
2. WHEN o usuário aciona o botão "Criar grupo de chat" na ProjectDetailsPage, THE Chat_System SHALL criar um Group_Conversation com `linked_to = 'project'` e `linked_id = project.id`.
3. WHEN o Group_Conversation de projeto é criado, THE Chat_System SHALL adicionar automaticamente como Participants: todos os Project_Members do projeto, o usuário referenciado em `assigned_to` (se preenchido) e todos os Team_Members da equipe referenciada em `team_id` do projeto (se preenchida).
4. THE Chat_System SHALL garantir que não existam Participants duplicados no Group_Conversation de projeto, mesmo que um usuário apareça em múltiplas fontes (Project_Member, assigned_to e Team_Member simultaneamente).
5. WHEN o status de um Project muda para `concluida`, THE Chat_System SHALL arquivar automaticamente o Group_Conversation vinculado a esse projeto, definindo `is_archived = true` e `archived_at = now()`.
6. THE Chat_System SHALL impedir que qualquer usuário delete manualmente um Group_Conversation com `linked_to = 'project'`.
7. WHILE um Group_Conversation de projeto está arquivado, THE Chat_System SHALL impedir o envio de novas mensagens nessa conversa.
8. IF um projeto não possui Group_Conversation vinculado, THEN THE Chat_System SHALL exibir o botão "Criar grupo de chat" na ProjectDetailsPage.
9. IF um projeto já possui Group_Conversation vinculado, THEN THE Chat_System SHALL exibir um botão ou link "Abrir chat do projeto" na ProjectDetailsPage em vez do botão de criação.

---

### Requirement 8: Participantes de Projetos (Project Members UI)

**User Story:** Como usuário com permissão de owner ou admin, quero gerenciar os participantes de um projeto diretamente na página de detalhes do projeto, para que eu possa controlar quem faz parte do projeto e, consequentemente, quem será incluído no grupo de chat.

#### Acceptance Criteria

1. THE Chat_System SHALL exibir uma seção "Participantes" na ProjectDetailsPage listando todos os Project_Members do projeto.
2. THE Chat_System SHALL exibir na seção "Participantes" o responsável individual (`assigned_to`) e a equipe responsável (`team_id`) como participantes especiais com indicação visual distinta.
3. WHEN um usuário com role `owner` ou `admin` acessa a seção "Participantes", THE Chat_System SHALL exibir um campo de busca para adicionar novos participantes da organização.
4. WHEN o usuário busca por um participante, THE Chat_System SHALL exibir usuários da mesma organização que ainda não são Project_Members do projeto.
5. WHEN o usuário seleciona um usuário para adicionar, THE Chat_System SHALL criar um registro em `project_members` com `project_id` e `profile_id` correspondentes.
6. WHEN o usuário remove um Project_Member, THE Chat_System SHALL deletar o registro correspondente em `project_members`.
7. IF um usuário com role diferente de `owner` ou `admin` acessar a seção "Participantes", THEN THE Chat_System SHALL exibir a lista em modo somente leitura, sem opções de adicionar ou remover.
8. THE Chat_System SHALL exibir, para cada Project_Member: avatar, nome completo, role no projeto e data de entrada (`joined_at`).

---

### Requirement 9: Metadados de Arquivamento de Conversas

**User Story:** Como usuário autenticado, quero que conversas arquivadas sejam preservadas com histórico acessível mas sem permitir novas mensagens, para que eu possa consultar comunicações passadas de projetos e equipes encerrados.

#### Acceptance Criteria

1. THE Chat_System SHALL suportar os campos `linked_to` (text, nullable), `linked_id` (uuid, nullable), `is_archived` (boolean, default false) e `archived_at` (timestamptz, nullable) na tabela `chat_conversations`.
2. WHEN uma Conversation é arquivada, THE Chat_System SHALL definir `is_archived = true` e `archived_at = now()`.
3. WHILE uma Conversation possui `is_archived = true`, THE Chat_System SHALL impedir o envio de novas mensagens nessa conversa e exibir uma mensagem informativa ao usuário.
4. THE Conversation_List SHALL exibir Archived_Conversations em uma seção separada "Arquivadas", colapsada por padrão.
5. THE Chat_System SHALL permitir que usuários leiam o histórico de mensagens de Archived_Conversations.
6. THE Chat_System SHALL impedir que qualquer usuário desarquive manualmente uma Conversation arquivada via interface.

---

### Requirement 10: Iniciar Nova Conversa Direta (Direct)

**User Story:** Como usuário autenticado, quero iniciar uma conversa direta com outro usuário da minha organização, para que eu possa me comunicar individualmente com colegas de trabalho.

#### Acceptance Criteria

1. WHEN o usuário aciona o botão de nova conversa direta, THE Chat_System SHALL exibir uma lista de usuários da mesma organização disponíveis para conversa, excluindo o próprio usuário autenticado.
2. THE Chat_System SHALL exibir, para cada usuário disponível: avatar, nome completo e cargo (role).
3. WHEN o usuário seleciona um destinatário, THE Chat_System SHALL verificar se já existe uma Direct_Conversation entre os dois usuários.
4. IF já existe uma Direct_Conversation entre os dois usuários, THEN THE Chat_System SHALL abrir a conversa existente em vez de criar uma duplicata.
5. IF não existe uma Direct_Conversation entre os dois usuários, THEN THE Chat_System SHALL criar uma nova Direct_Conversation e abri-la no Chat_Panel.
6. THE Chat_System SHALL restringir a criação de conversas diretas a usuários da mesma organização, identificada pelo `organization_id` do Profile.

---

### Requirement 11: Envio e Recebimento de Mensagens

**User Story:** Como usuário autenticado, quero enviar e receber mensagens de texto em uma conversa, para que eu possa me comunicar em tempo quase real com colegas.

#### Acceptance Criteria

1. THE Message_Input SHALL aceitar apenas conteúdo de texto simples, sem suporte a arquivos, imagens ou formatação rich text nesta versão.
2. WHEN o usuário pressiona Enter ou clica no botão de enviar, THE Chat_System SHALL enviar a mensagem e exibi-la imediatamente na conversa do remetente.
3. IF o Message_Input estiver vazio ou contiver apenas espaços em branco, THEN THE Chat_System SHALL impedir o envio e manter o foco no campo.
4. THE Message_Input SHALL aceitar mensagens com no máximo 2000 caracteres.
5. IF uma mensagem exceder 2000 caracteres, THEN THE Chat_System SHALL impedir o envio e exibir uma mensagem de erro indicando o limite.
6. THE Poller SHALL buscar novas mensagens da conversa aberta a cada 10 segundos enquanto o Chat_Panel estiver aberto e uma conversa estiver ativa.
7. WHEN o Poller detecta novas mensagens, THE Chat_System SHALL exibi-las na conversa sem recarregar a página.
8. WHEN uma nova mensagem é recebida em uma conversa que não está aberta no momento, THE Chat_System SHALL incrementar o Unread_Badge correspondente.
9. WHILE uma Conversation possui `is_archived = true`, THE Chat_System SHALL desabilitar o Message_Input e exibir a mensagem "Esta conversa está arquivada e não aceita novas mensagens."

---

### Requirement 12: Histórico de Mensagens e Paginação

**User Story:** Como usuário autenticado, quero visualizar o histórico de mensagens de uma conversa, para que eu possa consultar o contexto de comunicações anteriores.

#### Acceptance Criteria

1. WHEN o usuário abre uma conversa, THE Chat_System SHALL carregar as 50 mensagens mais recentes dessa conversa.
2. WHEN o usuário rola para o topo da lista de mensagens, THE Chat_System SHALL carregar as 50 mensagens anteriores (paginação por cursor).
3. THE Chat_System SHALL exibir as mensagens em ordem cronológica crescente, com as mais antigas no topo e as mais recentes na base.
4. THE Chat_System SHALL diferenciar visualmente as mensagens enviadas pelo usuário autenticado das mensagens recebidas (alinhamento e cor distintos).
5. THE Chat_System SHALL exibir, para cada mensagem: nome do remetente, conteúdo de texto e data/hora de envio.

---

### Requirement 13: Arquivamento Automático de Mensagens Antigas

**User Story:** Como administrador do sistema, quero que mensagens com mais de 90 dias sejam removidas automaticamente, para que o banco de dados não cresça indefinidamente.

#### Acceptance Criteria

1. THE Archiver SHALL remover automaticamente todas as Messages cuja data de criação seja anterior a 90 dias da data atual.
2. THE Archiver SHALL executar a limpeza de forma periódica, sem intervenção manual.
3. IF uma Conversation não possui mais nenhuma mensagem após a limpeza, THEN THE Archiver SHALL preservar o registro da Conversation (sem deletá-la).
4. THE Archiver SHALL operar exclusivamente sobre a tabela de mensagens, sem afetar perfis, organizações ou outras entidades do sistema.

---

### Requirement 14: Isolamento por Organização e Segurança

**User Story:** Como usuário autenticado, quero que o chat seja restrito à minha organização, para que informações internas não sejam acessíveis a usuários de outras organizações.

#### Acceptance Criteria

1. THE Chat_System SHALL garantir, via Row Level Security (RLS) no Supabase, que um usuário só possa ler e escrever mensagens em Conversations das quais é Participant.
2. THE Chat_System SHALL garantir, via RLS, que um usuário só possa visualizar Profiles de usuários da mesma organização ao iniciar uma nova conversa ou gerenciar membros de grupo.
3. IF um usuário tentar acessar uma Conversation da qual não é Participant, THEN THE Chat_System SHALL retornar erro de autorização sem expor dados da conversa.
4. THE Chat_System SHALL utilizar o `organization_id` do Profile do usuário autenticado como critério de isolamento em todas as consultas ao banco de dados.
5. THE Chat_System SHALL garantir, via RLS, que somente usuários com role `owner` ou `admin` possam criar Manual_Groups.
6. THE Chat_System SHALL garantir, via RLS, que Linked_Groups (com `linked_to` preenchido) não possam ser deletados por nenhum usuário via interface.

---

### Requirement 15: Polling Leve e Eficiência de Conexões

**User Story:** Como operador do sistema, quero que o chat use polling leve em vez de conexões Realtime persistentes, para que o limite de 200 conexões do plano Free do Supabase não seja atingido.

#### Acceptance Criteria

1. THE Poller SHALL utilizar requisições HTTP (REST) ao Supabase para buscar novas mensagens, sem estabelecer conexões Realtime (WebSocket) para o chat.
2. THE Poller SHALL executar a cada 10 segundos enquanto o Chat_Panel estiver aberto e uma conversa estiver ativa.
3. WHEN o Chat_Panel é fechado, THE Poller SHALL interromper imediatamente as requisições periódicas.
4. WHEN o usuário navega para outra conversa dentro do Chat_Panel, THE Poller SHALL reiniciar o intervalo de 10 segundos para a nova conversa.
5. THE Poller SHALL buscar apenas mensagens com `created_at` posterior ao timestamp da última mensagem recebida, evitando recarregar o histórico completo a cada ciclo.
6. THE Poller SHALL também verificar, a cada 10 segundos, se há novas mensagens em conversas não abertas (de qualquer tipo) para atualizar o Unread_Badge global.

---

### Requirement 16: Contagem de Não Lidos Unificada

**User Story:** Como usuário autenticado, quero que o Unread_Badge reflita mensagens não lidas de todos os tipos de conversa, para que eu não perca nenhuma comunicação importante.

#### Acceptance Criteria

1. THE Unread_Badge exibido sobre o Chat_Icon SHALL contabilizar o total de mensagens não lidas somando todos os tipos de Conversation (`direct`, `group` e `general`) das quais o usuário é Participant, excluindo Archived_Conversations.
2. THE Unread_Badge exibido na Conversation_List SHALL contabilizar separadamente as mensagens não lidas de cada Conversation individual.
3. WHEN o usuário abre uma Conversation e permanece nela, THE Chat_System SHALL zerar o contador de não lidos daquela Conversation específica.
4. WHEN o usuário fecha o Chat_Panel sem abrir uma Conversation, THE Chat_System SHALL preservar os contadores de não lidos de todas as Conversations.
