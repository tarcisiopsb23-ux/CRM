-- =============================================================================
-- MAESTR.IA - Fix: policies INSERT e UPDATE ausentes na tabela profiles
-- =============================================================================
-- Problema: profiles só tinha policy SELECT. INSERT e UPDATE estavam bloqueados
-- pelo RLS, impedindo o fallback de criação de perfil e atualizações via app.
-- =============================================================================

-- Permite que o próprio usuário insira seu perfil (fallback quando trigger falha)
DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Permite que o próprio usuário atualize seu perfil
-- Restringe: não pode alterar id nem organization_id
DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- =============================================================================
-- Garante que get_my_profile está com GRANT correto para role authenticated
-- (idempotente, seguro re-executar)
-- =============================================================================
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_role(user_role[]) TO authenticated;
