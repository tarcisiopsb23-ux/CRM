-- Migration: 062_service_catalog_add_structured_fields.sql
-- Description: Adiciona campos estruturados ao catálogo de serviços:
--   modality       — Modalidade do serviço (ex: "Híbrida", "Consultiva", "Executiva")
--   description_text — Descrição estratégica do serviço
--   scope          — Escopo de atuação (texto livre ou estruturado)
--   deliverables   — Entregáveis em JSONB: [{id, name, delivery_type, deadline_days?, quantity?}]

-- ── 1. Adicionar colunas à service_catalog ────────────────────────────────────

ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS modality        TEXT,
  ADD COLUMN IF NOT EXISTS description_text TEXT,
  ADD COLUMN IF NOT EXISTS scope            TEXT,
  ADD COLUMN IF NOT EXISTS deliverables     JSONB NOT NULL DEFAULT '[]';

-- ── 2. Comentários de documentação ───────────────────────────────────────────

COMMENT ON COLUMN public.service_catalog.modality IS
  'Modalidade de entrega: ex "Consultiva", "Executiva", "Híbrida"';

COMMENT ON COLUMN public.service_catalog.description_text IS
  'Descrição estratégica do serviço exibida em propostas e contratos';

COMMENT ON COLUMN public.service_catalog.scope IS
  'Escopo de atuação do serviço (ex: planejamento, gestão de campanhas, indicadores)';

COMMENT ON COLUMN public.service_catalog.deliverables IS
  'Array de entregáveis JSONB. Cada item: {id, name, delivery_type, output_format, text_value?, unit?}
   delivery_type: "recorrente" | "unico" | "pontual"';
