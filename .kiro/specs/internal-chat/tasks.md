# Implementation Plan: Internal Chat

## Overview

Implementação incremental do módulo de Chat Interno, partindo da camada de banco de dados (migração SQL, RLS, triggers, pg_cron), passando pelos hooks e tipos TypeScript, até os componentes React e integração no AppHeader e ProjectDetailsPage.

## Tasks

- [x] 1. Migração SQL — tabelas, índices e funções auxiliares
  - Criar arquivo `supabase/migrations/00XXX_internal_chat.sql`
  - Criar tabelas `chat_conversations`, `chat_participants`, `chat_messages`, `chat_read_receipts` com todos os campos, constraints e CHECK conforme design
  - Criar índices: `chat_conversations_general_org_idx` (UNIQUE parcial), `chat_conversations_linked_idx` (parcial), `chat_messages_conv_created_idx`
  - Criar funções auxiliares: `provision_general_channel`, `get_unread_counts`, `update_conversation_updated_at`, `archive_old_messages`, `create_project_chat_group`
  - Criar funções helper de RLS: `is_chat_participant`, `my_org_id`
  - _Requirements: 4.1, 4.2, 7.2, 9.1, 13.1, 14.1, 15.5_

- [x] 2. Migração SQL — triggers de ciclo de vida
  - [x] 2.1 Criar triggers do General Channel
    - `add_member_to_general_channel` + `trg_profiles_add_to_general` (AFTER INSERT ON profiles)
    - `trg_chat_messages_update_conv` (AFTER INSERT ON chat_messages → atualiza `updated_at`)
    - _Requirements: 4.3, 3.4_

  - [x] 2.2 Criar triggers de equipe
    - `create_team_chat_group` + `trg_teams_create_chat_group` (AFTER INSERT ON teams)
    - `archive_team_chat_group` + `trg_teams_archive_chat_group` (AFTER DELETE ON teams)
    - `add_team_member_to_chat` + `trg_team_members_add_to_chat` (AFTER INSERT ON team_members)
    - `remove_team_member_from_chat` + `trg_team_members_remove_from_chat` (AFTER DELETE ON team_members)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.3 Criar trigger de projeto
    - `archive_project_chat_on_completion` + `trg_projects_archive_chat_on_completion` (AFTER UPDATE ON projects)
    - _Requirements: 7.5_

- [x] 3. Migração SQL — RLS policies e pg_cron
  - Habilitar RLS nas quatro tabelas
  - Criar todas as policies: `chat_conv_select`, `chat_conv_insert`, `chat_conv_delete`, `chat_part_select`, `chat_part_insert`, `chat_part_delete`, `chat_msg_select`, `chat_msg_insert`, `chat_receipt_select`, `chat_receipt_upsert`
  - Adicionar agendamento `pg_cron` (comentado com instrução de ativação manual) e trigger alternativo `trg_archive_old_messages`
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 13.1, 13.2_

  - [ ]* 3.1 Escrever property tests para RLS
    - **Property 1: Isolamento de organização** — usuário de org A nunca lê mensagens de org B
    - **Property 2: Participante obrigatório** — SELECT em `chat_messages` retorna vazio para não-participante
    - **Property 3: Bloqueio de insert em conversa arquivada** — INSERT em `chat_messages` falha quando `is_archived = true`
    - **Property 4: Linked groups não deletáveis** — DELETE em `chat_conversations` falha para `linked_to IS NOT NULL`
    - **Validates: Requirements 14.1, 14.3, 14.6, 6.6, 7.6**

- [x] 4. Checkpoint — Migração SQL completa
  - Garantir que a migração aplica sem erros, todos os índices e triggers existem, RLS está ativo. Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 5. Tipos TypeScript do chat
  - Criar `src/types/chat.ts` com as interfaces: `ConversationType`, `LinkedTo`, `ChatConversation`, `ChatParticipant`, `ChatMessage`, `ProjectMember`
  - Garantir que `ChatConversation` inclui campos computados `unread_count`, `last_message`, `last_message_at` e `participants?`
  - _Requirements: 9.1, 3.3, 12.5_

- [x] 6. Hook `useProjectMembers`
  - Criar `src/hooks/useProjectMembers.ts`
  - Implementar `fetchMembers` (SELECT project_members JOIN profiles WHERE project_id = ?)
  - Implementar `addMember(profileId, role?)` (INSERT INTO project_members)
  - Implementar `removeMember(profileId)` (DELETE FROM project_members WHERE project_id AND profile_id)
  - Expor `{ members, loading, error, addMember, removeMember, refetch }`
  - _Requirements: 8.5, 8.6, 8.8_

  - [ ]* 6.1 Escrever unit tests para `useProjectMembers`
    - Testar que `addMember` não duplica participante já existente
    - Testar que `removeMember` não afeta outros membros do projeto
    - _Requirements: 8.5, 8.6_

- [x] 7. Componentes de participantes de projeto
  - [x] 7.1 Criar `src/components/projects/ProjectMembersSection.tsx`
    - Props: `projectId`, `assignedTo`, `teamId`
    - Renderizar participantes especiais (responsável e equipe) como somente leitura
    - Renderizar lista de `project_members` com avatar, nome, role, `joined_at`
    - Exibir campo de busca e botão "Adicionar" apenas para owner/admin
    - Exibir botão "Remover" por membro apenas para owner/admin
    - Usar `useProjectMembers` para todas as operações
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 8.8_

  - [x] 7.2 Criar `src/components/projects/ProjectChatButton.tsx`
    - Props: `projectId`, `linkedConversationId: string | null`
    - Se `linkedConversationId === null`: botão "Criar grupo de chat" → chama `supabase.rpc('create_project_chat_group', { p_project_id })`
    - Se `linkedConversationId !== null`: botão "Abrir chat do projeto" → chama `useChat.openConversation()`
    - Após criar: abre o ChatPanel na conversa criada
    - _Requirements: 7.1, 7.8, 7.9_

- [x] 8. Integração na `ProjectDetailsPage`
  - Importar e renderizar `ProjectMembersSection` na `ProjectDetailsPage` (`src/pages/ProjectDetailsPage.tsx` ou equivalente)
  - Importar e renderizar `ProjectChatButton` no header da `ProjectDetailsPage`
  - Passar `projectId`, `assignedTo`, `teamId` e `linkedConversationId` como props
  - _Requirements: 7.1, 7.8, 7.9, 8.1, 8.2_

- [x] 9. Hook `useChat`
  - Criar `src/hooks/useChat.ts`
  - [x] 9.1 Implementar estado e operações de painel
    - `isOpen`, `openPanel` (chama `provision_general_channel` + `fetchConversations`), `closePanel`
    - `conversations`, `activeConversation`, `openConversation`, `backToList`
    - _Requirements: 1.2, 1.3, 1.4, 2.2, 4.1_

  - [x] 9.2 Implementar carregamento e paginação de mensagens
    - `fetchMessages(convId)` — carrega 50 mensagens mais recentes
    - `loadMoreMessages()` — paginação por cursor (50 anteriores)
    - `hasMoreMessages`
    - `markAsRead(convId)` — UPSERT em `chat_read_receipts`
    - _Requirements: 12.1, 12.2, 12.3, 2.5_

  - [x] 9.3 Implementar envio de mensagens e operações de conversa
    - `sendMessage(content)` — POST em `chat_messages`, exibe imediatamente
    - `openOrCreateDirect(targetUserId)` — verifica existência antes de criar
    - `createGroup(name, memberIds)` — apenas owner/admin
    - `addGroupMember`, `removeGroupMember`, `deleteGroup`
    - _Requirements: 11.2, 11.3, 10.3, 10.4, 10.5, 5.6, 5.7, 5.10_

  - [x] 9.4 Implementar polling
    - Polling de conversa ativa: `setInterval(poll, 10_000)` — busca msgs com `created_at > lastMessageTimestamp`
    - Polling de badge: `setInterval(pollBadge, 10_000)` — chama RPC `get_unread_counts`
    - Limpar intervals no cleanup do `useEffect`
    - `totalUnread` calculado a partir dos counts
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 16.1, 16.2_

  - [ ]* 9.5 Escrever property tests para lógica de polling
    - **Property 5: Monotonicidade do timestamp** — `lastMessageTimestamp` nunca regride entre ciclos de polling
    - **Property 6: Idempotência do badge** — chamar `get_unread_counts` N vezes sem novas mensagens retorna sempre o mesmo resultado
    - **Validates: Requirements 15.5, 16.1**

- [x] 10. Checkpoint — Hook `useChat` completo
  - Garantir que polling inicia ao abrir painel e para ao fechar, que `totalUnread` reflete corretamente os não lidos. Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 11. Componentes do chat — estrutura base
  - [x] 11.1 Criar `src/components/chat/ChatIcon.tsx`
    - Props: `unreadCount: number`, `onClick: () => void`
    - Renderizar ícone `MessageSquare` com `Unread_Badge` (exibe "99+" se > 99)
    - _Requirements: 1.1, 1.5, 1.6_

  - [x] 11.2 Criar `src/components/chat/ConversationList.tsx`
    - Recebe `conversations: ChatConversation[]` e callbacks do `useChat`
    - Renderizar 4 seções: Geral, Equipes, Diretas, Arquivadas (colapsada por padrão)
    - Cada item: avatar/ícone, nome, prévia da última msg, data relativa, `Unread_Badge`
    - Seção "Arquivadas": exibe contador quando colapsada, indicador visual por item quando expandida
    - Botão "Nova conversa" → abre `NewConversationModal`
    - Mensagem informativa quando seção Diretas ou Equipes está vazia
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 12. Componentes do chat — thread e input
  - [x] 12.1 Criar `src/components/chat/MessageThread.tsx`
    - Props: `conversationId: string`, `currentUserId: string`
    - Renderizar mensagens em ordem cronológica crescente
    - Mensagens próprias: alinhadas à direita; recebidas: à esquerda
    - Exibir nome do remetente (exceto em `direct`)
    - `IntersectionObserver` no topo para carregar página anterior (`loadMoreMessages`)
    - Banner amarelo/cinza quando `is_archived === true`
    - Botão "Ver participantes" em grupos → abre `ParticipantsList`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 9.3, 9.5_

  - [x] 12.2 Criar `src/components/chat/MessageInput.tsx`
    - Textarea controlado, max 2000 chars
    - Enter sem Shift → envia; Shift+Enter → quebra de linha
    - Contador de caracteres visível quando > 1800
    - Botão enviar desabilitado se vazio ou apenas espaços
    - Quando `is_archived === true`: textarea desabilitado, placeholder "Conversa arquivada", botão oculto
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.9_

  - [x] 12.3 Criar `src/components/chat/ParticipantsList.tsx`
    - Lista avatar + nome + role de cada participante
    - Se `currentUser` é owner E `linked_to === null`: botão "Remover" por membro (exceto self) + botão "Adicionar membro"
    - Se `linked_to !== null`: lista somente leitura com badge "Equipe" ou "Projeto"
    - _Requirements: 5.5, 5.6, 5.7, 5.8, 5.11_

- [x] 13. Componentes do chat — modais e painel principal
  - [x] 13.1 Criar `src/components/chat/NewConversationModal.tsx`
    - Dialog com duas abas: "Conversa Direta" e "Novo Grupo"
    - Aba "Conversa Direta": lista usuários da org (exceto self) → chama `openOrCreateDirect(userId)`
    - Aba "Novo Grupo" (visível apenas para owner/admin): campo nome + multi-select de membros → chama `createGroup(name, memberIds)`
    - Exibir mensagem de permissão insuficiente para roles sem acesso à aba de grupo
    - _Requirements: 5.1, 5.2, 5.3, 5.9, 10.1, 10.2, 10.6_

  - [x] 13.2 Criar `src/components/chat/ChatPanel.tsx`
    - Overlay fixo (position: fixed, bottom-right, z-50, 380×560px, border-radius, box-shadow)
    - Estado interno: `view = 'list' | 'thread'`
    - Quando `view === 'list'`: renderiza `ConversationList`
    - Quando `view === 'thread'`: renderiza `MessageThread` + `MessageInput`
    - Botão X para fechar (chama `onClose`)
    - Botão voltar para lista quando em thread
    - Responsivo para largura mínima de 320px
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

- [x] 14. Integração no `AppHeader`
  - Modificar `src/components/layout/AppHeader.tsx`
  - Importar `useChat`, `ChatIcon`, `ChatPanel`
  - Adicionar `ChatIcon` entre o ícone Bell e o avatar (oculto quando `isOpen === true`)
  - Renderizar `ChatPanel` como filho do `AppHeader` (fora do fluxo do header, `position: fixed`)
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 15. Checkpoint final — Integração completa
  - Garantir que todos os testes passam, o polling funciona corretamente, o badge reflete não lidos de todos os tipos de conversa, e conversas arquivadas bloqueiam input. Perguntar ao usuário se há dúvidas antes de encerrar.

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Os checkpoints garantem validação incremental antes de avançar para a próxima camada
- Property tests validam propriedades universais de RLS e polling; unit tests validam casos específicos e edge cases
- O arquivo de migração SQL deve ser único (`00XXX_internal_chat.sql`) contendo todas as DDLs em ordem conforme seção 9 do design
- `provision_general_channel` e `create_project_chat_group` são idempotentes — seguras para chamadas repetidas
- Nenhuma conexão Realtime/WebSocket deve ser aberta pelo módulo de chat
