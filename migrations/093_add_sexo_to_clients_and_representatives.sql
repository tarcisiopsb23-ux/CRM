-- =============================================================================
-- Migration 093: Adiciona coluna `sexo` em clients e client_representatives.
--
-- O campo `sexo` ('masculino' | 'feminino') é usado para uso interno e para
-- resolver automaticamente o gênero gramatical das variáveis de contrato,
-- eliminando a necessidade de exibir "casado(a)", "brasileiro(a)" etc.
-- =============================================================================

-- 1. Adiciona coluna `sexo` em clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sexo TEXT;

-- 2. Adiciona coluna `sexo` em client_representatives
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS sexo TEXT;

-- 3. Adiciona CHECK constraints para garantir valores válidos
DO $$ BEGIN
  ALTER TABLE public.clients
    ADD CONSTRAINT clients_sexo_check
    CHECK (sexo IS NULL OR sexo IN ('masculino', 'feminino'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.client_representatives
    ADD CONSTRAINT client_representatives_sexo_check
    CHECK (sexo IS NULL OR sexo IN ('masculino', 'feminino'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Comenta as colunas
COMMENT ON COLUMN public.clients.sexo IS
  'Sexo biológico para uso interno (masculino | feminino). Usado para resolver gênero gramatical nos contratos.';
COMMENT ON COLUMN public.client_representatives.sexo IS
  'Sexo biológico para uso interno (masculino | feminino). Usado para resolver gênero gramatical nos contratos.';

-- 5. Recria a view client_representatives_vw para incluir a nova coluna
DROP VIEW IF EXISTS public.client_representatives_vw;

CREATE VIEW public.client_representatives_vw AS
SELECT
  r.*,
  public.is_procuracao_vencida(r.procuracao_validade::DATE, r.procuracao_indeterminada) AS procuracao_vencida
FROM public.client_representatives r;

COMMENT ON VIEW public.client_representatives_vw IS
  'Visão de client_representatives com a coluna calculada procuracao_vencida.
   Inclui todos os campos da tabela, incluindo estado_civil, nacionalidade e sexo.';

GRANT SELECT ON public.client_representatives_vw TO authenticated;
GRANT SELECT ON public.client_representatives_vw TO anon;

INSERT INTO public.schema_migrations (version)
VALUES ('093_add_sexo_to_clients_and_representatives_v1')
ON CONFLICT (version) DO NOTHING;
