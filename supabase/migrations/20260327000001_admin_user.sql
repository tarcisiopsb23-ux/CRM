-- Migration: Usuário administrador da agência
-- Cria o cliente de suporte/admin com acesso ao dashboard.
-- Idempotente: usa INSERT ... ON CONFLICT DO UPDATE.

INSERT INTO clients (
  name,
  company,
  email,
  dashboard_slug,
  metadata
)
VALUES (
  'Suporte C8',
  'Agência C8',
  'suporte@agenciac8.com.br',
  'suporte-c8',
  jsonb_build_object(
    'dashboard_email',    'suporte@agenciac8.com.br',
    'dashboard_password', '62642301',
    'has_temp_password',  FALSE,
    'is_support',         TRUE,
    'dashboard_performance', TRUE,
    'dashboard_atendimento', TRUE,
    'dashboard_crm',         TRUE
  )
)
ON CONFLICT (dashboard_slug) DO UPDATE
  SET
    email    = EXCLUDED.email,
    metadata = clients.metadata || EXCLUDED.metadata;
