-- Correção Unificada de Autenticação e Perfis (RLS + RPC)
-- Execute este script no SQL Editor do Supabase para corrigir o erro "Perfil não encontrado".

-- 1. Habilitar RLS na tabela profiles (segurança básica)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Garantir que usuários possam ler seu próprio perfil (RLS)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

-- 3. Garantir que usuários possam editar seu próprio perfil (RLS)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);

-- 4. Garantir que usuários possam inserir seu próprio perfil (RLS - necessário no cadastro)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" 
ON profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- 5. Função RPC Segura para buscar o perfil (Bypass RLS se necessário)
-- Esta função é usada pelo AuthContext para garantir que o perfil seja carregado mesmo se o RLS falhar.
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Executa com permissões de admin (bypassa RLS)
STABLE
SET search_path = public
AS $$
DECLARE
  v_profile json;
BEGIN
  -- Retorna null se não estiver autenticado
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- Busca o perfil do usuário atual
  SELECT to_jsonb(p)::json INTO v_profile
  FROM profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  RETURN v_profile;
END;
$$;

-- Conceder permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_profile() TO service_role;

-- 6. Garantir que usuários possam ver sua organização
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own organization" ON organizations;
CREATE POLICY "Users can view own organization" 
ON organizations FOR SELECT 
USING (
  id IN (
    SELECT organization_id FROM profiles 
    WHERE id = auth.uid()
  )
);

-- 7. Correção para administradores verem todos os perfis da organização
DROP POLICY IF EXISTS "Admins can view organization profiles" ON profiles;
CREATE POLICY "Admins can view organization profiles" 
ON profiles FOR SELECT 
USING (
  auth.uid() IN (
    SELECT id FROM profiles AS admin 
    WHERE admin.id = auth.uid() 
    AND admin.role IN ('owner', 'admin')
    AND admin.organization_id = profiles.organization_id
  )
);
