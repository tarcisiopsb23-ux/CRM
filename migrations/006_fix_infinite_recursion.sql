-- Correção Definitiva de Recursão Infinita em Políticas RLS
-- O erro ocorre porque as políticas da tabela 'profiles' consultam a própria tabela 'profiles', criando um loop.
-- Solução: Usar funções SECURITY DEFINER que leem os dados com privilégios de sistema (ignorando RLS) para usar nas condições.

-- 1. Função segura para obter o ID da organização do usuário atual
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER -- Executa como criador da função (admin), ignorando RLS
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. Função segura para obter o Role do usuário atual
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Conceder acesso às funções
GRANT EXECUTE ON FUNCTION public.get_auth_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_org_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO service_role;


-- 3. Reescrever as políticas da tabela PROFILES para usar essas funções
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas problemáticas
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view organization profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can manage organization profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "View profiles" ON profiles;
DROP POLICY IF EXISTS "Update profiles" ON profiles;
DROP POLICY IF EXISTS "Insert profiles" ON profiles;
DROP POLICY IF EXISTS "Delete profiles" ON profiles;

-- NOVA POLÍTICA DE LEITURA (SELECT)
-- Usuário vê APENAS a si mesmo, EXCETO se for Admin/Owner (que vê todos da organização)
CREATE POLICY "View profiles" ON profiles
FOR SELECT
USING (
  id = auth.uid() 
  OR 
  (get_auth_role() IN ('owner', 'admin') AND organization_id = get_auth_org_id())
);

-- NOVA POLÍTICA DE ATUALIZAÇÃO (UPDATE)
-- Usuário edita a si mesmo OU Admin/Owner edita membros da sua organização
CREATE POLICY "Update profiles" ON profiles
FOR UPDATE
USING (
  id = auth.uid() 
  OR 
  (get_auth_role() IN ('owner', 'admin') AND organization_id = get_auth_org_id())
);

-- NOVA POLÍTICA DE INSERÇÃO (INSERT)
-- Usuário pode se cadastrar (auth.uid = id) OU Admin pode criar novos perfis (para convites diretos, se houver)
CREATE POLICY "Insert profiles" ON profiles
FOR INSERT
WITH CHECK (
  id = auth.uid()
  OR
  (get_auth_role() IN ('owner', 'admin') AND organization_id = get_auth_org_id())
);

-- NOVA POLÍTICA DE EXCLUSÃO (DELETE)
-- Apenas Admin/Owner pode remover membros da sua organização
CREATE POLICY "Delete profiles" ON profiles
FOR DELETE
USING (
  get_auth_role() IN ('owner', 'admin') AND organization_id = get_auth_org_id()
);
