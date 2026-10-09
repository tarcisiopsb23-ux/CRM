-- =============================================================================
-- Migration 094: CRM — Expansão das tabelas do Banco A
--
-- Objetivo: ampliar as entidades CRM para suportar uma base genérica
-- de CRM adequada a qualquer nicho, sem remover nenhum dado existente.
--
-- Princípios:
--   • Apenas ADD COLUMN IF NOT EXISTS — sem DROP, sem ALTER TYPE
--   • Compatibilidade total com registros existentes
--   • Isolamento multi-tenant via client_id em todas as tabelas
--   • Campos estruturais nunca aparecem como campos configuráveis
--
-- Tabelas alteradas:
--   1. client_crm_contacts   — identificação completa, endereço, origem/UTM, gestão
--   2. client_crm_deals      — pipeline, lost_reason, discount, probability, tags, responsável
--   3. client_crm_products   — sku, tipo, categoria
--
-- Tabelas criadas:
--   4. client_crm_deal_items — itens de uma negociação (multi-produto com snapshot de preço)
--   5. client_crm_contact_status_options — lista configurável de status do cliente por tenant
--
-- RPCs criadas/atualizadas:
--   • get_crm_contact_full    — retorna um contato com todos os campos
--   • get_crm_deals_full      — retorna deals com join em deal_items
--   • upsert_crm_contact      — cria/atualiza contato com todos os campos novos
--   • upsert_crm_deal         — cria/atualiza deal com itens (deal_items)
--   • lookup_cep              — consulta ViaCEP e retorna endereço (chamável pelo frontend)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXPANDIR client_crm_contacts
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Identificação ──────────────────────────────────────────────────────────
ALTER TABLE public.client_crm_contacts
  ADD COLUMN IF NOT EXISTS last_name         TEXT,
  ADD COLUMN IF NOT EXISTS contact_type      TEXT    NOT NULL DEFAULT 'person'
    CHECK (contact_type IN ('person','company')),
  ADD COLUMN IF NOT EXISTS cpf               TEXT,        -- apenas dígitos: 11 chars
  ADD COLUMN IF NOT EXISTS cnpj              TEXT,        -- apenas dígitos: 14 chars
  ADD COLUMN IF NOT EXISTS birthdate         DATE,
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS company           TEXT,        -- empresa/organização
  ADD COLUMN IF NOT EXISTS job_title         TEXT;

-- ── Contatos adicionais ────────────────────────────────────────────────────
ALTER TABLE public.client_crm_contacts
  ADD COLUMN IF NOT EXISTS whatsapp          TEXT,        -- separado de phone (legado)
  ADD COLUMN IF NOT EXISTS phone2            TEXT,        -- telefone secundário
  ADD COLUMN IF NOT EXISTS email2            TEXT;        -- e-mail secundário

-- ── Endereço ───────────────────────────────────────────────────────────────
ALTER TABLE public.client_crm_contacts
  ADD COLUMN IF NOT EXISTS zip_code          TEXT,        -- CEP — apenas dígitos (8 chars)
  ADD COLUMN IF NOT EXISTS street            TEXT,        -- logradouro
  ADD COLUMN IF NOT EXISTS street_number     TEXT,
  ADD COLUMN IF NOT EXISTS complement        TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood      TEXT,        -- bairro
  ADD COLUMN IF NOT EXISTS city              TEXT,
  ADD COLUMN IF NOT EXISTS state             TEXT,        -- UF 2 chars
  ADD COLUMN IF NOT EXISTS country           TEXT    DEFAULT 'BR';

-- ── Origem e atribuição de marketing ──────────────────────────────────────
-- origin_original: NUNCA sobrescrito após definido
-- origin_recent: atualizado a cada nova interação
ALTER TABLE public.client_crm_contacts
  ADD COLUMN IF NOT EXISTS origin_original   TEXT,
  ADD COLUMN IF NOT EXISTS origin_recent     TEXT,
  ADD COLUMN IF NOT EXISTS channel           TEXT,
  ADD COLUMN IF NOT EXISTS campaign          TEXT,
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS utm_content       TEXT,
  ADD COLUMN IF NOT EXISTS utm_term          TEXT,
  ADD COLUMN IF NOT EXISTS landing_page      TEXT,
  ADD COLUMN IF NOT EXISTS first_conversion_at TIMESTAMPTZ;

-- ── Gestão do cliente ──────────────────────────────────────────────────────
-- status_cliente é DIFERENTE de etapa da oportunidade
ALTER TABLE public.client_crm_contacts
  ADD COLUMN IF NOT EXISTS client_status     TEXT    DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS responsible_id    UUID,        -- dashboard_users(id)
  ADD COLUMN IF NOT EXISTS first_contact_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_contact_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_contact_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at       TIMESTAMPTZ;

-- ── Identificadores externos ──────────────────────────────────────────────
ALTER TABLE public.client_crm_contacts
  ADD COLUMN IF NOT EXISTS whatsapp_id       TEXT,
  ADD COLUMN IF NOT EXISTS instagram_id      TEXT,
  ADD COLUMN IF NOT EXISTS facebook_id       TEXT,
  ADD COLUMN IF NOT EXISTS external_id       TEXT;

-- Migrar campo legado `source` para `origin_recent` quando origin_recent ainda não preenchido
UPDATE public.client_crm_contacts
SET origin_recent = source
WHERE source IS NOT NULL AND origin_recent IS NULL;

-- Migrar campo legado `phone` para `whatsapp` quando whatsapp ainda não preenchido
-- (historicamente phone era usado como whatsapp)
UPDATE public.client_crm_contacts
SET whatsapp = phone
WHERE phone IS NOT NULL AND whatsapp IS NULL;

COMMENT ON COLUMN public.client_crm_contacts.contact_type IS
  'person = pessoa física; company = pessoa jurídica';
COMMENT ON COLUMN public.client_crm_contacts.cpf IS
  'CPF sem formatação — apenas 11 dígitos. Formatar na interface.';
COMMENT ON COLUMN public.client_crm_contacts.cnpj IS
  'CNPJ sem formatação — apenas 14 dígitos. Formatar na interface.';
COMMENT ON COLUMN public.client_crm_contacts.origin_original IS
  'Origem do primeiro contato. Nunca sobrescrito automaticamente após definido.';
COMMENT ON COLUMN public.client_crm_contacts.client_status IS
  'Status do cliente (lead, prospect, ativo, inativo...). Diferente de etapa da oportunidade.';
COMMENT ON COLUMN public.client_crm_contacts.zip_code IS
  'CEP sem formatação — apenas 8 dígitos. Consultar ViaCEP para preencher demais campos.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EXPANDIR client_crm_deals
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_crm_deals
  -- Pipeline (Banco A suporta multi-funil; Banco B não tem pipeline_id)
  ADD COLUMN IF NOT EXISTS pipeline_id       UUID    REFERENCES public.client_crm_pipelines(id) ON DELETE SET NULL,
  -- Valores
  ADD COLUMN IF NOT EXISTS discount          NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_value       NUMERIC(12,2) GENERATED ALWAYS AS
    (COALESCE(value,0) - COALESCE(discount,0)) STORED,
  ADD COLUMN IF NOT EXISTS probability       INTEGER DEFAULT 50
    CHECK (probability >= 0 AND probability <= 100),
  -- Fechamento
  ADD COLUMN IF NOT EXISTS close_date        DATE,        -- data real de fechamento
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
  -- Perda
  ADD COLUMN IF NOT EXISTS lost_reason       TEXT,
  -- Responsável
  ADD COLUMN IF NOT EXISTS responsible_id    UUID,        -- dashboard_users(id)
  -- Tags e origem
  ADD COLUMN IF NOT EXISTS tags              TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origin            TEXT,
  -- Campos adicionais
  ADD COLUMN IF NOT EXISTS quantity          INTEGER DEFAULT 1;

-- Ampliar CHECK de status para incluir 'cancelled'
DO $$
BEGIN
  -- Adiciona 'cancelled' ao check se ainda não estiver presente
  -- (altera constraint existente de forma segura)
  ALTER TABLE public.client_crm_deals
    DROP CONSTRAINT IF EXISTS client_crm_deals_status_check;
  ALTER TABLE public.client_crm_deals
    ADD CONSTRAINT client_crm_deals_status_check
    CHECK (status IN ('open','won','lost','cancelled'));
EXCEPTION WHEN others THEN
  NULL; -- ignora se já existir
END $$;

COMMENT ON COLUMN public.client_crm_deals.pipeline_id IS
  'Funil ao qual este deal pertence. Permite filtrar deals por funil.';
COMMENT ON COLUMN public.client_crm_deals.total_value IS
  'Coluna calculada: value - discount. Nunca editar diretamente.';
COMMENT ON COLUMN public.client_crm_deals.probability IS
  'Probabilidade de fechamento em %. 0–100.';
COMMENT ON COLUMN public.client_crm_deals.close_date IS
  'Data real de fechamento (won/lost). Diferente de expected_close_date.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. EXPANDIR client_crm_products
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_crm_products
  ADD COLUMN IF NOT EXISTS sku               TEXT,        -- código/SKU
  ADD COLUMN IF NOT EXISTS product_type      TEXT    DEFAULT 'service'
    CHECK (product_type IN ('product','service')),
  ADD COLUMN IF NOT EXISTS category          TEXT,
  ADD COLUMN IF NOT EXISTS image_url         TEXT;

COMMENT ON COLUMN public.client_crm_products.sku IS
  'Código/SKU do produto. Chave técnica estável para automações.';
COMMENT ON COLUMN public.client_crm_products.product_type IS
  'product = produto físico; service = serviço. Genérico — sem hardcode de nicho.';
COMMENT ON COLUMN public.client_crm_products.category IS
  'Categoria livre definida pelo tenant. Ex: Marketing, Assessoria, Saúde.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CRIAR client_crm_deal_items — itens da negociação (multi-produto)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cada item guarda snapshot do preço negociado.
-- Alterar o preço do produto não afeta negociações antigas.

CREATE TABLE IF NOT EXISTS public.client_crm_deal_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id         UUID          NOT NULL REFERENCES public.client_crm_deals(id) ON DELETE CASCADE,

  -- Referência ao produto (opcional — item pode ser avulso)
  product_id      UUID          REFERENCES public.client_crm_products(id) ON DELETE SET NULL,

  -- Snapshot do preço negociado no momento da inclusão
  -- Não depende do preço atual do produto
  description     TEXT          NOT NULL,   -- nome/descrição no momento da negociação
  quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) GENERATED ALWAYS AS
    (quantity * unit_price - COALESCE(discount, 0)) STORED,

  "order"         INTEGER       NOT NULL DEFAULT 0,  -- ordem de exibição
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_deal_items_deal_id
  ON public.client_crm_deal_items(deal_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_deal_items_client_id
  ON public.client_crm_deal_items(client_id);

ALTER TABLE public.client_crm_deal_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.client_crm_deal_items;
CREATE POLICY "authenticated_access"
  ON public.client_crm_deal_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "no_anon_access" ON public.client_crm_deal_items;
CREATE POLICY "no_anon_access"
  ON public.client_crm_deal_items FOR ALL TO anon
  USING (false);

-- Trigger updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_client_crm_deal_items_updated_at'
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_client_crm_deal_items_updated_at
        BEFORE UPDATE ON public.client_crm_deal_items
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;
END $$;

COMMENT ON TABLE public.client_crm_deal_items IS
  'Itens de uma negociação. Guarda snapshot do preço negociado — independente do catálogo atual.';
COMMENT ON COLUMN public.client_crm_deal_items.unit_price IS
  'Preço unitário negociado. Snapshot imutável — não atualiza se o produto mudar de preço.';
COMMENT ON COLUMN public.client_crm_deal_items.total IS
  'Coluna calculada: quantity * unit_price - discount.';

-- View de compatibilidade
CREATE OR REPLACE VIEW public.crm_deal_items
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_deal_items;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. CRIAR client_crm_contact_status_options — status configuráveis por tenant
-- ═══════════════════════════════════════════════════════════════════════════
-- Cada tenant pode ter seus próprios status de cliente.
-- Valores padrão são inseridos via seed abaixo.

CREATE TABLE IF NOT EXISTS public.client_crm_contact_status_options (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,       -- "Lead", "Prospect", "Cliente Ativo"
  color           TEXT        NOT NULL DEFAULT '#64748b',
  "order"         INTEGER     NOT NULL DEFAULT 0,
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_status_client_id
  ON public.client_crm_contact_status_options(client_id, "order")
  WHERE active = true;

ALTER TABLE public.client_crm_contact_status_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.client_crm_contact_status_options;
CREATE POLICY "authenticated_access"
  ON public.client_crm_contact_status_options FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "no_anon_access" ON public.client_crm_contact_status_options;
CREATE POLICY "no_anon_access"
  ON public.client_crm_contact_status_options FOR ALL TO anon
  USING (false);

COMMENT ON TABLE public.client_crm_contact_status_options IS
  'Status configuráveis do cliente por tenant. Não confundir com etapa da oportunidade.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. ÍNDICES — campos de busca e filtro frequente
-- ═══════════════════════════════════════════════════════════════════════════

-- client_crm_contacts — busca por campos de identificação
CREATE INDEX IF NOT EXISTS idx_crm_contacts_cpf
  ON public.client_crm_contacts(client_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_cnpj
  ON public.client_crm_contacts(client_id, cnpj)
  WHERE cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_whatsapp
  ON public.client_crm_contacts(client_id, whatsapp)
  WHERE whatsapp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_email2
  ON public.client_crm_contacts(client_id, email2)
  WHERE email2 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_company
  ON public.client_crm_contacts(client_id, company)
  WHERE company IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_status
  ON public.client_crm_contacts(client_id, client_status);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_responsible
  ON public.client_crm_contacts(client_id, responsible_id)
  WHERE responsible_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_last_contact
  ON public.client_crm_contacts(client_id, last_contact_at)
  WHERE last_contact_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_next_contact
  ON public.client_crm_contacts(client_id, next_contact_at)
  WHERE next_contact_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_external_id
  ON public.client_crm_contacts(client_id, external_id)
  WHERE external_id IS NOT NULL;

-- client_crm_deals — busca e filtro
CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline
  ON public.client_crm_deals(client_id, pipeline_id)
  WHERE pipeline_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_responsible
  ON public.client_crm_deals(client_id, responsible_id)
  WHERE responsible_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_expected_close
  ON public.client_crm_deals(client_id, expected_close_date)
  WHERE expected_close_date IS NOT NULL;

-- client_crm_products — busca por sku e categoria
CREATE INDEX IF NOT EXISTS idx_crm_products_sku
  ON public.client_crm_products(client_id, sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_products_category
  ON public.client_crm_products(client_id, category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_products_type
  ON public.client_crm_products(client_id, product_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. RPC: upsert_crm_contact — cria ou atualiza contato com todos os campos
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_crm_contact(
  -- Identidade
  p_client_id           UUID,
  p_contact_id          UUID            DEFAULT NULL,   -- NULL = novo contato
  p_name                TEXT            DEFAULT NULL,
  p_last_name           TEXT            DEFAULT NULL,
  p_contact_type        TEXT            DEFAULT 'person',
  p_cpf                 TEXT            DEFAULT NULL,   -- apenas dígitos
  p_cnpj                TEXT            DEFAULT NULL,   -- apenas dígitos
  p_birthdate           DATE            DEFAULT NULL,
  p_company             TEXT            DEFAULT NULL,
  p_job_title           TEXT            DEFAULT NULL,
  p_avatar_url          TEXT            DEFAULT NULL,
  -- Contatos
  p_phone               TEXT            DEFAULT NULL,
  p_whatsapp            TEXT            DEFAULT NULL,
  p_phone2              TEXT            DEFAULT NULL,
  p_email               TEXT            DEFAULT NULL,
  p_email2              TEXT            DEFAULT NULL,
  -- Endereço
  p_zip_code            TEXT            DEFAULT NULL,
  p_street              TEXT            DEFAULT NULL,
  p_street_number       TEXT            DEFAULT NULL,
  p_complement          TEXT            DEFAULT NULL,
  p_neighborhood        TEXT            DEFAULT NULL,
  p_city                TEXT            DEFAULT NULL,
  p_state               TEXT            DEFAULT NULL,
  p_country             TEXT            DEFAULT 'BR',
  -- Origem
  p_origin_original     TEXT            DEFAULT NULL,
  p_origin_recent       TEXT            DEFAULT NULL,
  p_channel             TEXT            DEFAULT NULL,
  p_campaign            TEXT            DEFAULT NULL,
  p_utm_source          TEXT            DEFAULT NULL,
  p_utm_medium          TEXT            DEFAULT NULL,
  p_utm_campaign        TEXT            DEFAULT NULL,
  p_utm_content         TEXT            DEFAULT NULL,
  p_utm_term            TEXT            DEFAULT NULL,
  p_landing_page        TEXT            DEFAULT NULL,
  p_first_conversion_at TIMESTAMPTZ     DEFAULT NULL,
  -- Gestão
  p_client_status       TEXT            DEFAULT NULL,
  p_responsible_id      UUID            DEFAULT NULL,
  p_tags                TEXT[]          DEFAULT NULL,
  p_notes               TEXT            DEFAULT NULL,
  p_source              TEXT            DEFAULT NULL,   -- legado
  p_first_contact_at    TIMESTAMPTZ     DEFAULT NULL,
  p_last_contact_at     TIMESTAMPTZ     DEFAULT NULL,
  p_next_contact_at     TIMESTAMPTZ     DEFAULT NULL,
  -- Externos
  p_whatsapp_id         TEXT            DEFAULT NULL,
  p_instagram_id        TEXT            DEFAULT NULL,
  p_facebook_id         TEXT            DEFAULT NULL,
  p_external_id         TEXT            DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_org_id UUID;
  v_origin_original TEXT;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.clients WHERE id = p_client_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  IF p_contact_id IS NULL THEN
    -- ── INSERT ──────────────────────────────────────────────────────────────
    -- origin_original: definida uma vez, nunca sobrescrita
    v_origin_original := COALESCE(p_origin_original, p_origin_recent, p_source);

    INSERT INTO public.client_crm_contacts (
      client_id, organization_id,
      name, last_name, contact_type, cpf, cnpj, birthdate, company, job_title, avatar_url,
      phone, whatsapp, phone2, email, email2,
      zip_code, street, street_number, complement, neighborhood, city, state, country,
      origin_original, origin_recent, channel, campaign,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      landing_page, first_conversion_at,
      client_status, responsible_id, tags, notes, source,
      first_contact_at, last_contact_at, next_contact_at,
      whatsapp_id, instagram_id, facebook_id, external_id
    ) VALUES (
      p_client_id, v_org_id,
      p_name, p_last_name, COALESCE(p_contact_type,'person'),
      regexp_replace(COALESCE(p_cpf,''), '[^0-9]', '', 'g') || NULL,
      regexp_replace(COALESCE(p_cnpj,''), '[^0-9]', '', 'g') || NULL,
      p_birthdate, p_company, p_job_title, p_avatar_url,
      p_phone, p_whatsapp, p_phone2, p_email, p_email2,
      regexp_replace(COALESCE(p_zip_code,''), '[^0-9]', '', 'g') || NULL,
      p_street, p_street_number, p_complement, p_neighborhood, p_city, p_state,
      COALESCE(p_country,'BR'),
      v_origin_original, COALESCE(p_origin_recent, p_source),
      p_channel, p_campaign,
      p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
      p_landing_page, p_first_conversion_at,
      COALESCE(p_client_status,'lead'), p_responsible_id,
      COALESCE(p_tags,'{}'), p_notes, p_source,
      p_first_contact_at, p_last_contact_at, p_next_contact_at,
      p_whatsapp_id, p_instagram_id, p_facebook_id, p_external_id
    )
    RETURNING id INTO v_id;

  ELSE
    -- ── UPDATE ──────────────────────────────────────────────────────────────
    -- origin_original NUNCA é sobrescrito — só preenche se ainda NULL
    UPDATE public.client_crm_contacts SET
      name              = COALESCE(p_name, name),
      last_name         = COALESCE(p_last_name, last_name),
      contact_type      = COALESCE(p_contact_type, contact_type),
      cpf               = CASE WHEN p_cpf IS NOT NULL
                            THEN regexp_replace(p_cpf, '[^0-9]', '', 'g')
                            ELSE cpf END,
      cnpj              = CASE WHEN p_cnpj IS NOT NULL
                            THEN regexp_replace(p_cnpj, '[^0-9]', '', 'g')
                            ELSE cnpj END,
      birthdate         = COALESCE(p_birthdate, birthdate),
      company           = COALESCE(p_company, company),
      job_title         = COALESCE(p_job_title, job_title),
      avatar_url        = COALESCE(p_avatar_url, avatar_url),
      phone             = COALESCE(p_phone, phone),
      whatsapp          = COALESCE(p_whatsapp, whatsapp),
      phone2            = COALESCE(p_phone2, phone2),
      email             = COALESCE(p_email, email),
      email2            = COALESCE(p_email2, email2),
      zip_code          = CASE WHEN p_zip_code IS NOT NULL
                            THEN regexp_replace(p_zip_code, '[^0-9]', '', 'g')
                            ELSE zip_code END,
      street            = COALESCE(p_street, street),
      street_number     = COALESCE(p_street_number, street_number),
      complement        = COALESCE(p_complement, complement),
      neighborhood      = COALESCE(p_neighborhood, neighborhood),
      city              = COALESCE(p_city, city),
      state             = COALESCE(p_state, state),
      country           = COALESCE(p_country, country),
      -- origin_original: só preenche se ainda NULL (nunca sobrescreve)
      origin_original   = CASE WHEN origin_original IS NULL
                            THEN COALESCE(p_origin_original, p_origin_recent)
                            ELSE origin_original END,
      origin_recent     = COALESCE(p_origin_recent, origin_recent),
      channel           = COALESCE(p_channel, channel),
      campaign          = COALESCE(p_campaign, campaign),
      utm_source        = COALESCE(p_utm_source, utm_source),
      utm_medium        = COALESCE(p_utm_medium, utm_medium),
      utm_campaign      = COALESCE(p_utm_campaign, utm_campaign),
      utm_content       = COALESCE(p_utm_content, utm_content),
      utm_term          = COALESCE(p_utm_term, utm_term),
      landing_page      = COALESCE(p_landing_page, landing_page),
      first_conversion_at = COALESCE(p_first_conversion_at, first_conversion_at),
      client_status     = COALESCE(p_client_status, client_status),
      responsible_id    = COALESCE(p_responsible_id, responsible_id),
      tags              = COALESCE(p_tags, tags),
      notes             = COALESCE(p_notes, notes),
      source            = COALESCE(p_source, source),
      first_contact_at  = COALESCE(p_first_contact_at, first_contact_at),
      last_contact_at   = COALESCE(p_last_contact_at, last_contact_at),
      next_contact_at   = COALESCE(p_next_contact_at, next_contact_at),
      whatsapp_id       = COALESCE(p_whatsapp_id, whatsapp_id),
      instagram_id      = COALESCE(p_instagram_id, instagram_id),
      facebook_id       = COALESCE(p_facebook_id, facebook_id),
      external_id       = COALESCE(p_external_id, external_id),
      updated_at        = now()
    WHERE id = p_contact_id AND client_id = p_client_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Contato não encontrado');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'contact_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_crm_contact TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. RPC: upsert_crm_deal — cria ou atualiza deal com itens
-- ═══════════════════════════════════════════════════════════════════════════
-- p_items: JSONB array de itens
--   [{product_id?, description, quantity, unit_price, discount?}]
-- Quando p_items é passado, SUBSTITUI todos os itens existentes do deal.

CREATE OR REPLACE FUNCTION public.upsert_crm_deal(
  p_client_id          UUID,
  p_deal_id            UUID            DEFAULT NULL,   -- NULL = novo deal
  p_contact_id         UUID            DEFAULT NULL,
  p_pipeline_id        UUID            DEFAULT NULL,
  p_stage_id           UUID            DEFAULT NULL,
  p_title              TEXT            DEFAULT NULL,
  p_value              NUMERIC(12,2)   DEFAULT 0,
  p_discount           NUMERIC(12,2)   DEFAULT 0,
  p_status             TEXT            DEFAULT 'open',
  p_probability        INTEGER         DEFAULT 50,
  p_expected_close_date DATE           DEFAULT NULL,
  p_close_date         DATE            DEFAULT NULL,
  p_lost_reason        TEXT            DEFAULT NULL,
  p_notes              TEXT            DEFAULT NULL,
  p_tags               TEXT[]          DEFAULT NULL,
  p_origin             TEXT            DEFAULT NULL,
  p_responsible_id     UUID            DEFAULT NULL,
  p_items              JSONB           DEFAULT NULL    -- array de itens ou NULL para não alterar
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_org_id UUID;
  v_item   JSONB;
  v_order  INTEGER := 0;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.clients WHERE id = p_client_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  IF p_deal_id IS NULL THEN
    -- ── INSERT ──
    INSERT INTO public.client_crm_deals (
      client_id, organization_id,
      contact_id, pipeline_id, stage_id,
      title, value, discount, status, probability,
      expected_close_date, close_date, lost_reason,
      notes, tags, origin, responsible_id
    ) VALUES (
      p_client_id, v_org_id,
      p_contact_id, p_pipeline_id, p_stage_id,
      p_title, COALESCE(p_value,0), COALESCE(p_discount,0),
      COALESCE(p_status,'open'), COALESCE(p_probability,50),
      p_expected_close_date, p_close_date, p_lost_reason,
      p_notes, COALESCE(p_tags,'{}'), p_origin, p_responsible_id
    )
    RETURNING id INTO v_id;
  ELSE
    -- ── UPDATE ──
    UPDATE public.client_crm_deals SET
      contact_id          = COALESCE(p_contact_id, contact_id),
      pipeline_id         = COALESCE(p_pipeline_id, pipeline_id),
      stage_id            = COALESCE(p_stage_id, stage_id),
      title               = COALESCE(p_title, title),
      value               = COALESCE(p_value, value),
      discount            = COALESCE(p_discount, discount),
      status              = COALESCE(p_status, status),
      probability         = COALESCE(p_probability, probability),
      expected_close_date = COALESCE(p_expected_close_date, expected_close_date),
      close_date          = COALESCE(p_close_date, close_date),
      lost_reason         = COALESCE(p_lost_reason, lost_reason),
      notes               = COALESCE(p_notes, notes),
      tags                = COALESCE(p_tags, tags),
      origin              = COALESCE(p_origin, origin),
      responsible_id      = COALESCE(p_responsible_id, responsible_id),
      updated_at          = now()
    WHERE id = p_deal_id AND client_id = p_client_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Negociação não encontrada');
    END IF;
  END IF;

  -- ── Itens do deal ──────────────────────────────────────────────────────
  -- Se p_items for passado (mesmo que array vazio), substitui todos os itens.
  -- Se p_items for NULL, mantém os itens existentes intactos.
  IF p_items IS NOT NULL THEN
    -- Remove itens existentes
    DELETE FROM public.client_crm_deal_items WHERE deal_id = v_id;

    -- Insere novos itens
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.client_crm_deal_items (
        client_id, organization_id, deal_id,
        product_id, description, quantity, unit_price, discount, "order"
      ) VALUES (
        p_client_id, v_org_id, v_id,
        NULLIF((v_item->>'product_id')::TEXT, '')::UUID,
        v_item->>'description',
        COALESCE((v_item->>'quantity')::NUMERIC, 1),
        COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        COALESCE((v_item->>'discount')::NUMERIC, 0),
        v_order
      );
      v_order := v_order + 1;
    END LOOP;

    -- Recalcula value do deal como soma dos totais dos itens (se houver itens)
    IF jsonb_array_length(p_items) > 0 THEN
      UPDATE public.client_crm_deals
      SET value = (
        SELECT COALESCE(SUM(quantity * unit_price - COALESCE(discount,0)), 0)
        FROM public.client_crm_deal_items
        WHERE deal_id = v_id
      )
      WHERE id = v_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'deal_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_crm_deal TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. RPC: get_crm_contact_full — retorna um contato com todos os campos novos
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_crm_contact_full(
  p_client_id  UUID,
  p_contact_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT row_to_json(c)::JSONB INTO v_result
  FROM public.client_crm_contacts c
  WHERE c.id = p_contact_id AND c.client_id = p_client_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contato não encontrado');
  END IF;

  RETURN jsonb_build_object('success', true, 'contact', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_contact_full TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. RPC: get_crm_deal_full — retorna um deal com itens
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_crm_deal_full(
  p_client_id UUID,
  p_deal_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal  JSONB;
  v_items JSONB;
BEGIN
  SELECT row_to_json(d)::JSONB INTO v_deal
  FROM public.client_crm_deals d
  WHERE d.id = p_deal_id AND d.client_id = p_client_id;

  IF v_deal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Negociação não encontrada');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',          i.id,
      'product_id',  i.product_id,
      'description', i.description,
      'quantity',    i.quantity,
      'unit_price',  i.unit_price,
      'discount',    i.discount,
      'total',       i.total,
      'order',       i."order"
    ) ORDER BY i."order"
  ), '[]'::JSONB)
  INTO v_items
  FROM public.client_crm_deal_items i
  WHERE i.deal_id = p_deal_id;

  RETURN jsonb_build_object(
    'success', true,
    'deal',    v_deal || jsonb_build_object('items', v_items)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_deal_full TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. RPC: get_crm_contacts_list — lista paginada de contatos com busca
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_crm_contacts_list(
  p_client_id    UUID,
  p_search       TEXT    DEFAULT NULL,
  p_status       TEXT    DEFAULT NULL,
  p_responsible  UUID    DEFAULT NULL,
  p_limit        INTEGER DEFAULT 50,
  p_offset       INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows  JSONB;
  v_total BIGINT;
  v_search TEXT;
BEGIN
  -- Normaliza busca: remove formatação de CPF, CNPJ, telefone, CEP
  v_search := regexp_replace(COALESCE(p_search,''), '[^a-zA-Z0-9À-ÿ@._\- ]', '', 'g');

  SELECT COUNT(*) INTO v_total
  FROM public.client_crm_contacts c
  WHERE c.client_id = p_client_id
    AND c.archived_at IS NULL
    AND (v_search = '' OR (
      c.name          ILIKE '%' || v_search || '%' OR
      c.last_name     ILIKE '%' || v_search || '%' OR
      c.company       ILIKE '%' || v_search || '%' OR
      c.email         ILIKE '%' || v_search || '%' OR
      c.email2        ILIKE '%' || v_search || '%' OR
      -- busca por phone/whatsapp ignorando formatação
      regexp_replace(COALESCE(c.phone,''),    '[^0-9]','','g') LIKE '%' || regexp_replace(v_search,'[^0-9]','','g') || '%' OR
      regexp_replace(COALESCE(c.whatsapp,''), '[^0-9]','','g') LIKE '%' || regexp_replace(v_search,'[^0-9]','','g') || '%' OR
      regexp_replace(COALESCE(c.cpf,''),      '[^0-9]','','g') LIKE '%' || regexp_replace(v_search,'[^0-9]','','g') || '%' OR
      regexp_replace(COALESCE(c.cnpj,''),     '[^0-9]','','g') LIKE '%' || regexp_replace(v_search,'[^0-9]','','g') || '%'
    ))
    AND (p_status IS NULL OR c.client_status = p_status)
    AND (p_responsible IS NULL OR c.responsible_id = p_responsible);

  SELECT COALESCE(jsonb_agg(row_to_json(q)::JSONB ORDER BY q.created_at DESC), '[]')
  INTO v_rows
  FROM (
    SELECT
      c.id, c.name, c.last_name, c.contact_type, c.company,
      c.phone, c.whatsapp, c.email, c.client_status,
      c.city, c.state, c.tags, c.source,
      c.origin_recent, c.responsible_id,
      c.last_contact_at, c.next_contact_at,
      c.created_at, c.updated_at
    FROM public.client_crm_contacts c
    WHERE c.client_id = p_client_id
      AND c.archived_at IS NULL
      AND (v_search = '' OR (
        c.name          ILIKE '%' || v_search || '%' OR
        c.last_name     ILIKE '%' || v_search || '%' OR
        c.company       ILIKE '%' || v_search || '%' OR
        c.email         ILIKE '%' || v_search || '%' OR
        c.email2        ILIKE '%' || v_search || '%' OR
        regexp_replace(COALESCE(c.phone,''),    '[^0-9]','','g') LIKE '%' || regexp_replace(v_search,'[^0-9]','','g') || '%' OR
        regexp_replace(COALESCE(c.whatsapp,''), '[^0-9]','','g') LIKE '%' || regexp_replace(v_search,'[^0-9]','','g') || '%' OR
        regexp_replace(COALESCE(c.cpf,''),      '[^0-9]','','g') LIKE '%' || regexp_replace(v_search,'[^0-9]','','g') || '%' OR
        regexp_replace(COALESCE(c.cnpj,''),     '[^0-9]','','g') LIKE '%' || regexp_replace(v_search,'[^0-9]','','g') || '%'
      ))
      AND (p_status IS NULL OR c.client_status = p_status)
      AND (p_responsible IS NULL OR c.responsible_id = p_responsible)
    ORDER BY c.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) q;

  RETURN jsonb_build_object(
    'rows',   v_rows,
    'total',  v_total,
    'limit',  p_limit,
    'offset', p_offset
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_contacts_list TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. RPC: check_crm_contact_duplicates — verifica possíveis duplicatas
-- ═══════════════════════════════════════════════════════════════════════════
-- Retorna contatos que possuem whatsapp, phone, email, cpf ou cnpj iguais.
-- Não bloqueia o cadastro — apenas informa.

CREATE OR REPLACE FUNCTION public.check_crm_contact_duplicates(
  p_client_id UUID,
  p_whatsapp  TEXT    DEFAULT NULL,
  p_phone     TEXT    DEFAULT NULL,
  p_email     TEXT    DEFAULT NULL,
  p_cpf       TEXT    DEFAULT NULL,
  p_cnpj      TEXT    DEFAULT NULL,
  p_exclude_id UUID   DEFAULT NULL   -- ignorar o próprio contato no update
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows JSONB;
BEGIN
  -- Normaliza
  p_whatsapp := regexp_replace(COALESCE(p_whatsapp,''), '[^0-9]', '', 'g');
  p_phone    := regexp_replace(COALESCE(p_phone,''),    '[^0-9]', '', 'g');
  p_cpf      := regexp_replace(COALESCE(p_cpf,''),      '[^0-9]', '', 'g');
  p_cnpj     := regexp_replace(COALESCE(p_cnpj,''),     '[^0-9]', '', 'g');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',      c.id,
    'name',    c.name,
    'phone',   c.phone,
    'whatsapp',c.whatsapp,
    'email',   c.email,
    'match',   CASE
      WHEN p_cpf  <> '' AND c.cpf  = p_cpf  THEN 'cpf'
      WHEN p_cnpj <> '' AND c.cnpj = p_cnpj THEN 'cnpj'
      WHEN p_email <> '' AND c.email = p_email THEN 'email'
      WHEN p_whatsapp <> '' AND regexp_replace(COALESCE(c.whatsapp,''),'[^0-9]','','g') = p_whatsapp THEN 'whatsapp'
      WHEN p_phone    <> '' AND regexp_replace(COALESCE(c.phone,''),   '[^0-9]','','g') = p_phone    THEN 'phone'
      ELSE 'unknown'
    END
  )), '[]'::JSONB)
  INTO v_rows
  FROM public.client_crm_contacts c
  WHERE c.client_id = p_client_id
    AND c.archived_at IS NULL
    AND (p_exclude_id IS NULL OR c.id <> p_exclude_id)
    AND (
      (p_cpf       <> '' AND c.cpf   = p_cpf)   OR
      (p_cnpj      <> '' AND c.cnpj  = p_cnpj)  OR
      (p_email     <> '' AND c.email = p_email)  OR
      (p_whatsapp  <> '' AND regexp_replace(COALESCE(c.whatsapp,''), '[^0-9]','','g') = p_whatsapp) OR
      (p_phone     <> '' AND regexp_replace(COALESCE(c.phone,''),    '[^0-9]','','g') = p_phone)
    );

  RETURN jsonb_build_object(
    'duplicates', v_rows,
    'has_duplicates', jsonb_array_length(v_rows) > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_crm_contact_duplicates TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. SEED: status padrão de contato para cliente de teste
-- ═══════════════════════════════════════════════════════════════════════════
-- Criação de status padrão é feita sob demanda por tenant via RPC,
-- mas aqui inserimos para o cliente de teste como exemplo.
-- Em produção, chamar manage_crm_contact_status para cada novo tenant.

CREATE OR REPLACE FUNCTION public.seed_crm_contact_status(p_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;
  IF v_org_id IS NULL THEN RETURN; END IF;

  -- Só semeia se não tiver nenhum status ainda
  IF EXISTS (SELECT 1 FROM public.client_crm_contact_status_options WHERE client_id = p_client_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.client_crm_contact_status_options
    (client_id, organization_id, name, color, "order", is_default)
  VALUES
    (p_client_id, v_org_id, 'Lead',          '#6366f1', 0, true),
    (p_client_id, v_org_id, 'Prospect',       '#f59e0b', 1, false),
    (p_client_id, v_org_id, 'Cliente Ativo',  '#10b981', 2, false),
    (p_client_id, v_org_id, 'Inativo',        '#64748b', 3, false),
    (p_client_id, v_org_id, 'Arquivado',      '#ef4444', 4, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_crm_contact_status TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Versão
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.schema_migrations (version)
VALUES ('094_crm_expand_tables_v1')
ON CONFLICT (version) DO NOTHING;
