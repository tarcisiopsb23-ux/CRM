-- =============================================================================
-- Auto-archive chat groups when project is deleted or team is deleted
-- =============================================================================

-- Archive chat group when a PROJECT is deleted (BEFORE DELETE to still have the id)
CREATE OR REPLACE FUNCTION archive_project_chat_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_conversations
  SET is_archived = true,
      archived_at = now()
  WHERE linked_to = 'project'
    AND linked_id = OLD.id
    AND is_archived = false;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_archive_chat_on_delete ON projects;
CREATE TRIGGER trg_projects_archive_chat_on_delete
BEFORE DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION archive_project_chat_on_delete();

-- Archive chat group when a TEAM is deleted (already exists from 00144, but recreate safely)
CREATE OR REPLACE FUNCTION archive_team_chat_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
BEFORE DELETE ON teams
FOR EACH ROW EXECUTE FUNCTION archive_team_chat_on_delete();

-- RPC: archive a conversation manually (for direct/group chats)
CREATE OR REPLACE FUNCTION archive_chat_conversation(p_conv_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow archiving conversations the user participates in
  IF NOT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conv_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE chat_conversations
  SET is_archived = true,
      archived_at = now()
  WHERE id = p_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_chat_conversation(uuid) TO authenticated;

-- RPC: unarchive a conversation (for any conversation the user participates in)
CREATE OR REPLACE FUNCTION unarchive_chat_conversation(p_conv_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conv_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE chat_conversations
  SET is_archived = false,
      archived_at = null
  WHERE id = p_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION unarchive_chat_conversation(uuid) TO authenticated;
