-- Migration 109: Normaliza display_order das alíneas (contract_clauses)
--
-- Problema: alíneas criadas com display_order = count_global da organização,
-- gerando valores altos e sobrepostos entre categorias diferentes.
-- O assembleContract ordena por display_order dentro de cada categoria,
-- mas valores corrompidos causam ordem incorreta na geração do contrato.
--
-- Solução: renumera as alíneas de cada (organization_id, category_key, parent_id)
-- mantendo a ordem relativa atual (pelo display_order existente, desempatando por created_at).
-- Resultado: display_order = 0, 1, 2, ... dentro de cada grupo.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, category_key, parent_id
      ORDER BY display_order ASC, created_at ASC
    ) - 1 AS new_order
  FROM public.contract_clauses
  WHERE is_active = true OR is_active IS NULL
)
UPDATE public.contract_clauses cc
SET display_order = ranked.new_order
FROM ranked
WHERE cc.id = ranked.id
  AND cc.display_order != ranked.new_order;
