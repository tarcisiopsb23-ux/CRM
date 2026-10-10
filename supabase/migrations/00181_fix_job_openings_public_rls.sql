-- =============================================================================
-- Migration 00181: Corrige RLS da tabela job_openings para leitura pública
--
-- Problema: a policy "job_openings_org_access" usa FOR ALL com USING que
-- chama get_user_organization_id(). Sem autenticação, essa função retorna NULL
-- e a policy falha. O PostgREST pode rejeitar a query antes de avaliar a
-- policy pública.
--
-- Solução: separar a policy de escrita (autenticados) da leitura (pública).
-- =============================================================================

-- Remove policies existentes
DROP POLICY IF EXISTS "job_openings_org_access"    ON job_openings;
DROP POLICY IF EXISTS "job_openings_public_select" ON job_openings;

-- Leitura autenticada: membros da organização veem todas as vagas
CREATE POLICY "job_openings_auth_select" ON job_openings
  FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    OR status = 'aberta'
  );

-- Escrita: apenas membros autenticados da organização
CREATE POLICY "job_openings_auth_write" ON job_openings
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "job_openings_auth_update" ON job_openings
  FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "job_openings_auth_delete" ON job_openings
  FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Leitura pública: qualquer pessoa (anon) pode ver vagas abertas
CREATE POLICY "job_openings_public_read" ON job_openings
  FOR SELECT
  USING (status = 'aberta');
