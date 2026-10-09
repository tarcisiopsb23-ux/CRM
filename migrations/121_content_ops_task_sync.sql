-- =============================================================================
-- Migration 121: Content Operations — Sincronização com Tarefas/Projetos
-- Banco A — Idempotente
--
-- Adiciona vínculo bidirecional entre o módulo de conteúdo e o módulo de
-- Projetos/Tarefas existente:
--
--   content_items.task_id → tasks.id  (FK já criada na migration 118)
--   tasks.content_item_id → content_items.id  (adicionado aqui)
--   projects.is_content_project BOOLEAN  (adicionado aqui)
--
-- Triggers de sincronização:
--   trg_content_item_create_task  — ao criar content_item, cria task espelho
--   trg_content_item_sync_task    — ao atualizar content_item, sincroniza task
--   trg_task_create_content_item  — ao criar task em projeto de conteúdo, cria content_item
--   trg_task_sync_content_item    — ao atualizar task, sincroniza content_item
--
-- Proteção contra loop:
--   Flag temporária content_sync_in_progress = true em pg_catalog.current_setting
--   usada para detectar e interromper recursão de trigger.
--
-- Mapeamento de status:
--   content_items.status   →   tasks.status
--   briefing               →   backlog
--   producao               →   em_andamento
--   revisao_interna        →   em_revisao
--   aguardando_aprovacao   →   em_revisao
--   aprovado               →   em_revisao
--   reprovado              →   em_andamento
--   publicado              →   concluida
--   arquivado              →   concluida
--
-- Dependências: migration 118, tabelas tasks e projects já existentes
-- =============================================================================

-- ─── 1. Adicionar tasks.content_item_id ──────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS content_item_id UUID
  REFERENCES public.content_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_content_item_id
  ON public.tasks(content_item_id)
  WHERE content_item_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.content_item_id IS
  'Vínculo com o item de conteúdo que esta tarefa espelha.
   Preenchido automaticamente pelo trigger trg_content_item_create_task.
   Quando preenchido, o status é mantido em sincronia com content_items.status.';

-- ─── 2. Adicionar projects.is_content_project ─────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_content_project BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.is_content_project IS
  'Quando true, novas tarefas criadas neste projeto geram automaticamente
   um content_item rascunho no módulo de Gestão de Conteúdo.';

-- ─── 3. Função de mapeamento de status ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.content_status_to_task_status(
  p_content_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_content_status
    WHEN 'briefing'              THEN 'backlog'
    WHEN 'producao'              THEN 'em_andamento'
    WHEN 'revisao_interna'       THEN 'em_revisao'
    WHEN 'aguardando_aprovacao'  THEN 'em_revisao'
    WHEN 'aprovado'              THEN 'em_revisao'
    WHEN 'reprovado'             THEN 'em_andamento'
    WHEN 'publicado'             THEN 'concluida'
    WHEN 'arquivado'             THEN 'concluida'
    ELSE 'backlog'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.task_status_to_content_status(
  p_task_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_task_status
    WHEN 'backlog'       THEN 'briefing'
    WHEN 'em_andamento'  THEN 'producao'
    WHEN 'em_revisao'    THEN 'revisao_interna'
    WHEN 'concluida'     THEN 'publicado'
    WHEN 'parada'        THEN 'producao'
    WHEN 'bloqueada'     THEN 'producao'
    ELSE 'briefing'
  END;
END;
$$;

-- ─── 4. Trigger: content_item → task (create) ─────────────────────────────────
-- Quando um content_item é criado, cria automaticamente uma task espelho.
-- A task fica vinculada ao content_item via tasks.content_item_id.
-- Requer que o content_item tenha um client_id vinculado a um projeto
-- de conteúdo (is_content_project = true) — ou usa um projeto padrão.

CREATE OR REPLACE FUNCTION public.fn_content_item_create_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id  UUID;
  v_task_id     UUID;
  v_task_status TEXT;
BEGIN
  -- Anti-loop: não executa se chamado por um trigger de sincronização
  IF current_setting('app.content_sync_in_progress', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Não cria task se já tem uma vinculada
  IF NEW.task_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Busca um projeto de conteúdo ativo para o cliente
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE organization_id    = NEW.organization_id
    AND client_id          = NEW.client_id
    AND is_content_project = true
    AND status NOT IN ('concluido', 'cancelado')
  ORDER BY created_at DESC
  LIMIT 1;

  -- Se não há projeto de conteúdo, não cria task (não é obrigatório)
  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_task_status := public.content_status_to_task_status(NEW.status);

  -- Cria a task espelho
  SET LOCAL app.content_sync_in_progress = 'true';

  INSERT INTO public.tasks (
    project_id,
    title,
    description,
    status,
    priority,
    assigned_to,
    start_date,
    end_date,
    content_item_id,
    metadata
  ) VALUES (
    v_project_id,
    NEW.title,
    COALESCE(NEW.description, ''),
    v_task_status,
    NEW.priority,
    CASE WHEN NEW.assigned_to_type = 'agency' THEN NEW.assigned_to ELSE NULL END,
    NEW.production_deadline,
    NEW.scheduled_date,
    NEW.id,
    jsonb_build_object(
      'content_item_id',   NEW.id,
      'is_content_task',   true,
      'content_type',      NEW.content_type,
      'platform',          NEW.platform
    )
  )
  RETURNING id INTO v_task_id;

  -- Atualiza o content_item com o task_id gerado
  UPDATE public.content_items
  SET task_id    = v_task_id,
      updated_at = now()
  WHERE id = NEW.id;

  NEW.task_id := v_task_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_item_create_task ON public.content_items;
CREATE TRIGGER trg_content_item_create_task
  AFTER INSERT ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_content_item_create_task();

-- ─── 5. Trigger: content_item → task (update/sync) ───────────────────────────
-- Quando o status, título, responsável ou prazo de um content_item muda,
-- sincroniza os campos correspondentes na task espelho.

CREATE OR REPLACE FUNCTION public.fn_content_item_sync_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anti-loop
  IF current_setting('app.content_sync_in_progress', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Sem task vinculada, nada a fazer
  IF NEW.task_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só sincroniza se campos relevantes mudaram
  IF OLD.status            IS NOT DISTINCT FROM NEW.status
     AND OLD.title         IS NOT DISTINCT FROM NEW.title
     AND OLD.priority      IS NOT DISTINCT FROM NEW.priority
     AND OLD.assigned_to   IS NOT DISTINCT FROM NEW.assigned_to
     AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
     AND OLD.production_deadline IS NOT DISTINCT FROM NEW.production_deadline
  THEN
    RETURN NEW;
  END IF;

  SET LOCAL app.content_sync_in_progress = 'true';

  UPDATE public.tasks
  SET
    title       = NEW.title,
    status      = public.content_status_to_task_status(NEW.status),
    priority    = NEW.priority,
    assigned_to = CASE WHEN NEW.assigned_to_type = 'agency' THEN NEW.assigned_to ELSE assigned_to END,
    end_date    = COALESCE(NEW.scheduled_date, NEW.production_deadline),
    updated_at  = now()
  WHERE id = NEW.task_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_item_sync_task ON public.content_items;
CREATE TRIGGER trg_content_item_sync_task
  AFTER UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_content_item_sync_task();

-- ─── 6. Trigger: task → content_item (create) ────────────────────────────────
-- Quando uma task é criada num projeto de conteúdo (is_content_project = true)
-- E não tem content_item_id ainda, cria um content_item rascunho.

CREATE OR REPLACE FUNCTION public.fn_task_create_content_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_content_project  BOOLEAN;
  v_client_id           UUID;
  v_org_id              UUID;
  v_content_item_id     UUID;
BEGIN
  -- Anti-loop
  IF current_setting('app.content_sync_in_progress', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Se já tem content_item vinculado, não cria
  IF NEW.content_item_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Verifica se é um projeto de conteúdo
  SELECT p.is_content_project, p.client_id, p.organization_id
  INTO v_is_content_project, v_client_id, v_org_id
  FROM public.projects p
  WHERE p.id = NEW.project_id;

  IF NOT COALESCE(v_is_content_project, false) THEN
    RETURN NEW;
  END IF;

  -- Precisa ter client_id para criar content_item
  IF v_client_id IS NULL OR v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SET LOCAL app.content_sync_in_progress = 'true';

  INSERT INTO public.content_items (
    organization_id,
    client_id,
    title,
    description,
    status,
    priority,
    assigned_to,
    assigned_to_type,
    production_deadline,
    scheduled_date,
    task_id,
    metadata
  ) VALUES (
    v_org_id,
    v_client_id,
    NEW.title,
    COALESCE(NEW.description, ''),
    public.task_status_to_content_status(NEW.status),
    NEW.priority,
    NEW.assigned_to,
    'agency',
    NEW.end_date,
    NEW.end_date,
    NEW.id,
    jsonb_build_object(
      'task_id',           NEW.id,
      'is_content_task',   true,
      'origin',            'task_created'
    )
  )
  RETURNING id INTO v_content_item_id;

  -- Atualiza a task com o content_item_id
  UPDATE public.tasks
  SET content_item_id = v_content_item_id,
      updated_at      = now()
  WHERE id = NEW.id;

  NEW.content_item_id := v_content_item_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_create_content_item ON public.tasks;
CREATE TRIGGER trg_task_create_content_item
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_task_create_content_item();

-- ─── 7. Trigger: task → content_item (update/sync) ───────────────────────────

CREATE OR REPLACE FUNCTION public.fn_task_sync_content_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anti-loop
  IF current_setting('app.content_sync_in_progress', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Sem content_item vinculado, nada a fazer
  IF NEW.content_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só sincroniza se campos relevantes mudaram
  IF OLD.status       IS NOT DISTINCT FROM NEW.status
     AND OLD.title    IS NOT DISTINCT FROM NEW.title
     AND OLD.priority IS NOT DISTINCT FROM NEW.priority
  THEN
    RETURN NEW;
  END IF;

  SET LOCAL app.content_sync_in_progress = 'true';

  UPDATE public.content_items
  SET
    title      = NEW.title,
    -- Só atualiza status se o content_item ainda está em status inicial
    -- (não sobrescreve status avançado como aguardando_aprovacao, publicado)
    status     = CASE
                   WHEN status IN ('briefing','producao','revisao_interna')
                   THEN public.task_status_to_content_status(NEW.status)
                   ELSE status
                 END,
    priority   = NEW.priority,
    updated_at = now()
  WHERE id = NEW.content_item_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_sync_content_item ON public.tasks;
CREATE TRIGGER trg_task_sync_content_item
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_task_sync_content_item();

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('121_content_ops_task_sync')
ON CONFLICT (version) DO NOTHING;
