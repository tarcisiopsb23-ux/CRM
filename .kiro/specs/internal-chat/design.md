# Design Document — Internal Chat

## Overview

Este documento descreve o design técnico do módulo de Chat Interno do Maestr.IA CRM. O chat suporta três tipos de conversa (`direct`, `group`, `general`), usa polling HTTP a cada 10 segundos (sem WebSocket), e é renderizado como painel flutuante integrado ao `AppHeader` existente.

Grupos do tipo `group` podem ser **manuais** (criados por owner/admin) ou **vinculados** (`linked_to: 'team'` ou `linked_to: 'project'`), com ciclo de vida gerenciado automaticamente por triggers SQL. Conversas arquivadas preservam histórico mas bloqueiam novas mensagens.

Stack: React + TypeScript + Supabase (PostgreSQL + RLS + pg_cron).

---

## High-Level Design

### Arquitetura Geral

```
AppHeader
  └── ChatIcon (badge de não lidos)
  └── ChatPanel (overlay fixo, z-index alto)
        ├── ConversationList
        │     ├── Seção "Geral"      → General_Channel
        │     ├── Seção "Equipes"    → Group_Conversations (linked_to='team')
        │     ├── Seção "Diretas"    → Direct_Conversations
        │     └── Seção "Arquivadas" → Archived_Conversations (colapsada)
        ├── MessageThread (conversa aberta)
        │     ├── mensagens paginadas (50/página)
        │     ├── banner "arquivada" se is_archived=true
        │     └── lista de participantes (grupos)
        ├── MessageInput (desabilitado em conversas arquivadas)
        └── NewConversationModal
              ├── aba "Conversa Direta" (selecionar 1 usuário)
              └── aba "Novo Grupo" (nome + selecionar N usuários) — apenas owner/admin

ProjectDetailsPage
  ├── Seção "Participantes" (nova)
  │     ├── Lista de project_members
  │     ├── assigned_to e team_id como participantes especiais
  │     ├── Busca e adição de novos membros (owner/admin)
  │     └── Remoção de membros (owner/admin)
  └── Botão "Criar grupo de chat" / "Abrir chat do projeto"
```

### Fluxo de Dados

```
useChat (hook central)
  ├── fetchConversations()   → GET /chat_conversations + /chat_participants
  ├── fetchMessages(convId)  → GET /chat_messages?conversation_id=eq.{id}
  ├── sendMessage()          → POST /chat_messages
  ├── markAsRead()           → UPSERT /chat_read_receipts
  └── Poller (setInterval 10s)
        ├── poll ativas → busca msg com created_at > lastSeen
        └── poll badge  → conta não lidos em todas as convs
```

### Camadas

| Camada | Responsabilidade |
|---|---|
| Supabase DB | Persistência, RLS, pg_cron para arquivamento |
| Triggers SQL | Criação/arquivamento automático de grupos de equipe e projeto |
| `useChat` hook | Estado global do chat, polling, operações CRUD |
| `useProjectMembers` hook | Gerenciamento de membros de projeto (nova) |
| Componentes React | Renderização do painel, lista, thread, input |
| `AppHeader` | Ponto de integração — monta `ChatIcon` e `ChatPanel` |
| `ProjectDetailsPage` | Seção de participantes + botão de chat do projeto |

---

## Low-Level Design

### 1. Schema do Banco de Dados

#### Tabela: `chat_conversations`

```sql
CREATE TABLE chat_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('direct', 'group', 'general')),
  name            text,                          -- obrigatório para group/general, null para direct
  created_by      uuid REFERENCES profiles(id),  -- null para general/linked groups (criado pelo sistema)
  -- Campos de vínculo automático
  linked_to       text CHECK (linked_to IN ('team', 'project')),  -- null = grupo manual ou direct/general
  linked_id       uuid,                          -- ID da equipe ou projeto vinculado
  -- Campos de arquivamento
  is_archived     boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Garante no máximo 1 grupo vinculado por entidade
  CONSTRAINT chat_conversations_linked_unique UNIQUE (linked_to, linked_id)
);

-- Garante no máximo 1 canal general por organização
CREATE UNIQUE INDEX chat_conversations_general_org_idx
  ON chat_conversations (organization_id)
  WHERE type = 'general';

-- Índice para busca por vínculo (usado pelos triggers)
CREATE INDEX chat_conversations_linked_idx
  ON chat_conversations (linked_to, linked_id)
  WHERE linked_to IS NOT NULL;

-- Garante no máximo 1 conversa direct entre dois usuários (via participantes — ver abaixo)
```

#### Tabela: `chat_participants`

```sql
CREATE TABLE chat_participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
```

#### Tabela: `chat_messages`

```sql
CREATE TABLE chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES profiles(id),
  content         text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_conv_created_idx
  ON chat_messages (conversation_id, created_at DESC);
```

#### Tabela: `chat_read_receipts`

```sql
CREATE TABLE chat_read_receipts (
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
```

#### Trigger: atualizar `updated_at` em `chat_conversations`

```sql
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE chat_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chat_messages_update_conv
AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_updated_at();
```

#### Função: provisionar General Channel

```sql
CREATE OR REPLACE FUNCTION provision_general_channel(p_org_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
  v_org_name text;
BEGIN
  -- Idempotente: retorna existente se já criado
  SELECT id INTO v_conv_id
  FROM chat_conversations
  WHERE organization_id = p_org_id AND type = 'general';

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  SELECT name INTO v_org_name FROM organizations WHERE id = p_org_id;

  INSERT INTO chat_conversations (organization_id, type, name)
  VALUES (p_org_id, 'general', COALESCE(v_org_name, 'Geral'))
  RETURNING id INTO v_conv_id;

  -- Adiciona todos os membros atuais da organização
  INSERT INTO chat_participants (conversation_id, user_id, role)
  SELECT v_conv_id, id, 'member'
  FROM profiles
  WHERE organization_id = p_org_id
  ON CONFLICT DO NOTHING;

  RETURN v_conv_id;
END;
$$;
```

#### Trigger: adicionar novo membro ao General Channel automaticamente

```sql
CREATE OR REPLACE FUNCTION add_member_to_general_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_conv_id
  FROM chat_conversations
  WHERE organization_id = NEW.organization_id AND type = 'general';

  IF v_conv_id IS NOT NULL THEN
    INSERT INTO chat_participants (conversation_id, user_id, role)
    VALUES (v_conv_id, NEW.id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_add_to_general
AFTER INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION add_member_to_general_channel();
```

---

#### Triggers: Grupos Automáticos por Equipe

```sql
-- 1. Criar grupo de chat quando uma equipe é criada (AFTER INSERT ON teams)
CREATE OR REPLACE FUNCTION create_team_chat_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  INSERT INTO chat_conversations (
    organization_id, type, name, linked_to, linked_id
  )
  VALUES (
    NEW.organization_id, 'group', NEW.name, 'team', NEW.id
  )
  RETURNING id INTO v_conv_id;

  -- Adiciona todos os membros atuais da equipe como participantes
  INSERT INTO chat_participants (conversation_id, user_id, role)
  SELECT v_conv_id, tm.profile_id, 'member'
  FROM team_members tm
  WHERE tm.team_id = NEW.id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_teams_create_chat_group
AFTER INSERT ON teams
FOR EACH ROW EXECUTE FUNCTION create_team_chat_group();

-- 2. Arquivar grupo de chat quando uma equipe é deletada (AFTER DELETE ON teams)
CREATE OR REPLACE FUNCTION archive_team_chat_group()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE chat_conversations
  SET is_archived = true,
      archived_at = now()
  WHERE linked_to = 'team'
    AND linked_id = OLD.id
    AND is_archived = false;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_teams_archive_chat_group
AFTER DELETE ON teams
FOR EACH ROW EXECUTE FUNCTION archive_team_chat_group();

-- 3. Adicionar membro ao grupo de chat quando entra na equipe (AFTER INSERT ON team_members)
CREATE OR REPLACE FUNCTION add_team_member_to_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_conv_id
  FROM chat_conversations
  WHERE linked_to = 'team'
    AND linked_id = NEW.team_id
    AND is_archived = false;

  IF v_conv_id IS NOT NULL THEN
    INSERT INTO chat_participants (conversation_id, user_id, role)
    VALUES (v_conv_id, NEW.profile_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_team_members_add_to_chat
AFTER INSERT ON team_members
FOR EACH ROW EXECUTE FUNCTION add_team_member_to_chat();

-- 4. Remover membro do grupo de chat quando sai da equipe (AFTER DELETE ON team_members)
CREATE OR REPLACE FUNCTION remove_team_member_from_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_conv_id
  FROM chat_conversations
  WHERE linked_to = 'team'
    AND linked_id = OLD.team_id
    AND is_archived = false;

  IF v_conv_id IS NOT NULL THEN
    DELETE FROM chat_participants
    WHERE conversation_id = v_conv_id
      AND user_id = OLD.profile_id;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_team_members_remove_from_chat
AFTER DELETE ON team_members
FOR EACH ROW EXECUTE FUNCTION remove_team_member_from_chat();
```

---

#### Trigger: Arquivar Grupo de Projeto quando Projeto é Concluído

```sql
-- AFTER UPDATE ON projects — arquiva o grupo quando status muda para 'concluida'
CREATE OR REPLACE FUNCTION archive_project_chat_on_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'concluida' AND OLD.status != 'concluida' THEN
    UPDATE chat_conversations
    SET is_archived = true,
        archived_at = now()
    WHERE linked_to = 'project'
      AND linked_id = NEW.id
      AND is_archived = false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_archive_chat_on_completion
AFTER UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION archive_project_chat_on_completion();
```

---

#### Função RPC: Criar Grupo de Chat para Projeto

Chamada pelo frontend via `supabase.rpc('create_project_chat_group', { p_project_id })` ao clicar em "Criar grupo de chat" na `ProjectDetailsPage`. A função é idempotente — retorna o grupo existente se já criado.

```sql
CREATE OR REPLACE FUNCTION create_project_chat_group(p_project_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id   uuid;
  v_proj      RECORD;
BEGIN
  SELECT * INTO v_proj FROM projects WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

  -- Idempotente: retorna existente se já criado
  SELECT id INTO v_conv_id
  FROM chat_conversations
  WHERE linked_to = 'project' AND linked_id = p_project_id;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO chat_conversations (
    organization_id, type, name, linked_to, linked_id, created_by
  )
  VALUES (
    v_proj.organization_id, 'group', v_proj.title,
    'project', p_project_id, auth.uid()
  )
  RETURNING id INTO v_conv_id;

  -- Adiciona project_members (ON CONFLICT garante sem duplicatas)
  INSERT INTO chat_participants (conversation_id, user_id, role)
  SELECT v_conv_id, pm.profile_id, 'member'
  FROM project_members pm
  WHERE pm.project_id = p_project_id
  ON CONFLICT DO NOTHING;

  -- Adiciona assigned_to (se preenchido)
  IF v_proj.assigned_to IS NOT NULL THEN
    INSERT INTO chat_participants (conversation_id, user_id, role)
    VALUES (v_conv_id, v_proj.assigned_to, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Adiciona membros da equipe vinculada (se preenchida)
  IF v_proj.team_id IS NOT NULL THEN
    INSERT INTO chat_participants (conversation_id, user_id, role)
    SELECT v_conv_id, tm.profile_id, 'member'
    FROM team_members tm
    WHERE tm.team_id = v_proj.team_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_conv_id;
END;
$$;
```

---

### 2. RLS Policies

```sql
-- Habilitar RLS
ALTER TABLE chat_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_receipts  ENABLE ROW LEVEL SECURITY;

-- Helper: verifica se o usuário autenticado é participante da conversa
CREATE OR REPLACE FUNCTION is_chat_participant(p_conv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conv_id
      AND user_id = auth.uid()
  );
$$;

-- Helper: retorna organization_id do usuário autenticado
CREATE OR REPLACE FUNCTION my_org_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- chat_conversations: leitura apenas para participantes da mesma org
CREATE POLICY "chat_conv_select" ON chat_conversations
  FOR SELECT USING (
    organization_id = my_org_id()
    AND is_chat_participant(id)
  );

-- chat_conversations: inserção apenas para membros da org (direct/group)
-- general é criado via SECURITY DEFINER function, não diretamente
CREATE POLICY "chat_conv_insert" ON chat_conversations
  FOR INSERT WITH CHECK (
    organization_id = my_org_id()
    AND type IN ('direct', 'group')
    AND (
      type = 'direct'
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

-- chat_conversations: delete bloqueado para general e linked groups
CREATE POLICY "chat_conv_delete" ON chat_conversations
  FOR DELETE USING (
    type != 'general'
    AND linked_to IS NULL  -- linked groups não podem ser deletados manualmente
    AND is_chat_participant(id)
    AND EXISTS (
      SELECT 1 FROM chat_participants
      WHERE conversation_id = chat_conversations.id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- chat_participants: leitura para participantes da mesma conversa
CREATE POLICY "chat_part_select" ON chat_participants
  FOR SELECT USING (is_chat_participant(conversation_id));

-- chat_participants: inserção pelo owner do grupo ou via SECURITY DEFINER
CREATE POLICY "chat_part_insert" ON chat_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_participants cp
      JOIN chat_conversations cc ON cc.id = cp.conversation_id
      WHERE cp.conversation_id = chat_participants.conversation_id
        AND cp.user_id = auth.uid()
        AND cp.role = 'owner'
        AND cc.type = 'group'
    )
    OR (
      -- Permite inserir a si mesmo em conversa direct recém-criada
      user_id = auth.uid()
    )
  );

-- chat_participants: remoção pelo owner do grupo
CREATE POLICY "chat_part_delete" ON chat_participants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM chat_participants cp
      WHERE cp.conversation_id = chat_participants.conversation_id
        AND cp.user_id = auth.uid()
        AND cp.role = 'owner'
    )
    AND user_id != auth.uid() -- owner não pode se remover
  );

-- chat_messages: leitura para participantes
CREATE POLICY "chat_msg_select" ON chat_messages
  FOR SELECT USING (is_chat_participant(conversation_id));

-- chat_messages: inserção para participantes (bloqueado em conversas arquivadas)
CREATE POLICY "chat_msg_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND is_chat_participant(conversation_id)
    AND NOT EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE id = conversation_id AND is_archived = true
    )
  );

-- chat_messages: sem update ou delete pelo usuário

-- chat_read_receipts: leitura e escrita apenas do próprio usuário
CREATE POLICY "chat_receipt_select" ON chat_read_receipts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "chat_receipt_upsert" ON chat_read_receipts
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

---

### 3. Arquivamento Automático (pg_cron)

```sql
-- Requer extensão pg_cron habilitada no Supabase (disponível no plano Free via Dashboard)
SELECT cron.schedule(
  'archive-old-chat-messages',
  '0 3 * * *',  -- todo dia às 03:00 UTC
  $$
    DELETE FROM chat_messages
    WHERE created_at < now() - INTERVAL '90 days';
  $$
);
```

Alternativa via trigger (caso pg_cron não esteja disponível):

```sql
-- Trigger que limpa mensagens antigas ao inserir nova mensagem na conversa
CREATE OR REPLACE FUNCTION archive_old_messages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM chat_messages
  WHERE conversation_id = NEW.conversation_id
    AND created_at < now() - INTERVAL '90 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_archive_old_messages
AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION archive_old_messages();
```

---

### 4. Componentes React

#### Estrutura de arquivos

```
src/
  components/
    chat/
      ChatIcon.tsx              -- ícone + badge no AppHeader
      ChatPanel.tsx             -- overlay flutuante principal
      ConversationList.tsx      -- lista com seções Geral/Equipes/Diretas/Arquivadas
      MessageThread.tsx         -- thread de mensagens + scroll infinito + banner arquivado
      MessageInput.tsx          -- campo de texto + botão enviar (desabilitado se arquivado)
      NewConversationModal.tsx  -- modal para criar direct ou group manual
      ParticipantsList.tsx      -- lista de membros de um grupo
    projects/
      ProjectMembersSection.tsx -- seção "Participantes" na ProjectDetailsPage (nova)
      ProjectChatButton.tsx     -- botão "Criar/Abrir grupo de chat" na ProjectDetailsPage (novo)
  hooks/
    useChat.ts                  -- hook central com estado e polling
    useProjectMembers.ts        -- hook para gerenciar project_members (novo)
  types/
    chat.ts                     -- tipos TypeScript do módulo
```

#### Tipos TypeScript (`src/types/chat.ts`)

```typescript
export type ConversationType = 'direct' | 'group' | 'general';
export type LinkedTo = 'team' | 'project' | null;

export interface ChatConversation {
  id: string;
  organization_id: string;
  type: ConversationType;
  name: string | null;
  created_by: string | null;
  linked_to: LinkedTo;
  linked_id: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // campos computados pelo hook
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  participants?: ChatParticipant[];
}

export interface ChatParticipant {
  conversation_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export interface ProjectMember {
  id: string;
  project_id: string;
  profile_id: string;
  role: string;
  joined_at: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
}
```

#### `ChatIcon.tsx`

```typescript
// Renderiza o ícone MessageSquare com Unread_Badge
// Props: unreadCount: number, onClick: () => void
// Integrado ao AppHeader ao lado do Bell icon
```

#### `ChatPanel.tsx`

```typescript
// Overlay fixo (position: fixed, bottom-right, z-50)
// Estado interno: view = 'list' | 'thread'
// Quando view === 'thread': exibe MessageThread + MessageInput
// Quando view === 'list': exibe ConversationList
// Botão X para fechar (chama onClose do useChat)
```

#### `ConversationList.tsx`

```typescript
// Recebe conversations: ChatConversation[] do useChat
// Renderiza 4 seções:
//   1. "Geral" — filtra type === 'general'
//   2. "Equipes" — filtra type === 'group' && linked_to === 'team', ordenado por updated_at desc
//   3. "Diretas" — filtra type === 'direct', ordenado por updated_at desc
//   4. "Arquivadas" — filtra is_archived === true, colapsada por padrão
//      → exibe contador "X arquivadas" quando colapsada
//      → conversas arquivadas têm indicador visual (ícone de cadeado/arquivo)
// Cada item: avatar/ícone, nome, prévia da última msg, data relativa, Unread_Badge
// Botão "Nova conversa" → abre NewConversationModal
// Grupos manuais (linked_to === null) aparecem na seção "Equipes" também, mas sem ícone de vínculo
```

#### `MessageThread.tsx`

```typescript
// Props: conversationId: string, currentUserId: string
// Carrega 50 mensagens iniciais via useChat.fetchMessages()
// Scroll infinito: IntersectionObserver no topo → carrega página anterior
// Mensagens do usuário: alinhadas à direita, fundo primário
// Mensagens recebidas: alinhadas à esquerda, fundo muted
// Exibe nome do remetente (exceto em direct, onde é implícito)
// Botão "Ver participantes" em grupos → abre ParticipantsList
// WHEN is_archived === true: exibe banner amarelo/cinza no topo:
//   "Esta conversa está arquivada. Nenhuma nova mensagem pode ser enviada."
```

#### `MessageInput.tsx`

```typescript
// Textarea controlado, max 2000 chars
// Enter sem Shift → envia; Shift+Enter → quebra de linha
// Contador de caracteres visível quando > 1800
// Botão enviar desabilitado se vazio ou apenas espaços
// WHEN conversation.is_archived === true:
//   → textarea desabilitado com placeholder "Conversa arquivada"
//   → botão enviar desabilitado e oculto
```

#### `NewConversationModal.tsx`

```typescript
// Dialog com duas abas:
//   Aba "Conversa Direta": lista de usuários da org (exceto self)
//     → ao selecionar: chama useChat.openOrCreateDirect(userId)
//   Aba "Novo Grupo" (visível apenas para owner/admin):
//     → campo nome do grupo
//     → multi-select de membros
//     → botão "Criar Grupo" → chama useChat.createGroup(name, memberIds)
```

#### `ParticipantsList.tsx`

```typescript
// Exibido dentro do MessageThread em grupos
// Lista avatar + nome + role de cada participante
// Se currentUser é owner E grupo é manual (linked_to === null):
//   → botão "Remover" ao lado de cada membro (exceto self)
//   → botão "Adicionar membro" → abre seletor de usuários da org
// Se grupo é linked (linked_to !== null):
//   → lista somente leitura (membros gerenciados automaticamente)
//   → exibe badge "Equipe" ou "Projeto" indicando o vínculo
```

---

### 5. Novos Componentes: Participantes de Projeto

#### `ProjectMembersSection.tsx`

Seção adicionada à `ProjectDetailsPage` para gerenciar os membros do projeto. Usa o hook `useProjectMembers`.

```typescript
// Props: projectId: string, assignedTo: string | null, teamId: string | null
//
// Renderiza:
//   1. Participantes especiais (não editáveis):
//      - "Responsável": avatar + nome do assigned_to (se preenchido)
//      - "Equipe": nome da equipe vinculada (se preenchida)
//   2. Lista de project_members com: avatar, nome, role, joined_at
//      - Botão "Remover" ao lado de cada membro (apenas owner/admin)
//   3. Campo de busca "Adicionar participante" (apenas owner/admin):
//      - Busca usuários da org que ainda não são project_members
//      - Ao selecionar: chama useProjectMembers.addMember(profileId)
//
// Modo somente leitura para roles diferentes de owner/admin
```

#### `ProjectChatButton.tsx`

Botão adicionado à `ProjectDetailsPage` para criar ou abrir o grupo de chat do projeto.

```typescript
// Props: projectId: string, linkedConversationId: string | null
//
// IF linkedConversationId === null:
//   → exibe botão "Criar grupo de chat" (ícone MessageSquarePlus)
//   → ao clicar: chama supabase.rpc('create_project_chat_group', { p_project_id })
//   → após criar: abre o ChatPanel na conversa criada via useChat.openConversation()
//
// IF linkedConversationId !== null:
//   → exibe botão "Abrir chat do projeto" (ícone MessageSquare)
//   → ao clicar: abre o ChatPanel na conversa vinculada via useChat.openConversation()
//
// Ambos os botões: variant="outline", tamanho sm, posicionados no header da ProjectDetailsPage
```

---

### 6. Hook `useProjectMembers`

```typescript
// src/hooks/useProjectMembers.ts

interface UseProjectMembersReturn {
  members: ProjectMember[];
  loading: boolean;
  error: string | null;
  addMember: (profileId: string, role?: string) => Promise<void>;
  removeMember: (profileId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

// Queries:
//   fetchMembers: SELECT * FROM project_members WHERE project_id = ? JOIN profiles
//   addMember: INSERT INTO project_members (project_id, profile_id, role)
//   removeMember: DELETE FROM project_members WHERE project_id = ? AND profile_id = ?
//
// RLS em project_members:
//   SELECT: membros da mesma organização do projeto
//   INSERT/DELETE: apenas owner/admin da organização
```

---

### 7. Hook `useChat`

```typescript
// src/hooks/useChat.ts

interface UseChatReturn {
  isOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;

  conversations: ChatConversation[];
  activeConversation: ChatConversation | null;
  openConversation: (conv: ChatConversation) => void;
  backToList: () => void;

  messages: ChatMessage[];
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;

  sendMessage: (content: string) => Promise<void>;
  openOrCreateDirect: (targetUserId: string) => Promise<void>;
  createGroup: (name: string, memberIds: string[]) => Promise<void>;
  createProjectChatGroup: (projectId: string) => Promise<string>; // retorna conv id
  addGroupMember: (convId: string, userId: string) => Promise<void>;
  removeGroupMember: (convId: string, userId: string) => Promise<void>;
  deleteGroup: (convId: string) => Promise<void>; // apenas manual groups

  totalUnread: number;
  loading: boolean;
  error: string | null;
}
```

**Lógica de polling:**

```typescript
// Polling principal (conversa ativa)
useEffect(() => {
  if (!isOpen || !activeConversation) return;

  const poll = async () => {
    const newMsgs = await fetchNewMessages(
      activeConversation.id,
      lastMessageTimestamp
    );
    if (newMsgs.length > 0) {
      setMessages(prev => [...prev, ...newMsgs]);
      setLastMessageTimestamp(newMsgs.at(-1)!.created_at);
      await markAsRead(activeConversation.id);
    }
  };

  const interval = setInterval(poll, 10_000);
  return () => clearInterval(interval);
}, [isOpen, activeConversation?.id]);

// Polling de badge (todas as conversas)
useEffect(() => {
  if (!isOpen) return;

  const pollBadge = async () => {
    const counts = await fetchUnreadCounts(); // query agregada
    setConversations(prev =>
      prev.map(c => ({ ...c, unread_count: counts[c.id] ?? 0 }))
    );
  };

  const interval = setInterval(pollBadge, 10_000);
  return () => clearInterval(interval);
}, [isOpen]);
```

**Provisionar General Channel na abertura do painel:**

```typescript
const openPanel = useCallback(async () => {
  setIsOpen(true);
  // Garante que o General Channel existe para a org do usuário
  await supabase.rpc('provision_general_channel', {
    p_org_id: profile.organization_id
  });
  await fetchConversations();
}, [profile]);
```

**Query de não lidos (otimizada):**

```typescript
// Retorna { [conversation_id]: unread_count }
async function fetchUnreadCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('get_unread_counts');
  // RPC agrega: count de chat_messages onde created_at > last_read_at do usuário
  return Object.fromEntries(data.map(r => [r.conversation_id, r.unread_count]));
}
```

```sql
-- RPC auxiliar para contagem de não lidos
CREATE OR REPLACE FUNCTION get_unread_counts()
RETURNS TABLE (conversation_id uuid, unread_count bigint)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    cp.conversation_id,
    COUNT(m.id) AS unread_count
  FROM chat_participants cp
  LEFT JOIN chat_read_receipts rr
    ON rr.conversation_id = cp.conversation_id
    AND rr.user_id = auth.uid()
  LEFT JOIN chat_messages m
    ON m.conversation_id = cp.conversation_id
    AND m.sender_id != auth.uid()
    AND m.created_at > COALESCE(rr.last_read_at, '1970-01-01')
  WHERE cp.user_id = auth.uid()
  GROUP BY cp.conversation_id;
$$;
```

---

### 8. Integração com o AppHeader

O `AppHeader` existente (`src/components/layout/AppHeader.tsx`) será modificado para:

1. Importar `useChat` e os componentes `ChatIcon` e `ChatPanel`.
2. Adicionar o `ChatIcon` entre o `Bell` e o avatar do usuário.
3. Renderizar o `ChatPanel` como filho do `AppHeader` (ou do `AppLayout`) com `position: fixed`.

```tsx
// Trecho do AppHeader atualizado
import { ChatIcon } from "@/components/chat/ChatIcon";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChat } from "@/hooks/useChat";

export function AppHeader() {
  const chat = useChat();
  // ...

  return (
    <>
      <header className="flex h-16 ...">
        {/* ... search ... */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5" />
          </Button>

          {/* Chat Icon — oculto quando painel está aberto */}
          {!chat.isOpen && (
            <ChatIcon
              unreadCount={chat.totalUnread}
              onClick={chat.openPanel}
            />
          )}

          {/* Avatar + dropdown */}
        </div>
      </header>

      {/* Chat Panel — overlay fora do fluxo do header */}
      {chat.isOpen && (
        <ChatPanel
          chat={chat}
          onClose={chat.closePanel}
        />
      )}
    </>
  );
}
```

**Posicionamento do ChatPanel:**

```css
/* ChatPanel — canto inferior direito, acima de tudo */
position: fixed;
bottom: 1rem;
right: 1rem;
width: 380px;
height: 560px;
z-index: 50;
border-radius: 0.75rem;
box-shadow: 0 20px 60px rgba(0,0,0,0.3);
```

---

### 9. Migração SQL (arquivo único)

O arquivo de migração será criado em `supabase/migrations/00XXX_internal_chat.sql` e conterá, em ordem:

1. Criação das tabelas `chat_conversations` (com campos `linked_to`, `linked_id`, `is_archived`, `archived_at`), `chat_participants`, `chat_messages`, `chat_read_receipts`
2. Índices (incluindo `chat_conversations_linked_idx`)
3. Funções auxiliares: `provision_general_channel`, `add_member_to_general_channel`, `get_unread_counts`, `update_conversation_updated_at`, `archive_old_messages`, `create_project_chat_group`
4. Triggers de General Channel: `trg_profiles_add_to_general`
5. Triggers de equipe: `trg_teams_create_chat_group`, `trg_teams_archive_chat_group`, `trg_team_members_add_to_chat`, `trg_team_members_remove_from_chat`
6. Trigger de projeto: `trg_projects_archive_chat_on_completion`
7. RLS policies (incluindo bloqueio de delete em linked groups e bloqueio de insert em conversas arquivadas)
8. Agendamento pg_cron (comentado com instrução para habilitar manualmente se necessário)

---

### 10. Considerações de Performance

- **Índice em `chat_messages`**: índice composto `(conversation_id, created_at DESC)` garante paginação eficiente.
- **Índice em `chat_conversations`**: índice parcial `(linked_to, linked_id)` acelera lookups dos triggers.
- **Polling incremental**: o Poller busca apenas mensagens com `created_at > lastSeen`, evitando varredura completa.
- **RPC `get_unread_counts`**: uma única query agregada substitui N queries individuais por conversa.
- **`provision_general_channel` idempotente**: chamada segura a cada abertura do painel sem risco de duplicação.
- **`create_project_chat_group` idempotente**: retorna grupo existente se já criado, seguro para chamadas repetidas.
- **`ON CONFLICT DO NOTHING`**: todos os INSERTs de participantes usam esta cláusula para garantir deduplicação sem erros.
- **Triggers SECURITY DEFINER**: triggers de equipe e projeto operam com permissões elevadas, sem depender de RLS do usuário que disparou a ação.
- **Sem Realtime**: nenhuma conexão WebSocket é aberta pelo chat, preservando o limite do plano Free.
