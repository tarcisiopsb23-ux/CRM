-- =============================================================================
-- Migration 00166: Backfill recurrence_group_id
-- Para eventos criados antes da migration 00165, preenche recurrence_group_id:
-- - Eventos pai (is_recurrence_child = false, tem recurrence no metadata):
--   recurrence_group_id = seu próprio id
-- - Eventos filhos (is_recurrence_child = true):
--   recurrence_group_id = id do pai mais próximo com mesmo título/tipo/organização
-- =============================================================================

-- 1. Preenche o pai com o próprio id
UPDATE public.events
SET recurrence_group_id = id
WHERE recurrence_group_id IS NULL
  AND (metadata->>'is_recurrence_child')::boolean IS NOT TRUE
  AND metadata ? 'recurrence'
  AND metadata->>'recurrence' IS NOT NULL
  AND metadata->>'recurrence' != 'null';

-- 2. Preenche os filhos com o id do pai (mesmo título, mesma organização, não é filho, tem recurrence)
UPDATE public.events AS child
SET recurrence_group_id = parent.id
FROM (
  SELECT id, organization_id, title
  FROM public.events
  WHERE recurrence_group_id = id  -- só os pais já preenchidos acima
) AS parent
WHERE child.recurrence_group_id IS NULL
  AND (child.metadata->>'is_recurrence_child')::boolean = true
  AND child.organization_id = parent.organization_id
  AND child.title = parent.title;
