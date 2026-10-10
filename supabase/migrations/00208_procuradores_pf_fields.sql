-- ============================================================
-- Migration 00208: Procuradores em client_representatives
--                  + campos PF (estado_civil, nacionalidade) em clients
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- 1. Expande client_representatives com campos de procuração:
--      tipo_representacao, procuracao_tipo, procuracao_data,
--      procuracao_validade, procuracao_indeterminada,
--      procuracao_notas, representa_ids
-- 2. Adiciona função is_procuracao_vencida() para uso em queries
-- 3. Adiciona coluna computada procuracao_vencida (GENERATED) via view
-- 4. Adiciona estado_civil e nacionalidade em clients (campos PF)
-- ============================================================

-- ── 1. Novos campos em client_representatives ─────────────────────────────────

-- Tipo de representação: direto (sócio/proprietário) ou via procuração
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS tipo_representacao TEXT NOT NULL DEFAULT 'legal'
    CHECK (tipo_representacao IN ('legal', 'procurador'));

-- Tipo do instrumento de procuração
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_tipo TEXT
    CHECK (procuracao_tipo IN ('publica', 'particular'));

-- Data de lavratura da procuração
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_data DATE;

-- Data de validade da procuração (NULL quando indeterminada)
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_validade DATE;

-- Flag explícita: prazo indeterminado (true) ou determinado (false/null)
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_indeterminada BOOLEAN NOT NULL DEFAULT false;

-- Notas da procuração: cartório, livro, folha, matrícula, etc.
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS procuracao_notas TEXT;

-- IDs dos representantes legais que este procurador representa.
-- NULL = representa a própria parte (contratante PJ ou PF diretamente).
-- Array de UUIDs referenciando outros registros de client_representatives.
ALTER TABLE public.client_representatives
  ADD COLUMN IF NOT EXISTS representa_ids UUID[];

COMMENT ON COLUMN public.client_representatives.tipo_representacao IS
  'legal = representante legal direto (sócio, proprietário, etc.)
   procurador = age por procuração em nome de outro representante ou da parte';

COMMENT ON COLUMN public.client_representatives.procuracao_tipo IS
  'publica = lavrada em cartório (escritura pública)
   particular = instrumento particular assinado';

COMMENT ON COLUMN public.client_representatives.procuracao_data IS
  'Data em que a procuração foi lavrada/assinada.';

COMMENT ON COLUMN public.client_representatives.procuracao_validade IS
  'Data de vencimento da procuração. NULL quando procuracao_indeterminada = true.
   Usado exclusivamente para controle interno do CRM — não aparece no contrato.';

COMMENT ON COLUMN public.client_representatives.procuracao_indeterminada IS
  'true = procuração sem prazo de vencimento definido.
   Quando true, procuracao_validade deve ser NULL.';

COMMENT ON COLUMN public.client_representatives.procuracao_notas IS
  'Informações adicionais: cartório, número do livro, folha, matrícula, etc.
   Campo livre para controle interno do CRM.';

COMMENT ON COLUMN public.client_representatives.representa_ids IS
  'Array de IDs (client_representatives.id) dos representantes legais que este
   procurador representa. NULL = representa a própria parte (PJ ou PF).
   Útil em assinaturas conjuntas onde cada sócio pode ter procurador distinto.';

-- Constraint: campos de procuração só fazem sentido quando tipo_representacao = 'procurador'
-- (validação soft — não bloqueante para não quebrar seeds existentes)
-- A regra de negócio é reforçada na camada de aplicação.

-- ── 2. Função utilitária: is_procuracao_vencida ───────────────────────────────

CREATE OR REPLACE FUNCTION public.is_procuracao_vencida(
  p_validade          DATE,
  p_indeterminada     BOOLEAN
) RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    CASE
      WHEN p_indeterminada = true  THEN false          -- prazo indeterminado → nunca vence
      WHEN p_validade IS NULL      THEN false          -- sem data informada → não considera vencido
      ELSE p_validade < CURRENT_DATE
    END;
$$;

COMMENT ON FUNCTION public.is_procuracao_vencida(DATE, BOOLEAN) IS
  'Retorna true se a procuração está vencida (validade < hoje) e não é indeterminada.
   Uso: SELECT is_procuracao_vencida(procuracao_validade, procuracao_indeterminada)
          FROM client_representatives WHERE tipo_representacao = ''procurador'';';

GRANT EXECUTE ON FUNCTION public.is_procuracao_vencida(DATE, BOOLEAN) TO authenticated;

-- ── 3. View: client_representatives_vw (acrescenta procuracao_vencida) ─────────

CREATE OR REPLACE VIEW public.client_representatives_vw AS
SELECT
  r.*,
  public.is_procuracao_vencida(r.procuracao_validade, r.procuracao_indeterminada)
    AS procuracao_vencida
FROM public.client_representatives r;

COMMENT ON VIEW public.client_representatives_vw IS
  'Visão de client_representatives com a coluna calculada procuracao_vencida.
   Use esta view para listar representantes e filtrar procurações vencidas no CRM.';

-- ── 4. Campos PF em clients ───────────────────────────────────────────────────

-- Estado civil — relevante apenas para pessoa física (document com 11 dígitos)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS estado_civil TEXT
    CHECK (estado_civil IN (
      'solteiro', 'casado', 'viuvo', 'divorciado', 'uniao_estavel'
    ));

-- Nacionalidade — usada na qualificação do contratante PF
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS nacionalidade TEXT DEFAULT 'brasileiro(a)';

COMMENT ON COLUMN public.clients.estado_civil IS
  'Estado civil do contratante pessoa física.
   Valores: solteiro, casado, viuvo, divorciado, uniao_estavel.
   NULL para pessoa jurídica (CNPJ).';

COMMENT ON COLUMN public.clients.nacionalidade IS
  'Nacionalidade do contratante pessoa física para qualificação no contrato.
   Padrão: brasileiro(a). NULL para pessoa jurídica (CNPJ).';

-- ── 5. Índice auxiliar para busca por procurações vencidas ────────────────────

CREATE INDEX IF NOT EXISTS idx_client_representatives_procuracao
  ON public.client_representatives(client_id, tipo_representacao, procuracao_validade)
  WHERE tipo_representacao = 'procurador';

-- ── 6. Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('procuradores_pf_fields_v1')
ON CONFLICT (version) DO NOTHING;
