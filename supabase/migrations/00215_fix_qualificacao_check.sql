-- ============================================================
-- Migration 00210: Corrige CHECK constraint de qualificacao
--                  em client_representatives
--                  + GRANT na view client_representatives_vw
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- Problema 1: a constraint criada em 00207 lista apenas os valores antigos
--   ('proprietario', 'socio', 'socio_administrador', 'administrativo',
--    'financeiro', 'criativo')
-- mas o código usa também 'procurador' e 'representante_legal',
-- causando erro 400 ao salvar representantes com essas qualificações.
--
-- Problema 2: a view client_representatives_vw criada em 00208 não tinha
-- GRANT SELECT para o role authenticated, podendo causar 400 no SELECT.
--
-- Solução:
--   1. Drop da constraint gerada automaticamente + recriação com os
--      4 valores ativos no tipo RepresentativeQualificacao do front-end.
--   2. GRANT SELECT na view para authenticated e anon.
-- ============================================================

-- ── 1. Remove a constraint atual (nome gerado pelo Postgres) ─────────────────
-- Usa bloco DO para dropar pelo nome dinâmico sem falhar caso já não exista.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.client_representatives'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%qualificacao%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.client_representatives DROP CONSTRAINT %I',
      v_constraint
    );
  END IF;
END $$;

-- ── 2. Recria a constraint com todos os valores válidos ──────────────────────

ALTER TABLE public.client_representatives
  ADD CONSTRAINT client_representatives_qualificacao_check
  CHECK (qualificacao IN (
    'socio_administrador',
    'socio',
    'procurador',
    'representante_legal'
  ));

COMMENT ON COLUMN public.client_representatives.qualificacao IS
  'socio_administrador | socio | procurador | representante_legal';

-- ── 3. GRANT na view ─────────────────────────────────────────────────────────

GRANT SELECT ON public.client_representatives_vw TO authenticated;
GRANT SELECT ON public.client_representatives_vw TO anon;

-- ── 4. Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('fix_qualificacao_check_v1')
ON CONFLICT (version) DO NOTHING;
