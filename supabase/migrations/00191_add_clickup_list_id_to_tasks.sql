-- Migration 00191: Adiciona clickup_list_id na tabela tasks
-- Armazena o ID da Lista no ClickUp (projeto pai) à qual a tarefa pertence.
-- Permite vincular diretamente a tarefa à lista correta sem depender do projeto pai.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS clickup_list_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_clickup_list_id
  ON public.tasks (clickup_list_id)
  WHERE clickup_list_id IS NOT NULL;

-- Backfill: preenche clickup_list_id a partir do projeto pai (projects.clickup_task_id)
-- para tarefas terceirizadas que já existem
UPDATE public.tasks t
SET clickup_list_id = p.clickup_task_id
FROM public.projects p
WHERE t.project_id = p.id
  AND t.is_freelancer = true
  AND t.clickup_list_id IS NULL
  AND p.clickup_task_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
