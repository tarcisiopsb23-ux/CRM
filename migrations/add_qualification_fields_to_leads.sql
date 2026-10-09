-- ============================================================
-- Migration: Campos de qualificação do formulário no Banco A
-- Adiciona colunas para receber dados do formulário standalone
-- do site (/qualificacao) via webhook n8n.
-- Idempotente: usa IF NOT EXISTS / IF EXISTS em todos os blocos.
-- ============================================================

-- ── Campos de classificação e score ───────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score_qualificacao   INTEGER,
  ADD COLUMN IF NOT EXISTS classificacao_lead   TEXT
    CHECK (classificacao_lead IN (
      'ULTRA_QUENTE', 'QUENTE', 'MORNO', 'FRIO', 'NAO_QUALIFICADO'
    )),
  ADD COLUMN IF NOT EXISTS briefing_ia          TEXT,
  ADD COLUMN IF NOT EXISTS form_respostas       JSONB    DEFAULT '{}';

-- ── Rastreamento de canal (UTMs do formulário) ────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS utm_source    TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium    TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign  TEXT;

-- ── Índices para consultas frequentes ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_classificacao_lead
  ON public.leads (classificacao_lead)
  WHERE classificacao_lead IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_score_qualificacao
  ON public.leads (score_qualificacao DESC)
  WHERE score_qualificacao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_utm_source
  ON public.leads (utm_source)
  WHERE utm_source IS NOT NULL;

-- ── Comentários descritivos ───────────────────────────────────────────────────

COMMENT ON COLUMN public.leads.score_qualificacao IS
  'Score calculado pela engine de qualificação (0–17). Maior = mais qualificado.';

COMMENT ON COLUMN public.leads.classificacao_lead IS
  'Classificação calculada: ULTRA_QUENTE | QUENTE | MORNO | FRIO | NAO_QUALIFICADO';

COMMENT ON COLUMN public.leads.briefing_ia IS
  'Briefing gerado pela IA no n8n para subsidiar o vendedor na primeira conversa.';

COMMENT ON COLUMN public.leads.form_respostas IS
  'JSONB com todas as respostas do formulário de qualificação do site.';

COMMENT ON COLUMN public.leads.utm_source IS
  'Canal de origem do lead (instagram, google, email, whatsapp...).';

COMMENT ON COLUMN public.leads.utm_medium IS
  'Mídia de origem (bio, cpc, campanha...).';

COMMENT ON COLUMN public.leads.utm_campaign IS
  'Nome da campanha de origem.';
