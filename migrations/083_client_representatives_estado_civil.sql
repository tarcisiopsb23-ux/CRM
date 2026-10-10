-- =============================================================================
-- Migration 083: estado_civil e nacionalidade nos representantes legais
--
-- Adiciona colunas estado_civil e nacionalidade à tabela client_representatives
-- para que representantes de clientes CNPJ (PJ) possam ter esses dados registrados
-- separadamente dos dados do cliente titular.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS estado_civil  TEXT CHECK (
    estado_civil IS NULL OR estado_civil IN (
      'solteiro', 'casado', 'viuvo', 'divorciado', 'uniao_estavel'
    )
  ),
  ADD COLUMN IF NOT EXISTS nacionalidade TEXT;

COMMENT ON COLUMN public.client_representatives.estado_civil  IS 'Estado civil do representante — usado na qualificação do contrato';
COMMENT ON COLUMN public.client_representatives.nacionalidade IS 'Nacionalidade do representante — usado na qualificação do contrato';

INSERT INTO public.schema_migrations (version)
VALUES ('083_client_representatives_estado_civil_v1')
ON CONFLICT (version) DO NOTHING;
