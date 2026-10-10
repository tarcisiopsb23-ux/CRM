-- =============================================================================
-- Migration 086: Garante RLS e policies corretas na tabela contracts
-- Corrige erro 400 no GET /contracts?select=*
-- =============================================================================

-- Garante que RLS está habilitado
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Remove policies antigas que possam estar conflitando
DROP POLICY IF EXISTS "contracts_select" ON public.contracts;
DROP POLICY IF EXISTS "contracts_insert" ON public.contracts;
DROP POLICY IF EXISTS "contracts_update" ON public.contracts;
DROP POLICY IF EXISTS "contracts_delete" ON public.contracts;
DROP POLICY IF EXISTS "org_member_select" ON public.contracts;
DROP POLICY IF EXISTS "org_member_insert" ON public.contracts;
DROP POLICY IF EXISTS "org_member_update" ON public.contracts;
DROP POLICY IF EXISTS "org_member_delete" ON public.contracts;

-- SELECT: membro da organização pode ver contratos da sua org
CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- INSERT: membro da organização pode criar contratos
CREATE POLICY "contracts_insert" ON public.contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- UPDATE: membro da organização pode alterar contratos da sua org
CREATE POLICY "contracts_update" ON public.contracts
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- DELETE: membro da organização pode excluir contratos da sua org
CREATE POLICY "contracts_delete" ON public.contracts
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;

INSERT INTO public.schema_migrations (version)
VALUES ('086_fix_contracts_rls_v1')
ON CONFLICT (version) DO NOTHING;
