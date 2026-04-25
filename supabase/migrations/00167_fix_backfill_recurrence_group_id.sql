-- =============================================================================
-- Migration 00167: Fix backfill recurrence_group_id
-- Corrige eventos onde recurrence_group_id ficou null após migration 00166
-- =============================================================================

-- 1. Preenche o pai com o próprio id
-- Evento pai = não é filho (is_recurrence_child != true) E tem metadata.recurrence
UPDATE public.events
SET recurrence_group_id = id
WHERE recurrence_group_id IS NULL
  AND (
    (metadata->>'is_recurrence_child') IS DISTINCT FROM 'true'
  )
  AND (
    metadata ? 'recurrence'
    AND metadata->'recurrence' IS NOT NULL
    AND metadata->'recurrence' != 'null'::jsonb
  );

-- 2. Preenche os filhos com o id do pai
-- Filho = is_recurrence_child = true, mesmo título e organização que um pai já preenchido
UPDATE public.events AS child
SET recurrence_group_id = parent.id
FROM (
  SELECT id, organization_id, title
  FROM public.events
  WHERE recurrence_group_id = id
) AS parent
WHERE child.recurrence_group_id IS NULL
  AND (child.metadata->>'is_recurrence_child') = 'true'
  AND child.organization_id = parent.organization_id
  AND child.title = parent.title;
