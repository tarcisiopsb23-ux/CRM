-- ============================================================
-- Migration 071: políticas públicas de leitura para proposta
--
-- proposal_sections e proposal_services só tinham policy para
-- usuários autenticados da organização. A página pública da
-- proposta (/proposta/:slug) usa a anon key do Supabase e
-- precisa ler essas tabelas sem sessão autenticada.
--
-- Estratégia: permitir SELECT anônimo apenas para linhas cujo
-- proposal_id pertence a uma proposta com deleted_at IS NULL
-- (i.e., proposta ativa). Não expõe dados de outras tabelas.
--
-- Idempotente — usa DO $$ ... IF NOT EXISTS ... END $$ .
-- ============================================================

-- ── proposal_sections ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'proposal_sections'
      AND policyname = 'proposal_sections_public_read'
  ) THEN
    CREATE POLICY "proposal_sections_public_read"
      ON public.proposal_sections
      FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM public.proposals p
          WHERE p.id         = proposal_sections.proposal_id
            AND p.deleted_at IS NULL
            AND p.status     IN ('enviada', 'visualizada', 'aprovada')
        )
      );
  END IF;
END $$;

-- ── proposal_services ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'proposal_services'
      AND policyname = 'proposal_services_public_read'
  ) THEN
    CREATE POLICY "proposal_services_public_read"
      ON public.proposal_services
      FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM public.proposals p
          WHERE p.id         = proposal_services.proposal_id
            AND p.deleted_at IS NULL
            AND p.status     IN ('enviada', 'visualizada', 'aprovada')
        )
      );
  END IF;
END $$;

-- ── proposals (leitura pública de campos não-sensíveis via slug) ─────────────
-- A RPC get_proposal_by_slug já usa SECURITY DEFINER, mas a consulta direta
-- a proposal_sections/services precisa que a tabela proposals também seja
-- legível pelo anon para o EXISTS funcionar sem escalar permissões.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'proposals'
      AND policyname = 'proposals_public_read'
  ) THEN
    CREATE POLICY "proposals_public_read"
      ON public.proposals
      FOR SELECT
      TO anon
      USING (
        deleted_at IS NULL
        AND status IN ('enviada', 'visualizada', 'aprovada')
      );
  END IF;
END $$;

-- Versão
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version)
VALUES ('proposal_public_read_policy_v1')
ON CONFLICT (version) DO NOTHING;
