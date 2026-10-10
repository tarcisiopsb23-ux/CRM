-- =============================================================================
-- Migration 00143: Recria a view clients_with_contracts incluindo folder_id e folder_url
-- A view usava c.* que pode não incluir colunas adicionadas após a criação da view
-- em alguns contextos. Recriamos explicitamente para garantir.
-- =============================================================================

DROP VIEW IF EXISTS clients_with_contracts;

CREATE VIEW clients_with_contracts AS
SELECT DISTINCT ON (c.id)
  c.id,
  c.organization_id,
  c.lead_id,
  c.name,
  c.document,
  c.email,
  c.phone,
  c.company,
  c.address_street,
  c.address_city,
  c.address_state,
  c.address_zip,
  c.decision_maker_name,
  c.decision_maker_phone,
  c.registration_date,
  c.registration_type,
  c.niche,
  c.origin,
  c.revenue,
  c.priority,
  c.responsible_name,
  c.responsible_phone,
  c.portfolio_team_id,
  c.is_active,
  c.folder_id,
  c.folder_url,
  c.metadata,
  c.created_at,
  c.updated_at,
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

-- Garantir que a view seja acessível via RLS das tabelas base
GRANT SELECT ON clients_with_contracts TO authenticated;
GRANT SELECT ON clients_with_contracts TO anon;
