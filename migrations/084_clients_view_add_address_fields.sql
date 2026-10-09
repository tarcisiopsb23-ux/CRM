-- =============================================================================
-- Migration 084: Recria a view clients_with_contracts incluindo os novos
-- campos de endereço adicionados na migration 082:
--   address_number, address_complement, address_neighborhood
-- Também inclui estado_civil, nacionalidade, signing_type e asaas_id
-- que podem estar na tabela mas ausentes da view.
-- =============================================================================

DROP VIEW IF EXISTS clients_with_contracts;

CREATE VIEW clients_with_contracts AS
SELECT DISTINCT ON (c.id)
  c.id,
  c.organization_id,
  c.code,
  c.lead_id,
  c.name,
  c.document,
  c.email,
  c.phone,
  c.company,
  c.address_street,
  c.address_number,
  c.address_complement,
  c.address_neighborhood,
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
  c.signing_type,
  c.estado_civil,
  c.nacionalidade,
  c.asaas_id,
  c.is_active,
  c.folder_id,
  c.folder_url,
  c.metadata,
  c.created_at,
  c.updated_at,
  co.id         AS contract_id,
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

GRANT SELECT ON clients_with_contracts TO authenticated;
GRANT SELECT ON clients_with_contracts TO anon;

INSERT INTO public.schema_migrations (version)
VALUES ('084_clients_view_add_address_fields_v1')
ON CONFLICT (version) DO NOTHING;
