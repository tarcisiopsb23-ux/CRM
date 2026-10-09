-- =============================================================================
-- VERIFICAÇÃO — Migration 075 (Cliente de Teste Banco A)
-- Execute separadamente no SQL Editor APÓS rodar 075_seed_test_client_banco_a.sql
-- =============================================================================

-- Cliente e plano:
SELECT
  c.id,
  c.name,
  c.dashboard_slug,
  c.c8_control_enabled,
  c.client_supabase_url IS NULL AS banco_b_desativado,
  p.c8_activation_status,
  p.provisioning_status
FROM public.clients c
LEFT JOIN public.crm_client_plans p ON p.client_id = c.id
WHERE c.id = '00000000-0000-0000-0000-000000000099';

-- Status de migração (deve ser 'completed'):
SELECT
  status,
  users_migrated, crm_migrated, ai_migrated, charges_migrated,
  users_count, contacts_count, deals_count, events_count
FROM public.client_migration_status
WHERE client_id = '00000000-0000-0000-0000-000000000099';

-- Usuário e auth:
SELECT
  du.login_key,
  du.real_email,
  du.role,
  du.active,
  du.auth_user_id IS NOT NULL     AS tem_auth_user,
  au.email                        AS internal_email,
  au.email_confirmed_at IS NOT NULL AS email_confirmado
FROM public.dashboard_users du
LEFT JOIN auth.users au ON au.id = du.auth_user_id
WHERE du.client_id = '00000000-0000-0000-0000-000000000099';

-- Dados CRM e IA:
SELECT
  (SELECT COUNT(*) FROM public.client_crm_contacts        WHERE client_id = '00000000-0000-0000-0000-000000000099') AS contatos,
  (SELECT COUNT(*) FROM public.client_crm_pipeline_stages WHERE client_id = '00000000-0000-0000-0000-000000000099') AS etapas,
  (SELECT COUNT(*) FROM public.client_crm_deals           WHERE client_id = '00000000-0000-0000-0000-000000000099') AS deals,
  (SELECT COUNT(*) FROM public.client_crm_products        WHERE client_id = '00000000-0000-0000-0000-000000000099') AS produtos,
  (SELECT COUNT(*) FROM public.client_ai_settings         WHERE client_id = '00000000-0000-0000-0000-000000000099') AS settings_ia,
  (SELECT COUNT(*) FROM public.client_ai_notices          WHERE client_id = '00000000-0000-0000-0000-000000000099') AS avisos,
  (SELECT COUNT(*) FROM public.client_ai_promotions       WHERE client_id = '00000000-0000-0000-0000-000000000099') AS promocoes,
  (SELECT COUNT(*) FROM public.client_ai_suggestions      WHERE client_id = '00000000-0000-0000-0000-000000000099') AS sugestoes,
  (SELECT COUNT(*) FROM public.client_ai_events           WHERE client_id = '00000000-0000-0000-0000-000000000099') AS eventos;
