-- Force drop and recreate to clear any cached version
DROP FUNCTION IF EXISTS create_project_chat_group(uuid);

CREATE OR REPLACE FUNCTION create_project_chat_group(p_project_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id       uuid;
  v_org_id        uuid;
  v_title         text;
  v_assigned_to   uuid;
  v_team_id       uuid;
BEGIN
  SELECT
    p.organization_id,
    p.title,
    p.assigned_to,
    p.team_id
  INTO
    v_org_id,
    v_title,
    v_assigned_to,
    v_team_id
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

  -- Idempotente: retorna existente se já criado
  SELECT id INTO v_conv_id
  FROM public.chat_conversations
  WHERE linked_to = 'project' AND linked_id = p_project_id;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO public.chat_conversations (
    organization_id, type, name, linked_to, linked_id, created_by
  )
  VALUES (
    v_org_id, 'group', v_title, 'project', p_project_id, auth.uid()
  )
  RETURNING id INTO v_conv_id;

  -- Adiciona project_members
  INSERT INTO public.chat_participants (conversation_id, user_id, role)
  SELECT v_conv_id, pm.profile_id, 'member'
  FROM public.project_members pm
  WHERE pm.project_id = p_project_id
  ON CONFLICT DO NOTHING;

  -- Adiciona assigned_to
  IF v_assigned_to IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, role)
    VALUES (v_conv_id, v_assigned_to, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Adiciona membros da equipe vinculada
  IF v_team_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, role)
    SELECT v_conv_id, tm.profile_id, 'member'
    FROM public.team_members tm
    WHERE tm.team_id = v_team_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_conv_id;
END;
$$;
