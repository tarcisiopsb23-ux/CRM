-- Migration 00157: Chat group para tarefas (tasks)

-- Adiciona 'task' como valor válido para linked_to em chat_conversations
ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_linked_to_check;

ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_linked_to_check
  CHECK (linked_to IN ('team', 'project', 'task'));

CREATE OR REPLACE FUNCTION create_task_chat_group(p_task_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id     uuid;
  v_org_id      uuid;
  v_title       text;
  v_assigned_to uuid;
  v_project_id  uuid;
BEGIN
  SELECT
    t.organization_id,
    t.title,
    t.assigned_to,
    t.project_id
  INTO
    v_org_id,
    v_title,
    v_assigned_to,
    v_project_id
  FROM public.tasks t
  WHERE t.id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- Idempotente: retorna existente se já criado
  SELECT id INTO v_conv_id
  FROM public.chat_conversations
  WHERE linked_to = 'task' AND linked_id = p_task_id;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO public.chat_conversations (
    organization_id, type, name, linked_to, linked_id, created_by
  )
  VALUES (
    v_org_id, 'group', v_title, 'task', p_task_id, auth.uid()
  )
  RETURNING id INTO v_conv_id;

  -- Adiciona o criador
  INSERT INTO public.chat_participants (conversation_id, user_id, role)
  VALUES (v_conv_id, auth.uid(), 'owner')
  ON CONFLICT DO NOTHING;

  -- Adiciona assigned_to se existir
  IF v_assigned_to IS NOT NULL AND v_assigned_to != auth.uid() THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, role)
    VALUES (v_conv_id, v_assigned_to, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Adiciona membros do projeto pai
  IF v_project_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, role)
    SELECT v_conv_id, pm.profile_id, 'member'
    FROM public.project_members pm
    WHERE pm.project_id = v_project_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_task_chat_group(uuid) TO authenticated;

-- Arquiva o chat da task quando ela for concluída
CREATE OR REPLACE FUNCTION archive_task_chat_on_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'concluida' AND OLD.status::text != 'concluida' THEN
    UPDATE public.chat_conversations
    SET is_archived = true, archived_at = now()
    WHERE linked_to = 'task'
      AND linked_id = NEW.id
      AND is_archived = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_archive_chat_on_completion ON tasks;
CREATE TRIGGER trg_tasks_archive_chat_on_completion
AFTER UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION archive_task_chat_on_completion();
