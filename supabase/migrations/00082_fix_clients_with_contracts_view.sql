-- =============================================================================
-- Migration 00082: Corrige view clients_with_contracts
-- Problema: LEFT JOIN sem DISTINCT retorna múltiplas linhas por cliente,
-- causando duplicatas e inconsistências no filtro is_active.
-- Solução: DISTINCT ON (c.id) garante uma linha por cliente.
-- =============================================================================

CREATE OR REPLACE VIEW clients_with_contracts AS
SELECT DISTINCT ON (c.id)
  c.*,
  co.id        AS contract_id,
  co.start_date AS contract_start,
  co.end_date   AS contract_end,
  co.value      AS contract_value,
  co.status     AS contract_status,
  CASE
    WHEN co.status = 'ativo'      THEN 'ativo'
    WHEN co.status = 'cancelado'  THEN 'cancelado'
    WHEN co.status = 'encerrado'  THEN 'encerrado'
    ELSE 'sem_contrato'
  END AS computed_status
FROM clients c
LEFT JOIN contracts co
  ON c.id = co.client_id
  AND co.status IN ('ativo', 'suspenso', 'cancelado', 'encerrado')
ORDER BY c.id, co.created_at DESC NULLS LAST;
