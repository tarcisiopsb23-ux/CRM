-- =============================================================================
-- Migration 085: Recria client_representatives_vw para incluir
-- estado_civil e nacionalidade adicionados na migration 083.
-- Remove CHECK constraints de estado_civil para permitir texto livre.
-- =============================================================================

-- 1. Remove CHECK constraint de estado_civil em clients (se existir)
DO $$ BEGIN
  ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_estado_civil_check;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Remove CHECK constraint de estado_civil em client_representatives (se existir)
DO $$ BEGIN
  ALTER TABLE public.client_representatives DROP CONSTRAINT IF EXISTS client_representatives_estado_civil_check;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 3. Recria view para forçar releitura das colunas pelo Supabase
DROP VIEW IF EXISTS public.client_representatives_vw;

CREATE VIEW public.client_representatives_vw AS
SELECT
  r.*,
  public.is_procuracao_vencida(r.procuracao_validade::DATE, r.procuracao_indeterminada) AS procuracao_vencida
FROM public.client_representatives r;

COMMENT ON VIEW public.client_representatives_vw IS
  'Visão de client_representatives com a coluna calculada procuracao_vencida.
   Inclui todos os campos da tabela, incluindo estado_civil e nacionalidade.';

GRANT SELECT ON public.client_representatives_vw TO authenticated;
GRANT SELECT ON public.client_representatives_vw TO anon;

INSERT INTO public.schema_migrations (version)
VALUES ('085_fix_representatives_vw_v1')
ON CONFLICT (version) DO NOTHING;
