-- RPC: create team chat group (bypasses RLS insert restriction on linked_to)
CREATE OR REPLACE FUNCTION create_team_chat_group(p_team_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_org_id  uuid;
  v_name    text;
BEGIN
  SELECT organization_id, name INTO v_org_id, v_name
  FROM teams WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found: %', p_team_id;
  END IF;

  -- Idempotent: return existing if already created
  SELECT id INTO v_conv_id
  FROM chat_conversations
  WHERE linked_to = 'team' AND linked_id = p_team_id;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO chat_conversations (organization_id, type, name, linked_to, linked_id, created_by)
  VALUES (v_org_id, 'group', v_name, 'team', p_team_id, auth.uid())
  RETURNING id INTO v_conv_id;

  -- Add all current team members as participants
  INSERT INTO chat_participants (conversation_id, user_id, role)
  SELECT v_conv_id, tm.profile_id, 'member'
  FROM team_members tm
  WHERE tm.team_id = p_team_id
  ON CONFLICT DO NOTHING;

  -- Add the caller as owner
  INSERT INTO chat_participants (conversation_id, user_id, role)
  VALUES (v_conv_id, auth.uid(), 'owner')
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = 'owner';

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_team_chat_group(uuid) TO authenticated;

-- RPC: delete a chat conversation (bypasses RLS delete restriction on linked_to)
-- Only allowed for manager/admin/owner roles
CREATE OR REPLACE FUNCTION delete_chat_conversation(p_conv_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();

  IF v_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Access denied: insufficient role';
  END IF;

  -- Verify user is a participant
  IF NOT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conv_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a participant';
  END IF;

  -- Cannot delete general channel
  IF EXISTS (
    SELECT 1 FROM chat_conversations
    WHERE id = p_conv_id AND type = 'general'
  ) THEN
    RAISE EXCEPTION 'Cannot delete the general channel';
  END IF;

  DELETE FROM chat_conversations WHERE id = p_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_chat_conversation(uuid) TO authenticated;
