-- ============================================================
-- Migration 069: proposals — adicionar coluna projecoes
--
-- Armazena dados para os gráficos de projeção da proposta pública.
-- Formato JSON esperado pelo componente ProjecaoChart:
-- {
--   kpis?:        [{ label, value, prefix?, suffix? }],
--   comparativo?: { label_antes?, label_depois?, items: [{ metric, antes, depois, suffix? }] },
--   crescimento?: { label?, data: [{ mes, valor }] },
--   roi?:         { investimento, retorno_estimado, prazo_meses }
-- }
--
-- Idempotente — pode ser executada múltiplas vezes sem erro.
-- ============================================================

-- 1. Adicionar coluna (idempotente)
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS projecoes JSONB;

-- 2. Atualizar a RPC pública para incluir projecoes
-- É necessário dropar antes porque a assinatura de retorno mudou (novo campo JSONB)
DROP FUNCTION IF EXISTS get_proposal_by_slug(TEXT);

CREATE OR REPLACE FUNCTION get_proposal_by_slug(p_slug TEXT)
RETURNS TABLE (
  proposal_id          UUID,
  organization_id      UUID,
  client_name          TEXT,
  title                TEXT,
  status               TEXT,
  hero_logo_url        TEXT,
  hero_title           TEXT,
  hero_subtitle        TEXT,
  hero_message         TEXT,
  hero_video_url       TEXT,
  hero_image_url       TEXT,
  hero_whatsapp_text   TEXT,
  hero_whatsapp_number TEXT,
  hero_cta_text        TEXT,
  hero_cta_color       TEXT,
  plan_value           NUMERIC,
  schedule             JSONB,
  projecoes            JSONB
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    p.organization_id,
    c.name,
    p.title,
    p.status,
    p.hero_logo_url,
    p.hero_title,
    p.hero_subtitle,
    p.hero_message,
    p.hero_video_url,
    p.hero_image_url,
    p.hero_whatsapp_text,
    p.hero_whatsapp_number,
    p.hero_cta_text,
    p.hero_cta_color,
    p.plan_value,
    p.schedule,
    p.projecoes
  FROM proposals p
  JOIN clients c ON c.id = p.client_id
  WHERE p.public_slug = p_slug
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_proposal_by_slug TO anon, authenticated;
