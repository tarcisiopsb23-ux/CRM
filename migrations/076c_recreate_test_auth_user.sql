-- =============================================================================
-- Migration 076c: Recria auth.users do usuário de teste com todas as colunas
--
-- O usuário anterior foi inserido sem algumas colunas internas que o GoTrue
-- precisa (is_sso_user, is_anonymous, identities, etc.), causando
-- "Database error loading user" na Admin API e no signInWithPassword.
--
-- Execute no SQL Editor com service_role.
-- =============================================================================

DO $$
DECLARE
  v_old_id   UUID := 'c70eadba-80d1-4502-af76-5253ca6d0c66';
  v_new_id   UUID := gen_random_uuid();
  v_email    TEXT := 'teste@teste.com::teste-agencia-c8@c8.internal';
  v_password TEXT := '12345678';
BEGIN
  -- Remove identities vinculadas ao usuário antigo
  DELETE FROM auth.identities   WHERE user_id = v_old_id;
  DELETE FROM auth.sessions     WHERE user_id = v_old_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = v_old_id::TEXT;
  DELETE FROM auth.mfa_factors  WHERE user_id = v_old_id;

  -- Remove o usuário antigo
  DELETE FROM auth.users WHERE id = v_old_id;

  -- Insere com TODAS as colunas que o GoTrue espera
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at,
    is_anonymous
  ) VALUES (
    v_new_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
    now(),               -- email_confirmed_at
    NULL,                -- invited_at
    '',                  -- confirmation_token
    NULL,                -- confirmation_sent_at
    '',                  -- recovery_token
    NULL,                -- recovery_sent_at
    '',                  -- email_change_token_new
    '',                  -- email_change
    NULL,                -- email_change_sent_at
    NULL,                -- last_sign_in_at
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object(
      'login_key',    'teste@teste.com::teste-agencia-c8',
      'real_email',   'teste@teste.com',
      'client_id',    '00000000-0000-0000-0000-000000000099',
      'client_slug',  'teste-agencia-c8',
      'full_name',    'Usuário Teste C8',
      'role',         'owner',
      'is_test_user', true
    ),
    false,               -- is_super_admin
    now(),               -- created_at
    now(),               -- updated_at
    NULL,                -- phone
    NULL,                -- phone_confirmed_at
    '',                  -- phone_change
    '',                  -- phone_change_token
    NULL,                -- phone_change_sent_at
    '',                  -- email_change_token_current
    0,                   -- email_change_confirm_status
    NULL,                -- banned_until
    '',                  -- reauthentication_token
    NULL,                -- reauthentication_sent_at
    false,               -- is_sso_user
    NULL,                -- deleted_at
    false                -- is_anonymous
  );

  -- Cria a identity vinculada (necessário para signInWithPassword)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    provider_id
  ) VALUES (
    gen_random_uuid(),
    v_new_id,
    jsonb_build_object('sub', v_new_id::TEXT, 'email', v_email),
    'email',
    NULL,
    now(),
    now(),
    v_email
  );

  -- Atualiza dashboard_users com o novo auth_user_id
  UPDATE public.dashboard_users
  SET auth_user_id = v_new_id,
      updated_at   = now()
  WHERE login_key = 'teste@teste.com::teste-agencia-c8';

  RAISE NOTICE 'Usuário recriado com sucesso. Novo ID: %', v_new_id;
END $$;

-- Verificação
SELECT
  au.id,
  au.email,
  au.email_confirmed_at IS NOT NULL AS confirmado,
  au.is_sso_user,
  au.is_anonymous,
  (SELECT COUNT(*) FROM auth.identities WHERE user_id = au.id) AS identities,
  du.auth_user_id IS NOT NULL AS dashboard_users_ok
FROM auth.users au
LEFT JOIN public.dashboard_users du ON du.auth_user_id = au.id
WHERE au.email = 'teste@teste.com::teste-agencia-c8@c8.internal';
