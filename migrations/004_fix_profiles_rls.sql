-- Correção de Permissões (RLS) para a tabela de Perfis
-- Se o usuário não puder ler seu próprio perfil, o sistema não consegue determinar a organização.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 1. Usuários podem ver seu próprio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

-- 2. Usuários podem editar seu próprio perfil
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);

-- 3. Admins/Owners podem ver todos os perfis da mesma organização
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

-- 4. Permitir inserção de perfil (necessário no cadastro)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" 
ON profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- 5. Se houver tabela de membros separada (caso legado), garantir acesso
-- Mas como vimos, o vínculo parece ser direto na tabela profiles.

-- Correção adicional para evitar recursão infinita em policies que dependem de profiles
-- Algumas policies podem falhar se tentarem ler profiles enquanto profiles está bloqueada.
-- A policy "Users can view own profile" é segura pois usa auth.uid() = id diretamente.

-- Garantir que a tabela organizations seja legível
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
