-- =============================================================================
-- Migration 075b: Usuário de teste no auth.users (Banco A)
-- Usa auth.create_user() — função interna do Supabase que não depende de pgcrypto.
--
-- Execute no SQL Editor com service_role APÓS rodar 075_seed_test_client_banco_a.sql
--
-- Login: teste@teste.com / 12345678
-- =============================================================================

DO $$
DECLARE
  v_client_id     UUID := '00000000-0000-0000-0000-000000000099';
  v_du_id         UUID := '00000000-0000-0000-0000-000000000801';
  v_login_key     TEXT := 'teste@teste.com::teste-agencia-c8';
  v_int_email     TEXT := 'teste@teste.com::teste-agencia-c8@c8.internal';
  v_auth_user_id  UUID;
  v_org_id        UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.clients WHERE id = v_client_id;

  -- Verifica se já existe
  SELECT id INTO v_auth_user_id
  FROM auth.users WHERE email = v_int_email LIMIT 1;

  IF v_auth_user_id IS NOT NULL THEN
    RAISE NOTICE 'Usuário já existe: % (id: %)', v_int_email, v_auth_user_id;
  ELSE
    -- Insere diretamente em auth.users sem crypt/gen_salt
    -- O Supabase aceita senha em texto plano no campo encrypted_password
    -- quando usa a função interna de hash via extensions.pgcrypto
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      raw_app_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    SELECT
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_int_email,
      extensions.crypt('12345678', extensions.gen_salt('bf')),
      now(),
      jsonb_build_object(
        'login_key',    v_login_key,
        'real_email',   'teste@teste.com',
        'client_id',    v_client_id::TEXT,
        'client_slug',  'teste-agencia-c8',
        'full_name',    'Usuário Teste C8',
        'role',         'owner',
        'is_test_user', true
      ),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      false,
      now(),
      now(),
      '', '', '', ''
    RETURNING id INTO v_auth_user_id;

    RAISE NOTICE 'auth.users criado: % → %', v_int_email, v_auth_user_id;
  END IF;

  -- Atualiza dashboard_users com o auth_user_id
  UPDATE public.dashboard_users
  SET
    auth_user_id = v_auth_user_id,
    updated_at   = now()
  WHERE login_key = v_login_key;

  IF NOT FOUND THEN
    -- dashboard_users ainda não existe — insere
    INSERT INTO public.dashboard_users (
      id, client_id, organization_id,
      login_key, real_email, client_slug,
      auth_user_id, full_name, role,
      active, is_support
    ) VALUES (
      v_du_id, v_client_id, v_org_id,
      v_login_key, 'teste@teste.com', 'teste-agencia-c8',
      v_auth_user_id, 'Usuário Teste C8', 'owner',
      true, false
    )
    ON CONFLICT (id) DO UPDATE SET
      auth_user_id = EXCLUDED.auth_user_id,
      updated_at   = now();
  END IF;

  RAISE NOTICE 'dashboard_users sincronizado. auth_user_id: %', v_auth_user_id;
END $$;

-- Verificação rápida
SELECT
  du.login_key,
  du.real_email,
  du.role,
  du.active,
  du.auth_user_id IS NOT NULL       AS tem_auth_user,
  au.email                          AS internal_email,
  au.email_confirmed_at IS NOT NULL AS email_confirmado
FROM public.dashboard_users du
LEFT JOIN auth.users au ON au.id = du.auth_user_id
WHERE du.client_id = '00000000-0000-0000-0000-000000000099';
