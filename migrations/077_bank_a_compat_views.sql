-- =============================================================================
-- Migration 077: Views de compatibilidade Banco B → Banco A
--
-- Os hooks do frontend usam dc.from("crm_contacts"), dc.from("ai_events") etc.
-- No Banco A, as tabelas equivalentes têm prefixo "client_":
--   client_crm_contacts, client_ai_events, etc.
--
-- Estas views criam aliases com os nomes do Banco B apontando para as tabelas
-- client_* do Banco A, sem alterar nenhum hook ou componente do frontend.
--
-- RLS: as views herdam RLS das tabelas base (security_invoker = true).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── CRM ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.crm_contacts
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_contacts;

CREATE OR REPLACE VIEW public.crm_products
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_products;

CREATE OR REPLACE VIEW public.crm_pipeline_stages
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_pipeline_stages;

CREATE OR REPLACE VIEW public.crm_deals
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_deals;

CREATE OR REPLACE VIEW public.crm_users
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_users;

-- ── IA ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ai_events
WITH (security_invoker = true) AS
SELECT * FROM public.client_ai_events;

CREATE OR REPLACE VIEW public.ai_notices
WITH (security_invoker = true) AS
SELECT * FROM public.client_ai_notices;

CREATE OR REPLACE VIEW public.ai_promotions
WITH (security_invoker = true) AS
SELECT * FROM public.client_ai_promotions;

CREATE OR REPLACE VIEW public.ai_suggestions
WITH (security_invoker = true) AS
SELECT * FROM public.client_ai_suggestions;

CREATE OR REPLACE VIEW public.ai_reminders
WITH (security_invoker = true) AS
SELECT * FROM public.client_ai_reminders;

CREATE OR REPLACE VIEW public.ai_settings
WITH (security_invoker = true) AS
SELECT * FROM public.client_ai_settings_safe;

-- ── Registra versão ───────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('077_bank_a_compat_views_v1')
ON CONFLICT (version) DO NOTHING;
