-- =============================================================================
-- Migration 066: Campos para receber leads da landing page GMN
--                (Google Meu Negócio — /google-meu-negocio)
--
-- Novos campos:
--   servico              TEXT       — serviço de interesse (ex: "Google Meu Negócio")
--   detalhes_funil       JSONB      — dados completos do funil GMN
--   contato_iniciado_em  TIMESTAMPTZ — quando o cliente clicou em WhatsApp por conta própria
--
-- Idempotente: pode ser executado múltiplas vezes sem erro.
-- =============================================================================

-- ── Adicionar colunas ─────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS servico             TEXT,
  ADD COLUMN IF NOT EXISTS detalhes_funil      JSONB        DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contato_iniciado_em TIMESTAMPTZ;

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_servico
  ON public.leads (servico)
  WHERE servico IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_detalhes_funil
  ON public.leads USING GIN (detalhes_funil)
  WHERE detalhes_funil <> '{}';

CREATE INDEX IF NOT EXISTS idx_leads_contato_iniciado_em
  ON public.leads (contato_iniciado_em)
  WHERE contato_iniciado_em IS NOT NULL;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.leads.servico IS
  'Serviço de interesse do lead (ex: "Google Meu Negócio"). '
  'Populado pelo webhook n8n ao receber lead de landing pages de serviço específico.';

COMMENT ON COLUMN public.leads.detalhes_funil IS
  'JSONB com dados completos do funil GMN: tipo_lead, dor, aquisicao, prazo, '
  'experiencia, texto_livre, cta_origem, agendamento_modalidade, '
  'agendamento_dias_semana, agendamento_data_solicitacao.';

COMMENT ON COLUMN public.leads.contato_iniciado_em IS
  'Timestamp em que o cliente clicou no botão WhatsApp por conta própria '
  '(após agendar ou direto do resultado). Quando preenchido, etapa_kanban '
  'é alterada para "cliente_contatou" — sinal para a equipe não duplicar atendimento.';

-- ── Versão ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version)
VALUES ('066_leads_gmn_fields')
ON CONFLICT (version) DO NOTHING;
