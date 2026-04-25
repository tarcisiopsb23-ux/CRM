-- =============================================================================
-- Internal Chat Module
-- Migration: 00144_internal_chat.sql
-- =============================================================================

-- =============================================================================
-- 1. TABELAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('direct', 'group', 'general')),
  name            text,
  created_by      uuid REFERENCES profiles(id),
  linked_to       text CHECK (linked_to IN ('team', 'project')),
  linked_id       uuid,
  is_archived     boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversations_linked_unique UNIQUE (linked_to, linked_id)
);

CREATE TABLE IF NOT EXISTS chat_participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES profiles(id),
  content         text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_read_receipts (
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- =============================================================================
-- 2. ÍNDICES
-- =============================================================================

-- Garante no máximo 1 canal general por organização
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_general_org_idx
  ON chat_conversations (organization_id)
  WHERE type = 'general';

-- Índice para busca por vínculo (usado pelos triggers)
CREATE INDEX IF NOT EXISTS chat_conversations_linked_idx
  ON chat_conversations (linked_to, linked_id)
  WHERE linked_to IS NOT NULL;

-- Índice para paginação eficiente de mensagens
CREATE INDEX IF NOT EXISTS chat_messages_conv_created_idx
  ON chat_messages (conversation_id, created_at DESC);

-- =============================================================================
-- 3. FUNÇÕES HELPER DE RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION is_chat_participant(p_conv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conv_id
      AND user_id = auth.uid()
  );
$$;

-- my_org_id já pode existir — recria com OR REPLACE
CREATE OR REPLACE FUNCTION my_org_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- =============================================================================
-- 4. FUNÇÕES AUXILIARES
-- =============================================================================

-- Atualiza updated_at da conversa ao inserir mensagem
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE chat_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Provisiona o General Channel de uma organização (idempotente)
CREATE OR REPLACE FUNCTION provision_general_channel(p_org_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
  v_org_name text;
BEGIN
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

  INSERT INTO chat_participants (conversation_id, user_id, role)
  SELECT v_conv_id, id, 'member'
  FROM profiles
  WHERE organization_id = p_org_id
  ON CONFLICT DO NOTHING;

  RETURN v_conv_id;
END;
$$;

-- Cria grupo de chat para um projeto (idempotente)
CREATE OR REPLACE FUNCTION create_project_chat_group(p_project_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
  v_proj    RECORD;
BEGIN
  SELECT * INTO v_proj FROM projects WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

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

  -- Adiciona project_members
  INSERT INTO chat_participants (conversation_id, user_id, role)
  SELECT v_conv_id, pm.profile_id, 'member'
  FROM project_members pm
  WHERE pm.project_id = p_project_id
  ON CONFLICT DO NOTHING;

  -- Adiciona assigned_to
  IF v_proj.assigned_to IS NOT NULL THEN
    INSERT INTO chat_participants (conversation_id, user_id, role)
    VALUES (v_conv_id, v_proj.assigned_to, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Adiciona membros da equipe vinculada
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

-- RPC para contagem de não lidos por conversa
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
    AND m.created_at > COALESCE(rr.last_read_at, '1970-01-01'::timestamptz)
  WHERE cp.user_id = auth.uid()
  GROUP BY cp.conversation_id;
$$;

-- Limpeza de mensagens antigas (chamada pelo trigger ou pg_cron)
CREATE OR REPLACE FUNCTION archive_old_messages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM chat_messages
  WHERE conversation_id = NEW.conversation_id
    AND created_at < now() - INTERVAL '90 days';
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 5. TRIGGERS — GENERAL CHANNEL E MENSAGENS
-- =============================================================================

DROP TRIGGER IF EXISTS trg_chat_messages_update_conv ON chat_messages;
CREATE TRIGGER trg_chat_messages_update_conv
AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_updated_at();

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

DROP TRIGGER IF EXISTS trg_profiles_add_to_general ON profiles;
CREATE TRIGGER trg_profiles_add_to_general
AFTER INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION add_member_to_general_channel();

DROP TRIGGER IF EXISTS trg_archive_old_messages ON chat_messages;
CREATE TRIGGER trg_archive_old_messages
AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION archive_old_messages();

-- =============================================================================
-- 6. TRIGGERS — EQUIPES
-- =============================================================================

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

  INSERT INTO chat_participants (conversation_id, user_id, role)
  SELECT v_conv_id, tm.profile_id, 'member'
  FROM team_members tm
  WHERE tm.team_id = NEW.id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teams_create_chat_group ON teams;
CREATE TRIGGER trg_teams_create_chat_group
AFTER INSERT ON teams
FOR EACH ROW EXECUTE FUNCTION create_team_chat_group();

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

DROP TRIGGER IF EXISTS trg_teams_archive_chat_group ON teams;
CREATE TRIGGER trg_teams_archive_chat_group
AFTER DELETE ON teams
FOR EACH ROW EXECUTE FUNCTION archive_team_chat_group();

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

DROP TRIGGER IF EXISTS trg_team_members_add_to_chat ON team_members;
CREATE TRIGGER trg_team_members_add_to_chat
AFTER INSERT ON team_members
FOR EACH ROW EXECUTE FUNCTION add_team_member_to_chat();

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

DROP TRIGGER IF EXISTS trg_team_members_remove_from_chat ON team_members;
CREATE TRIGGER trg_team_members_remove_from_chat
AFTER DELETE ON team_members
FOR EACH ROW EXECUTE FUNCTION remove_team_member_from_chat();

-- =============================================================================
-- 7. TRIGGER — PROJETO CONCLUÍDO
-- =============================================================================

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

DROP TRIGGER IF EXISTS trg_projects_archive_chat_on_completion ON projects;
CREATE TRIGGER trg_projects_archive_chat_on_completion
AFTER UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION archive_project_chat_on_completion();

-- =============================================================================
-- 8. RLS POLICIES
-- =============================================================================

ALTER TABLE chat_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_receipts  ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating
DROP POLICY IF EXISTS "chat_conv_select"    ON chat_conversations;
DROP POLICY IF EXISTS "chat_conv_insert"    ON chat_conversations;
DROP POLICY IF EXISTS "chat_conv_delete"    ON chat_conversations;
DROP POLICY IF EXISTS "chat_part_select"    ON chat_participants;
DROP POLICY IF EXISTS "chat_part_insert"    ON chat_participants;
DROP POLICY IF EXISTS "chat_part_delete"    ON chat_participants;
DROP POLICY IF EXISTS "chat_msg_select"     ON chat_messages;
DROP POLICY IF EXISTS "chat_msg_insert"     ON chat_messages;
DROP POLICY IF EXISTS "chat_receipt_select" ON chat_read_receipts;
DROP POLICY IF EXISTS "chat_receipt_upsert" ON chat_read_receipts;

-- chat_conversations
CREATE POLICY "chat_conv_select" ON chat_conversations
  FOR SELECT USING (
    organization_id = my_org_id()
    AND is_chat_participant(id)
  );

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

CREATE POLICY "chat_conv_delete" ON chat_conversations
  FOR DELETE USING (
    type != 'general'
    AND linked_to IS NULL
    AND is_chat_participant(id)
    AND EXISTS (
      SELECT 1 FROM chat_participants
      WHERE conversation_id = chat_conversations.id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- chat_participants
CREATE POLICY "chat_part_select" ON chat_participants
  FOR SELECT USING (is_chat_participant(conversation_id));

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
    OR user_id = auth.uid()
  );

CREATE POLICY "chat_part_delete" ON chat_participants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM chat_participants cp
      WHERE cp.conversation_id = chat_participants.conversation_id
        AND cp.user_id = auth.uid()
        AND cp.role = 'owner'
    )
    AND user_id != auth.uid()
  );

-- chat_messages
CREATE POLICY "chat_msg_select" ON chat_messages
  FOR SELECT USING (is_chat_participant(conversation_id));

CREATE POLICY "chat_msg_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND is_chat_participant(conversation_id)
    AND NOT EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE id = conversation_id AND is_archived = true
    )
  );

-- chat_read_receipts
CREATE POLICY "chat_receipt_select" ON chat_read_receipts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "chat_receipt_upsert" ON chat_read_receipts
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 9. PG_CRON (habilitar manualmente no Supabase Dashboard se disponível)
-- Para ativar: Database → Extensions → pg_cron → Enable
-- Depois executar:
-- SELECT cron.schedule(
--   'archive-old-chat-messages',
--   '0 3 * * *',
--   $$ DELETE FROM chat_messages WHERE created_at < now() - INTERVAL '90 days'; $$
-- );
-- =============================================================================
