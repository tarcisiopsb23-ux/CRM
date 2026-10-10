-- =============================================================================
-- Migration 076: Corrige usuário de teste do Cliente Banco A
--
-- Problema: migration 075 inseriu em dashboard_users mas:
--   1. auth.users não foi criado (gen_salt falhou) → auth_user_id = NULL
--      → Edge Function cai no Modo B → 400 "dashboard não configurado"
--   2. crm_client_users não foi populado
--      → fallback de contagem e lista de usuários retorna 0
--
-- Esta migration corrige os três pontos usando apenas extensions.crypt()
-- (sem depender de pgcrypto no search_path padrão).
--
-- Execute: Supabase SQL Editor com service_role.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public._fix_test_client_user_076()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $func$
DECLARE
  v_client_id    UUID := '00000000-0000-0000-0000-000000000099';
  v_du_id        UUID := '00000000-0000-0000-0000-000000000801';
  v_ccu_id       UUID := '00000000-0000-0000-0000-000000000901';
  v_login_key    TEXT := 'teste@teste.com::teste-agencia-c8';
  v_int_email    TEXT := 'teste@teste.com::teste-agencia-c8@c8.internal';
  v_real_email   TEXT := 'teste@teste.com';
  v_password     TEXT := '12345678';
  v_auth_id      UUID;
  v_org_id       UUID;
BEGIN
  -- Organização
  SELECT organization_id INTO v_org_id
  FROM public.clients WHERE id = v_client_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Cliente de teste não encontrado. Execute a migration 075 primeiro.';
  END IF;

  -- ── 1. auth.users ──────────────────────────────────────────────────────────
  -- Verifica se já existe pelo e-mail interno
  SELECT id INTO v_auth_id
  FROM auth.users WHERE email = v_int_email LIMIT 1;

  IF v_auth_id IS NULL THEN
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
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_int_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      jsonb_build_object(
        'login_key',    v_login_key,
        'real_email',   v_real_email,
        'client_id',    v_client_id::TEXT,
        'client_slug',  'teste-agencia-c8',
        'full_name',    'Usuário Teste C8',
        'role',         'owner',
        'is_test_user', true
      ),
      jsonb_build_object('provider','email','providers',ARRAY['email']),
      false,
      now(),
      now(),
      '', '', '', ''
    )
    RETURNING id INTO v_auth_id;

    RAISE NOTICE '[076] auth.users criado: % → %', v_int_email, v_auth_id;
  ELSE
    -- Garante que a senha está correta mesmo se o usuário já existia
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at         = now()
    WHERE id = v_auth_id;

    RAISE NOTICE '[076] auth.users já existia, senha atualizada: % → %', v_int_email, v_auth_id;
  END IF;

  -- ── 2. dashboard_users — sincroniza auth_user_id ───────────────────────────
  INSERT INTO public.dashboard_users (
    id, client_id, organization_id,
    login_key, real_email, client_slug,
    auth_user_id, full_name, role,
    active, is_support
  ) VALUES (
    v_du_id, v_client_id, v_org_id,
    v_login_key, v_real_email, 'teste-agencia-c8',
    v_auth_id, 'Usuário Teste C8', 'owner',
    true, false
  )
  ON CONFLICT (id) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    active       = true,
    updated_at   = now();

  -- Garante também pelo login_key (caso o id já existisse com outro valor)
  UPDATE public.dashboard_users
  SET
    auth_user_id = v_auth_id,
    active       = true,
    updated_at   = now()
  WHERE login_key = v_login_key
    AND (auth_user_id IS DISTINCT FROM v_auth_id OR active = false);

  RAISE NOTICE '[076] dashboard_users.auth_user_id = %', v_auth_id;

  -- ── 3. crm_client_users — necessário para contagem e lista no C8 Control ───
  -- O fallback de useC8Tenants e useCrmClientUsers lê desta tabela quando
  -- não há Banco B configurado (client_supabase_url = NULL).
  -- Colunas reais confirmadas via useC8TenantActions.ts:
  --   organization_id, client_id, email, name, active, is_primary
  --   (sem role — não existe nessa tabela)
  INSERT INTO public.crm_client_users (
    id,
    client_id,
    organization_id,
    email,
    name,
    active,
    is_support,
    is_primary,
    last_access_at
  ) VALUES (
    v_ccu_id,
    v_client_id,
    v_org_id,
    v_real_email,
    'Usuário Teste C8',
    true,
    false,
    true,
    now()   -- last_access_at preenchido = conta como "ativo" no useC8Tenants
  )
  ON CONFLICT (id) DO UPDATE SET
    active         = true,
    last_access_at = COALESCE(crm_client_users.last_access_at, now());

  RAISE NOTICE '[076] crm_client_users inserido/atualizado para client_id %', v_client_id;

  RAISE NOTICE '[076] Concluído. Login: % / %', v_real_email, v_password;
END;
$func$;

-- Executa e limpa
SELECT public._fix_test_client_user_076();
DROP FUNCTION IF EXISTS public._fix_test_client_user_076();

INSERT INTO public.schema_migrations (version)
VALUES ('076_fix_test_client_user_v1')
ON CONFLICT (version) DO NOTHING;
