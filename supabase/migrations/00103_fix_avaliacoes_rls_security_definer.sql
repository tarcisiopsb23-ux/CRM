-- Migration 00103: fix RLS on avaliacoes_360 to allow SECURITY DEFINER functions
-- SECURITY DEFINER functions run as the function owner (postgres role),
-- which bypasses RLS by default in Supabase. But to be safe, also ensure
-- the write policy uses WITH CHECK for INSERT operations.

DROP POLICY IF EXISTS "avaliacoes_write" ON avaliacoes_360;

-- Separate INSERT policy (WITH CHECK) and UPDATE policy (USING)
CREATE POLICY "avaliacoes_insert" ON avaliacoes_360 FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.role() = 'postgres'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_360.organization_id
        AND p.role IN ('admin','owner')
    )
  );

CREATE POLICY "avaliacoes_update" ON avaliacoes_360 FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR auth.role() = 'postgres'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_360.organization_id
        AND p.role IN ('admin','owner')
    )
  );

-- Also allow the avaliador to update their own (to mark as concluido)
CREATE POLICY "avaliacoes_update_own" ON avaliacoes_360 FOR UPDATE
  USING (avaliador_id = auth.uid());
