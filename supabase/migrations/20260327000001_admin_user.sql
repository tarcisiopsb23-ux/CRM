-- Migration: Usuario administrador da agencia
-- Cria o cliente de suporte/admin com acesso ao dashboard.
-- Idempotente: usa INSERT ... ON CONFLICT DO UPDATE.
-- tenant_id = id (self-reference, atualizado em seguida)

DO $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO clients (name, company, email, dashboard_slug, tenant_id, metadata)
  VALUES (
    'Suporte C8',
    'Agencia C8',
    'suporte@agenciac8.com.br',
    'suporte-c8',
    gen_random_uuid(),  -- placeholder; atualizado logo abaixo
    jsonb_build_object(
      'dashboard_email',       'suporte@agenciac8.com.br',
      'dashboard_password',    '62642301',
      'has_temp_password',     FALSE,
      'is_support',            TRUE,
      'dashboard_performance', TRUE,
      'dashboard_atendimento', TRUE,
      'dashboard_crm',         TRUE
    )
  )
  ON CONFLICT (dashboard_slug) DO UPDATE
    SET email    = EXCLUDED.email,
        metadata = clients.metadata || EXCLUDED.metadata
  RETURNING id INTO v_id;

  -- Garantir self-reference: tenant_id = id
  IF v_id IS NOT NULL THEN
    UPDATE clients SET tenant_id = v_id WHERE id = v_id;
  ELSE
    UPDATE clients SET tenant_id = id WHERE dashboard_slug = 'suporte-c8' AND tenant_id IS DISTINCT FROM id;
  END IF;
END $$;
