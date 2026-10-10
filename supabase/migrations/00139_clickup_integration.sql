-- =============================================================================
-- Migration 00139: Integração ClickUp + flag terceirizado
-- =============================================================================

-- 1. Adicionar 'clickup' ao enum integration_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'clickup'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'integration_type')
  ) THEN
    ALTER TYPE integration_type ADD VALUE 'clickup';
  END IF;
END $$;

-- 2. Campos ClickUp em projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS clickup_task_id   TEXT,
  ADD COLUMN IF NOT EXISTS clickup_list_id   TEXT,
  ADD COLUMN IF NOT EXISTS is_freelancer     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clickup_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_clickup_task_id
  ON public.projects (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_is_freelancer
  ON public.projects (organization_id, is_freelancer)
  WHERE is_freelancer = true;

-- 3. Campos ClickUp em tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS clickup_task_id   TEXT,
  ADD COLUMN IF NOT EXISTS is_freelancer     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clickup_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_clickup_task_id
  ON public.tasks (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;

-- 4. Campos ClickUp em goals
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS clickup_task_id   TEXT,
  ADD COLUMN IF NOT EXISTS is_freelancer     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clickup_synced_at TIMESTAMPTZ;

-- 5. Campos ClickUp em events (agenda)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS clickup_task_id    TEXT,
  ADD COLUMN IF NOT EXISTS gcal_event_id      TEXT,  -- Google Calendar event ID (separado do google_event_id legado)
  ADD COLUMN IF NOT EXISTS is_freelancer      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_source    TEXT;  -- 'clickup' | 'gcal' | 'maestria'

CREATE INDEX IF NOT EXISTS idx_events_clickup_task_id
  ON public.events (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_gcal_event_id
  ON public.events (gcal_event_id)
  WHERE gcal_event_id IS NOT NULL;

-- 6. RPC: buscar projetos/tarefas de terceirizados para o n8n
CREATE OR REPLACE FUNCTION public.get_freelancer_items(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'projects', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'status', p.status,
        'start_date', p.start_date,
        'end_date', p.end_date,
        'assigned_to', p.assigned_to,
        'clickup_task_id', p.clickup_task_id,
        'clickup_list_id', p.clickup_list_id
      ))
      FROM projects p
      WHERE p.organization_id = p_org_id
        AND p.is_freelancer = true
    ),
    'tasks', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'project_id', t.project_id,
        'title', t.title,
        'status', t.status,
        'priority', t.priority,
        'start_date', t.start_date,
        'end_date', t.end_date,
        'assigned_to', t.assigned_to,
        'clickup_task_id', t.clickup_task_id
      ))
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE p.organization_id = p_org_id
        AND t.is_freelancer = true
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_freelancer_items(UUID) TO authenticated, service_role;

-- 7. RPC: atualizar clickup_task_id após criação no ClickUp
CREATE OR REPLACE FUNCTION public.set_clickup_task_id(
  p_table      TEXT,
  p_item_id    UUID,
  p_clickup_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table = 'projects' THEN
    UPDATE projects SET clickup_task_id = p_clickup_id, clickup_synced_at = now()
    WHERE id = p_item_id;
  ELSIF p_table = 'tasks' THEN
    UPDATE tasks SET clickup_task_id = p_clickup_id, clickup_synced_at = now()
    WHERE id = p_item_id;
  ELSIF p_table = 'goals' THEN
    UPDATE goals SET clickup_task_id = p_clickup_id, clickup_synced_at = now()
    WHERE id = p_item_id;
  ELSIF p_table = 'events' THEN
    UPDATE events SET clickup_task_id = p_clickup_id, clickup_synced_at = now()
    WHERE id = p_item_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_clickup_task_id(TEXT, UUID, TEXT) TO service_role;
