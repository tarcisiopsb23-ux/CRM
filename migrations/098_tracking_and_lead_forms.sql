-- =============================================================================
-- Migration 098: Tracking de Conversões + Formulários de Leads
--
-- Tabelas criadas:
--   1. client_tracking_events      — registro de todos os eventos de pixel/conversão
--   2. client_gtm_settings         — configuração separada GTM / GA4 / Meta Conversions
--   3. client_lead_forms           — definições de formulários (drag-and-drop)
--   4. client_lead_form_submissions — submissões recebidas pelos formulários
--
-- Banco: A (owwaulaenabbdalycusx) — multi-tenant via client_id + organization_id
-- Idempotente: usa CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS etc.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. client_tracking_events
-- ═══════════════════════════════════════════════════════════════════════════
-- Registro persistente de todos os eventos disparados para Meta e Google.
-- Inclui status do envio server-side (Conversions API / Measurement Protocol)
-- e todos os dados de atribuição para auditoria e debugging.

CREATE TABLE IF NOT EXISTS public.client_tracking_events (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identificação do evento
  event_name          TEXT          NOT NULL,  -- 'PageView'|'Lead'|'Contact'|'Schedule'|'Purchase'|'CompleteRegistration'|'ViewContent'
  event_id            TEXT,                    -- UUID gerado no browser para deduplicação (browser vs server)
  source_url          TEXT,                    -- URL onde o evento ocorreu

  -- UTMs / atribuição de campanha
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  utm_content         TEXT,
  utm_term            TEXT,

  -- Parâmetros de clique das plataformas
  fbclid              TEXT,                    -- Facebook Click ID (capturado da URL)
  gclid               TEXT,                    -- Google Click ID (capturado da URL)

  -- Dados do usuário (hashed SHA-256 — obrigatório pela Meta Conversions API)
  email_hash          TEXT,                    -- SHA-256(lowercase(trim(email)))
  phone_hash          TEXT,                    -- SHA-256(e164_format(phone))
  first_name_hash     TEXT,                    -- SHA-256(lowercase(first_name))
  last_name_hash      TEXT,                    -- SHA-256(lowercase(last_name))

  -- Cookies do pixel Meta (lidos no browser)
  fbc                 TEXT,                    -- _fbc cookie
  fbp                 TEXT,                    -- _fbp cookie

  -- Contexto do cliente
  client_ip           TEXT,
  client_user_agent   TEXT,
  device              TEXT,                    -- 'mobile'|'desktop'|'tablet'
  browser             TEXT,
  os                  TEXT,
  city                TEXT,                    -- resolução geoIP

  -- Status de envio para Meta Conversions API
  meta_status         TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (meta_status IN ('pending','sent','error','skipped')),
  meta_response       JSONB,                   -- resposta completa da API para debugging
  meta_event_id       TEXT,                    -- event_id devolvido pela Meta

  -- Status de envio para Google Measurement Protocol
  google_status       TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (google_status IN ('pending','sent','error','skipped')),
  google_response     JSONB,

  -- Metadados adicionais
  metadata            JSONB         DEFAULT '{}',

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_client_id
  ON public.client_tracking_events(client_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_client_date
  ON public.client_tracking_events(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_name
  ON public.client_tracking_events(client_id, event_name);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_id
  ON public.client_tracking_events(event_id)
  WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_events_org_date
  ON public.client_tracking_events(organization_id, created_at DESC);

ALTER TABLE public.client_tracking_events ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados do tenant: acesso completo
DROP POLICY IF EXISTS "tracking_events_authenticated" ON public.client_tracking_events;
CREATE POLICY "tracking_events_authenticated"
  ON public.client_tracking_events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Anon: sem acesso direto (Edge Function usa service_role)
DROP POLICY IF EXISTS "tracking_events_no_anon" ON public.client_tracking_events;
CREATE POLICY "tracking_events_no_anon"
  ON public.client_tracking_events FOR ALL TO anon
  USING (false);

COMMENT ON TABLE public.client_tracking_events IS
  'Eventos de pixel/conversão disparados para Meta e Google. Um registro por evento, com status de envio server-side.';
COMMENT ON COLUMN public.client_tracking_events.event_id IS
  'UUID gerado no browser. Enviado tanto via browser-side (fbq/gtag) quanto via server-side para deduplicação.';
COMMENT ON COLUMN public.client_tracking_events.email_hash IS
  'SHA-256 do e-mail normalizado. Obrigatório pela Meta Conversions API para match de audiência.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. client_gtm_settings
-- ═══════════════════════════════════════════════════════════════════════════
-- Configurações de GTM e GA4 separadas de client_ai_settings.
-- Uma linha por cliente (UNIQUE client_id).
-- meta_pixel_id e google_tag_id continuam em client_ai_settings por compatibilidade.
-- Este registro guarda GTM container, GA4 measurement_id, api_secret server-side.

CREATE TABLE IF NOT EXISTS public.client_gtm_settings (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID          NOT NULL UNIQUE
                              REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id             UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Google Tag Manager (GTM-XXXXXXX)
  gtm_container_id            TEXT,

  -- Google Analytics 4 — ID de medição (G-XXXXXXXXXX)
  ga4_measurement_id          TEXT,

  -- GA4 API Secret para Measurement Protocol server-side (NUNCA retornado ao frontend)
  ga4_api_secret              TEXT,
  ga4_api_secret_set          BOOLEAN       NOT NULL DEFAULT false,

  -- Meta Conversions API — token de acesso override
  -- NULL = usa o token de oauth_tokens (provider='meta') do tenant
  -- Preenchido = usa este token específico para Conversions API
  meta_capi_token             TEXT,
  meta_capi_token_set         BOOLEAN       NOT NULL DEFAULT false,

  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gtm_settings_client_id
  ON public.client_gtm_settings(client_id);

ALTER TABLE public.client_gtm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gtm_settings_authenticated" ON public.client_gtm_settings;
CREATE POLICY "gtm_settings_authenticated"
  ON public.client_gtm_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gtm_settings_no_anon" ON public.client_gtm_settings;
CREATE POLICY "gtm_settings_no_anon"
  ON public.client_gtm_settings FOR ALL TO anon
  USING (false);

-- View segura — nunca expõe ga4_api_secret nem meta_capi_token
CREATE OR REPLACE VIEW public.client_gtm_settings_safe
WITH (security_invoker = true) AS
  SELECT
    id, client_id, organization_id,
    gtm_container_id,
    ga4_measurement_id,
    ga4_api_secret_set,
    meta_capi_token_set,
    created_at, updated_at
  FROM public.client_gtm_settings;

-- Trigger updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gtm_settings_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_gtm_settings_updated_at
      BEFORE UPDATE ON public.client_gtm_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

COMMENT ON TABLE public.client_gtm_settings IS
  'Configurações de rastreamento Google (GTM + GA4) e override do token Meta Conversions API. ga4_api_secret e meta_capi_token NUNCA retornados ao frontend.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. client_lead_forms
-- ═══════════════════════════════════════════════════════════════════════════
-- Formulários de captura de leads configuráveis com drag-and-drop.
-- Cada formulário tem um slug único por cliente para a URL pública
-- /form/:client_slug/:form_slug

CREATE TABLE IF NOT EXISTS public.client_lead_forms (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identificação
  name                TEXT          NOT NULL,            -- nome interno (ex: "Formulário Principal")
  slug                TEXT          NOT NULL,            -- URL-friendly, único por cliente
  active              BOOLEAN       NOT NULL DEFAULT true,

  -- Aparência
  title               TEXT          NOT NULL DEFAULT 'Fale conosco',
  description         TEXT,
  primary_color       TEXT          NOT NULL DEFAULT '#6366f1',
  logo_url            TEXT,
  background_color    TEXT          NOT NULL DEFAULT '#0F172A',
  button_text         TEXT          NOT NULL DEFAULT 'Enviar',

  -- Campos (definição drag-and-drop)
  -- Array de objetos: { id, type, label, placeholder, required, options, logic }
  -- type: 'text'|'email'|'phone'|'textarea'|'select'|'radio'|'checkbox'|
  --       'date'|'number'|'divider'|'html'|'consent'
  -- logic: { show_if: { field_id, operator, value } } — condicional
  fields              JSONB         NOT NULL DEFAULT '[]',

  -- Comportamento pós-envio
  success_message     TEXT          NOT NULL DEFAULT 'Obrigado! Entraremos em contato em breve.',
  redirect_url        TEXT,                              -- se preenchido, redireciona após envio

  -- Integração com pipeline
  pipeline_id         UUID          REFERENCES public.client_crm_pipelines(id) ON DELETE SET NULL,
  pipeline_stage_id   UUID          REFERENCES public.client_crm_pipeline_stages(id) ON DELETE SET NULL,
  auto_create_deal    BOOLEAN       NOT NULL DEFAULT false,

  -- Evento de tracking disparado ao enviar
  trigger_event       TEXT          NOT NULL DEFAULT 'Lead'
                      CHECK (trigger_event IN ('Lead','CompleteRegistration','Contact','Schedule')),

  -- Contadores (denormalizados para evitar COUNT query)
  submission_count    INTEGER       NOT NULL DEFAULT 0,

  -- Metadados
  metadata            JSONB         DEFAULT '{}',

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (client_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lead_forms_client_id
  ON public.client_lead_forms(client_id);
CREATE INDEX IF NOT EXISTS idx_lead_forms_client_slug
  ON public.client_lead_forms(client_id, slug);
CREATE INDEX IF NOT EXISTS idx_lead_forms_active
  ON public.client_lead_forms(client_id, active);

ALTER TABLE public.client_lead_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_forms_authenticated" ON public.client_lead_forms;
CREATE POLICY "lead_forms_authenticated"
  ON public.client_lead_forms FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Anon pode LER formulários ativos (necessário para a página pública /form/:slug)
DROP POLICY IF EXISTS "lead_forms_anon_read" ON public.client_lead_forms;
CREATE POLICY "lead_forms_anon_read"
  ON public.client_lead_forms FOR SELECT TO anon
  USING (active = true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lead_forms_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_lead_forms_updated_at
      BEFORE UPDATE ON public.client_lead_forms
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

COMMENT ON TABLE public.client_lead_forms IS
  'Formulários de captura de leads configuráveis. Página pública: /form/:client_slug/:form_slug';
COMMENT ON COLUMN public.client_lead_forms.fields IS
  'Array JSON de campos do formulário. type: text|email|phone|textarea|select|radio|checkbox|date|number|divider|html|consent. Suporta lógica condicional via logic.show_if.';
COMMENT ON COLUMN public.client_lead_forms.slug IS
  'Identificador URL-friendly único por cliente. Usado em /form/:client_slug/:form_slug';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. client_lead_form_submissions
-- ═══════════════════════════════════════════════════════════════════════════
-- Registro de cada submissão de formulário recebida.
-- Vinculada ao contato criado e ao evento de tracking gerado.

CREATE TABLE IF NOT EXISTS public.client_lead_form_submissions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id     UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Relacionamentos
  form_id             UUID          NOT NULL REFERENCES public.client_lead_forms(id) ON DELETE CASCADE,
  contact_id          UUID          REFERENCES public.client_crm_contacts(id) ON DELETE SET NULL,
  deal_id             UUID          REFERENCES public.client_crm_deals(id) ON DELETE SET NULL,
  tracking_event_id   UUID          REFERENCES public.client_tracking_events(id) ON DELETE SET NULL,

  -- Dados submetidos (campos do formulário)
  data                JSONB         NOT NULL DEFAULT '{}',

  -- Atribuição de marketing
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  utm_content         TEXT,
  utm_term            TEXT,
  fbclid              TEXT,
  gclid               TEXT,
  landing_page        TEXT,

  -- Contexto técnico
  ip_address          TEXT,
  user_agent          TEXT,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_client_id
  ON public.client_lead_form_submissions(client_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id
  ON public.client_lead_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_contact_id
  ON public.client_lead_form_submissions(contact_id)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at
  ON public.client_lead_form_submissions(client_id, created_at DESC);

ALTER TABLE public.client_lead_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "form_submissions_authenticated" ON public.client_lead_form_submissions;
CREATE POLICY "form_submissions_authenticated"
  ON public.client_lead_form_submissions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "form_submissions_no_anon" ON public.client_lead_form_submissions;
CREATE POLICY "form_submissions_no_anon"
  ON public.client_lead_form_submissions FOR ALL TO anon
  USING (false);

COMMENT ON TABLE public.client_lead_form_submissions IS
  'Submissões de formulários de leads. Cada submissão gera um contato, um tracking_event e opcionalmente um deal.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RPC: save_gtm_settings — salva configurações de GTM/GA4 com segurança
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_gtm_settings(
  p_client_id           UUID,
  p_organization_id     UUID,
  p_gtm_container_id    TEXT DEFAULT NULL,
  p_ga4_measurement_id  TEXT DEFAULT NULL,
  p_ga4_api_secret      TEXT DEFAULT NULL,
  p_meta_capi_token     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM public.client_gtm_settings
  WHERE client_id = p_client_id;

  IF v_id IS NOT NULL THEN
    UPDATE public.client_gtm_settings SET
      gtm_container_id   = COALESCE(p_gtm_container_id,   gtm_container_id),
      ga4_measurement_id = COALESCE(p_ga4_measurement_id, ga4_measurement_id),
      ga4_api_secret     = CASE WHEN p_ga4_api_secret IS NOT NULL AND p_ga4_api_secret <> ''
                                THEN p_ga4_api_secret
                                ELSE ga4_api_secret END,
      ga4_api_secret_set = CASE WHEN p_ga4_api_secret IS NOT NULL AND p_ga4_api_secret <> ''
                                THEN true
                                ELSE ga4_api_secret_set END,
      meta_capi_token    = CASE WHEN p_meta_capi_token IS NOT NULL AND p_meta_capi_token <> ''
                                THEN p_meta_capi_token
                                ELSE meta_capi_token END,
      meta_capi_token_set = CASE WHEN p_meta_capi_token IS NOT NULL AND p_meta_capi_token <> ''
                                THEN true
                                ELSE meta_capi_token_set END,
      updated_at         = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.client_gtm_settings (
      client_id, organization_id,
      gtm_container_id, ga4_measurement_id,
      ga4_api_secret, ga4_api_secret_set,
      meta_capi_token, meta_capi_token_set
    ) VALUES (
      p_client_id, p_organization_id,
      NULLIF(p_gtm_container_id, ''),
      NULLIF(p_ga4_measurement_id, ''),
      NULLIF(p_ga4_api_secret, ''),
      (p_ga4_api_secret IS NOT NULL AND p_ga4_api_secret <> ''),
      NULLIF(p_meta_capi_token, ''),
      (p_meta_capi_token IS NOT NULL AND p_meta_capi_token <> '')
    ) RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RPC: get_form_by_slug — resolve formulário público por slugs
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_form_by_slug(
  p_client_slug TEXT,
  p_form_slug   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'form_id',       f.id,
    'client_id',     f.client_id,
    'organization_id', f.organization_id,
    'name',          f.name,
    'title',         f.title,
    'description',   f.description,
    'primary_color', f.primary_color,
    'logo_url',      COALESCE(f.logo_url, s.logo_url),
    'background_color', f.background_color,
    'button_text',   f.button_text,
    'fields',        f.fields,
    'success_message', f.success_message,
    'redirect_url',  f.redirect_url,
    'trigger_event', f.trigger_event,
    'client_name',   c.name,
    'client_slug',   c.dashboard_slug
  )
  INTO v_result
  FROM public.client_lead_forms f
  JOIN public.clients c ON c.id = f.client_id
  LEFT JOIN public.client_ai_settings s ON s.client_id = f.client_id
  WHERE c.dashboard_slug = p_client_slug
    AND f.slug            = p_form_slug
    AND f.active          = true;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'Formulário não encontrado');
  END IF;

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Registro da versão
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.schema_migrations (version)
VALUES ('tracking_and_lead_forms_v1')
ON CONFLICT (version) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. RPC: increment_form_submission_count — contador atômico de submissões
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.increment_form_submission_count(p_form_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_lead_forms
  SET submission_count = submission_count + 1,
      updated_at       = now()
  WHERE id = p_form_id;
END;
$$;
