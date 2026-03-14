-- 1. Verifica se as funções existem e seus tipos de segurança
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_name IN ('get_my_profile', 'get_user_organization_id', 'user_has_role')
  AND routine_schema = 'public'
ORDER BY routine_name;

-- 2. Verifica políticas RLS da tabela profiles
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 3. Verifica se a tabela profiles tem RLS habilitado
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'profiles';

-- 4. Verifica grants nas funções
SELECT grantee, privilege_type, routine_name
FROM information_schema.role_routine_grants
WHERE routine_name IN ('get_my_profile', 'get_user_organization_id', 'user_has_role')
  AND routine_schema = 'public'
ORDER BY routine_name, grantee;
