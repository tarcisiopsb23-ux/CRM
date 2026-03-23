-- Migration 00106: clean up avaliacoes_360 RLS policies
-- SECURITY DEFINER functions bypass RLS automatically — no need for postgres role check.
-- Split ALL policy into INSERT + UPDATE for correctness.

DROP POLICY IF EXISTS "avaliacoes_write" ON avaliacoes_360;
DROP POLICY IF EXISTS "avaliacoes_insert" ON avaliacoes_360;
DROP POLICY IF EXISTS "avaliacoes_update" ON avaliacoes_360;
DROP POLICY IF EXISTS "avaliacoes_update_own" ON avaliacoes_360;

-- INSERT: admin/owner ou service_role
CREATE POLICY "avaliacoes_insert" ON avaliacoes_360 FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_360.organization_id
        AND p.role IN ('admin','owner')
    )
  );

-- UPDATE: admin/owner, service_role, ou o próprio avaliador (para marcar concluido)
CREATE POLICY "avaliacoes_update" ON avaliacoes_360 FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR avaliador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_360.organization_id
        AND p.role IN ('admin','owner')
    )
  );
