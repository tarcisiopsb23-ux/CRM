-- =============================================================================
-- Migration 081: CRM do C8 Control — Leads, Pipelines Configuráveis e Campos Personalizados
--
-- Cria a infraestrutura completa do CRM do C8 Control no Banco A (multi-tenant).
-- Antes desta migration, o frontend tentava acessar "crm_leads" que não existia.
--
-- O que é criado:
--   1. client_crm_pipelines      — funis configuráveis por cliente (múltiplos funis)
--   2. pipeline_id em stages     — vincula etapas a funis específicos
--   3. client_crm_leads          — tabela principal de leads (substitui referência ao Banco B)
--   4. client_crm_custom_fields  — definição de campos personalizados por cliente
--   5. client_crm_custom_values  — valores dos campos personalizados por lead
--   6. Trigger: máx. 12 etapas por funil
--   7. Trigger: garante apenas 1 pipeline default por cliente
--   8. Views de compat: crm_leads, crm_pipelines, crm_custom_fields, crm_custom_values
--   9. Seed: pipeline default + 5 etapas padrão para clientes existentes
--  10. RLS em todas as tabelas novas
--
-- Isolamento multi-tenant: client_id UUID → clients(id) em todas as tabelas.
-- Frontend nunca acessa diretamente — sempre via RPC ou views com security_invoker.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 1. Funis do pipeline (client_crm_pipelines) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_crm_pipelines (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_pipelines_client_id
  ON public.client_crm_pipelines(client_id);

COMMENT ON TABLE public.client_crm_pipelines IS
  'Funis de venda configuráveis por cliente do C8 Control. Cada cliente pode ter múltiplos funis.';
COMMENT ON COLUMN public.client_crm_pipelines.is_default IS
  'Apenas um funil por cliente pode ser default. Enforced por trigger trg_crm_pipeline_single_default.';

-- ─── 2. Adiciona pipeline_id nas etapas existentes ───────────────────────────
-- Vincula cada stage a um funil específico.
-- Stages legadas (sem pipeline_id) ficam com NULL até o seed abaixo atribuí-las.

ALTER TABLE public.client_crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS pipeline_id UUID
    REFERENCES public.client_crm_pipelines(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_client_crm_stages_pipeline_id
  ON public.client_crm_pipeline_stages(pipeline_id, "order")
  WHERE pipeline_id IS NOT NULL;

-- ─── 3. Tabela principal de leads (client_crm_leads) ─────────────────────────
-- Esta é a tabela que o frontend do C8 Control precisa.
-- A view "crm_leads" (seção 8) aponta para cá.

CREATE TABLE IF NOT EXISTS public.client_crm_leads (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id  UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identificação
  name             TEXT          NOT NULL,
  phone            TEXT,
  email            TEXT,
  company          TEXT,
  address          TEXT,

  -- Qualificação
  origin           TEXT,
  temperature      TEXT          CHECK (temperature IN ('quente','morno','frio')),
  tags             TEXT,         -- comma-separated

  -- Pipeline dinâmico
  -- pipeline_id: qual funil este lead pertence
  -- stage_id:    em qual etapa do funil ele está
  -- status:      mantido para compatibilidade com CSV import e código legado
  pipeline_id      UUID          REFERENCES public.client_crm_pipelines(id) ON DELETE SET NULL,
  stage_id         UUID          REFERENCES public.client_crm_pipeline_stages(id) ON DELETE SET NULL,
  status           TEXT          NOT NULL DEFAULT 'novo',

  -- Negócio
  proposal_value   NUMERIC(12,2),
  potential_value  NUMERIC(12,2),
  product_id       UUID          REFERENCES public.client_crm_products(id) ON DELETE SET NULL,
  product_name     TEXT,
  whatsapp_link    TEXT,
  last_contact_at  TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  lost_reason      TEXT,
  notes            TEXT,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_leads_client_id
  ON public.client_crm_leads(client_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_leads_pipeline_stage
  ON public.client_crm_leads(client_id, pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_leads_status
  ON public.client_crm_leads(client_id, status);
CREATE INDEX IF NOT EXISTS idx_client_crm_leads_followup
  ON public.client_crm_leads(client_id, next_followup_at)
  WHERE next_followup_at IS NOT NULL;

COMMENT ON TABLE public.client_crm_leads IS
  'Leads do CRM do C8 Control. Referenciados pelo frontend via view crm_leads.';
COMMENT ON COLUMN public.client_crm_leads.stage_id IS
  'Etapa atual do lead no funil. Atualizado pelo drag-and-drop do Kanban.';
COMMENT ON COLUMN public.client_crm_leads.status IS
  'Campo legado mantido para compatibilidade. O stage_id é a fonte de verdade para o pipeline dinâmico.';

-- ─── 4. Campos personalizados — definições (client_crm_custom_fields) ─────────
-- Cada cliente define quais campos extras quer no formulário de lead.

CREATE TABLE IF NOT EXISTS public.client_crm_custom_fields (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,         -- label exibida: "CPF", "Instagram", "Cargo"
  field_key       TEXT        NOT NULL,         -- chave interna: "cpf", "instagram", "cargo"
  field_type      TEXT        NOT NULL DEFAULT 'text'
                  CHECK (field_type IN ('text','number','date','select','boolean')),
  options         JSONB,                         -- só para field_type = 'select': ["Opção A","Opção B"]
  required        BOOLEAN     NOT NULL DEFAULT false,
  "order"         INTEGER     NOT NULL DEFAULT 0,
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (client_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_client_crm_custom_fields_client_id
  ON public.client_crm_custom_fields(client_id, "order")
  WHERE active = true;

COMMENT ON TABLE public.client_crm_custom_fields IS
  'Definições de campos personalizados do CRM por cliente. Ex: CPF, Instagram, Segmento.';
COMMENT ON COLUMN public.client_crm_custom_fields.field_key IS
  'Chave única por cliente (slug). Usada para identificar o campo no código. Ex: cpf, instagram.';
COMMENT ON COLUMN public.client_crm_custom_fields.options IS
  'Array JSON de opções para campos do tipo select. Ex: ["Pequeno","Médio","Grande"]';

-- ─── 5. Campos personalizados — valores (client_crm_custom_values) ────────────
-- Armazena o valor de cada campo personalizado para cada lead.

CREATE TABLE IF NOT EXISTS public.client_crm_custom_values (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id      UUID        NOT NULL REFERENCES public.client_crm_leads(id) ON DELETE CASCADE,
  field_id     UUID        NOT NULL REFERENCES public.client_crm_custom_fields(id) ON DELETE CASCADE,
  value        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (lead_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_client_crm_custom_values_lead_id
  ON public.client_crm_custom_values(lead_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_custom_values_client_id
  ON public.client_crm_custom_values(client_id);

COMMENT ON TABLE public.client_crm_custom_values IS
  'Valores dos campos personalizados por lead. Um registro por (lead, campo).';

-- ─── 6. Trigger: máx. 12 etapas por funil ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_crm_stage_limit()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pipeline_id IS NOT NULL THEN
    IF (
      SELECT COUNT(*)
      FROM public.client_crm_pipeline_stages
      WHERE pipeline_id = NEW.pipeline_id
        AND id <> COALESCE(NEW.id, gen_random_uuid())
    ) >= 12 THEN
      RAISE EXCEPTION 'Limite de 12 etapas por funil atingido. Remova uma etapa antes de adicionar outra.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_stage_limit ON public.client_crm_pipeline_stages;
CREATE TRIGGER trg_crm_stage_limit
  BEFORE INSERT ON public.client_crm_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.check_crm_stage_limit();

COMMENT ON FUNCTION public.check_crm_stage_limit() IS
  'Garante no máximo 12 etapas por funil (pipeline_id). Disparado antes de INSERT em client_crm_pipeline_stages.';

-- ─── 7. Trigger: um único pipeline default por cliente ───────────────────────

CREATE OR REPLACE FUNCTION public.enforce_single_default_pipeline()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- Ao marcar um pipeline como default, desmarca os outros do mesmo cliente
  IF NEW.is_default = true THEN
    UPDATE public.client_crm_pipelines
    SET is_default = false,
        updated_at = now()
    WHERE client_id = NEW.client_id
      AND id <> NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_pipeline_single_default ON public.client_crm_pipelines;
CREATE TRIGGER trg_crm_pipeline_single_default
  BEFORE INSERT OR UPDATE ON public.client_crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_pipeline();

-- ─── 8. Trigger: updated_at automático ────────────────────────────────────────

-- Reutiliza a função set_updated_at() que já existe no banco (criada em migrations anteriores).
-- Só cria os triggers nas tabelas novas.

DO $$
BEGIN
  -- client_crm_pipelines
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_client_crm_pipelines_updated_at'
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_client_crm_pipelines_updated_at
        BEFORE UPDATE ON public.client_crm_pipelines
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;

  -- client_crm_leads
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_client_crm_leads_updated_at'
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_client_crm_leads_updated_at
        BEFORE UPDATE ON public.client_crm_leads
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;

  -- client_crm_custom_fields
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_client_crm_custom_fields_updated_at'
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_client_crm_custom_fields_updated_at
        BEFORE UPDATE ON public.client_crm_custom_fields
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;

  -- client_crm_custom_values
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_client_crm_custom_values_updated_at'
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_client_crm_custom_values_updated_at
        BEFORE UPDATE ON public.client_crm_custom_values
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;
END $$;

-- ─── 9. RLS em todas as tabelas novas ────────────────────────────────────────

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'client_crm_pipelines',
    'client_crm_leads',
    'client_crm_custom_fields',
    'client_crm_custom_values'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Authenticated: acesso total (isolamento garantido pelas RPCs SECURITY DEFINER e pelo client_id)
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );

    -- Anon: sem acesso
    EXECUTE format('DROP POLICY IF EXISTS "no_anon_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "no_anon_access" ON public.%I FOR ALL TO anon USING (false)',
      t
    );
  END LOOP;
END $rls$;

-- ─── 10. Views de compatibilidade ─────────────────────────────────────────────
-- Permite que o frontend use nomes sem prefixo "client_".

CREATE OR REPLACE VIEW public.crm_leads
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_leads;

CREATE OR REPLACE VIEW public.crm_pipelines
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_pipelines;

CREATE OR REPLACE VIEW public.crm_custom_fields
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_custom_fields;

CREATE OR REPLACE VIEW public.crm_custom_values
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_custom_values;

-- ─── 11. RPC: get_crm_data — carrega tudo do CRM em uma chamada ───────────────
-- Retorna pipelines, stages e custom fields do cliente autenticado.
-- Chamada pelo frontend na inicialização do CrmPage.

CREATE OR REPLACE FUNCTION public.get_crm_data(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipelines JSONB;
  v_stages    JSONB;
  v_fields    JSONB;
BEGIN
  -- Pipelines do cliente
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',          id,
      'name',        name,
      'description', description,
      'is_default',  is_default,
      'created_at',  created_at
    ) ORDER BY is_default DESC, created_at ASC
  ), '[]'::jsonb)
  INTO v_pipelines
  FROM public.client_crm_pipelines
  WHERE client_id = p_client_id;

  -- Stages de todos os pipelines do cliente
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',          s.id,
      'pipeline_id', s.pipeline_id,
      'name',        s.name,
      'order',       s."order",
      'color',       s.color
    ) ORDER BY s."order" ASC
  ), '[]'::jsonb)
  INTO v_stages
  FROM public.client_crm_pipeline_stages s
  WHERE s.client_id = p_client_id
    AND s.pipeline_id IS NOT NULL;

  -- Campos personalizados ativos
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',         id,
      'name',       name,
      'field_key',  field_key,
      'field_type', field_type,
      'options',    options,
      'required',   required,
      'order',      "order"
    ) ORDER BY "order" ASC
  ), '[]'::jsonb)
  INTO v_fields
  FROM public.client_crm_custom_fields
  WHERE client_id = p_client_id
    AND active = true;

  RETURN jsonb_build_object(
    'pipelines',      v_pipelines,
    'stages',         v_stages,
    'custom_fields',  v_fields
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_data(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_crm_data(UUID) IS
  'Retorna pipelines, stages e custom fields do cliente em uma única chamada. Usado pelo CrmPage na inicialização.';

-- ─── 12. RPC: save_crm_lead — cria ou atualiza lead com custom values ─────────

CREATE OR REPLACE FUNCTION public.save_crm_lead(
  p_client_id       UUID,
  p_lead_id         UUID    DEFAULT NULL,  -- NULL = novo lead; UUID = update
  p_name            TEXT    DEFAULT NULL,
  p_phone           TEXT    DEFAULT NULL,
  p_email           TEXT    DEFAULT NULL,
  p_company         TEXT    DEFAULT NULL,
  p_address         TEXT    DEFAULT NULL,
  p_origin          TEXT    DEFAULT NULL,
  p_temperature     TEXT    DEFAULT NULL,
  p_tags            TEXT    DEFAULT NULL,
  p_pipeline_id     UUID    DEFAULT NULL,
  p_stage_id        UUID    DEFAULT NULL,
  p_status          TEXT    DEFAULT 'novo',
  p_proposal_value  NUMERIC DEFAULT NULL,
  p_potential_value NUMERIC DEFAULT NULL,
  p_product_id      UUID    DEFAULT NULL,
  p_product_name    TEXT    DEFAULT NULL,
  p_whatsapp_link   TEXT    DEFAULT NULL,
  p_last_contact_at TIMESTAMPTZ DEFAULT NULL,
  p_next_followup_at TIMESTAMPTZ DEFAULT NULL,
  p_lost_reason     TEXT    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL,
  p_custom_values   JSONB   DEFAULT '[]'  -- [{field_id, value}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id UUID;
  v_org_id  UUID;
  v_cv      JSONB;
BEGIN
  -- Obtém organization_id do cliente
  SELECT organization_id INTO v_org_id
  FROM public.clients WHERE id = p_client_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  IF p_lead_id IS NULL THEN
    -- INSERT
    INSERT INTO public.client_crm_leads (
      client_id, organization_id, name, phone, email, company, address,
      origin, temperature, tags, pipeline_id, stage_id, status,
      proposal_value, potential_value, product_id, product_name,
      whatsapp_link, last_contact_at, next_followup_at, lost_reason, notes
    ) VALUES (
      p_client_id, v_org_id, p_name, p_phone, p_email, p_company, p_address,
      p_origin, p_temperature, p_tags, p_pipeline_id, p_stage_id, p_status,
      p_proposal_value, p_potential_value, p_product_id, p_product_name,
      p_whatsapp_link, p_last_contact_at, p_next_followup_at, p_lost_reason, p_notes
    )
    RETURNING id INTO v_lead_id;
  ELSE
    -- UPDATE
    UPDATE public.client_crm_leads SET
      name             = COALESCE(p_name, name),
      phone            = p_phone,
      email            = p_email,
      company          = p_company,
      address          = p_address,
      origin           = p_origin,
      temperature      = p_temperature,
      tags             = p_tags,
      pipeline_id      = p_pipeline_id,
      stage_id         = p_stage_id,
      status           = COALESCE(p_status, status),
      proposal_value   = p_proposal_value,
      potential_value  = p_potential_value,
      product_id       = p_product_id,
      product_name     = p_product_name,
      whatsapp_link    = p_whatsapp_link,
      last_contact_at  = p_last_contact_at,
      next_followup_at = p_next_followup_at,
      lost_reason      = p_lost_reason,
      notes            = p_notes,
      updated_at       = now()
    WHERE id = p_lead_id AND client_id = p_client_id
    RETURNING id INTO v_lead_id;

    IF v_lead_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Lead não encontrado ou sem permissão');
    END IF;
  END IF;

  -- Salva custom values (upsert)
  IF jsonb_array_length(p_custom_values) > 0 THEN
    FOR v_cv IN SELECT * FROM jsonb_array_elements(p_custom_values)
    LOOP
      INSERT INTO public.client_crm_custom_values (client_id, lead_id, field_id, value)
      VALUES (
        p_client_id,
        v_lead_id,
        (v_cv->>'field_id')::UUID,
        v_cv->>'value'
      )
      ON CONFLICT (lead_id, field_id)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crm_lead(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,TEXT,NUMERIC,NUMERIC,UUID,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,JSONB) TO authenticated;

-- ─── 13. RPC: move_crm_lead — move lead entre stages (drag-and-drop) ──────────

CREATE OR REPLACE FUNCTION public.move_crm_lead(
  p_client_id UUID,
  p_lead_id   UUID,
  p_stage_id  UUID,
  p_status    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
BEGIN
  -- Obtém o pipeline_id da stage de destino
  SELECT pipeline_id INTO v_pipeline_id
  FROM public.client_crm_pipeline_stages
  WHERE id = p_stage_id AND client_id = p_client_id;

  UPDATE public.client_crm_leads
  SET
    stage_id    = p_stage_id,
    pipeline_id = COALESCE(v_pipeline_id, pipeline_id),
    status      = COALESCE(p_status, status),
    updated_at  = now()
  WHERE id = p_lead_id AND client_id = p_client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_crm_lead(UUID, UUID, UUID, TEXT) TO authenticated;

-- ─── 14. RPC: manage_crm_pipeline — cria, edita ou exclui funis ───────────────

CREATE OR REPLACE FUNCTION public.manage_crm_pipeline(
  p_client_id    UUID,
  p_action       TEXT,            -- 'create' | 'update' | 'delete'
  p_pipeline_id  UUID   DEFAULT NULL,
  p_name         TEXT   DEFAULT NULL,
  p_description  TEXT   DEFAULT NULL,
  p_is_default   BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_org_id UUID;
  v_count  INTEGER;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  IF p_action = 'create' THEN
    IF p_name IS NULL OR trim(p_name) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Nome do funil é obrigatório');
    END IF;
    INSERT INTO public.client_crm_pipelines (client_id, organization_id, name, description, is_default)
    VALUES (p_client_id, v_org_id, trim(p_name), p_description, COALESCE(p_is_default, false))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'pipeline_id', v_id);

  ELSIF p_action = 'update' THEN
    UPDATE public.client_crm_pipelines SET
      name        = COALESCE(NULLIF(trim(p_name), ''), name),
      description = COALESCE(p_description, description),
      is_default  = COALESCE(p_is_default, is_default),
      updated_at  = now()
    WHERE id = p_pipeline_id AND client_id = p_client_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Funil não encontrado');
    END IF;
    RETURN jsonb_build_object('success', true, 'pipeline_id', v_id);

  ELSIF p_action = 'delete' THEN
    -- Não permite excluir se for o único funil
    SELECT COUNT(*) INTO v_count FROM public.client_crm_pipelines WHERE client_id = p_client_id;
    IF v_count <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não é possível excluir o único funil. Crie outro antes.');
    END IF;
    -- Não permite excluir se houver leads vinculados
    SELECT COUNT(*) INTO v_count FROM public.client_crm_leads
    WHERE client_id = p_client_id AND pipeline_id = p_pipeline_id;
    IF v_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('Existem %s leads neste funil. Mova-os antes de excluir.', v_count));
    END IF;
    DELETE FROM public.client_crm_pipelines WHERE id = p_pipeline_id AND client_id = p_client_id;
    RETURN jsonb_build_object('success', true);

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida. Use: create, update, delete');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_crm_pipeline(UUID,TEXT,UUID,TEXT,TEXT,BOOLEAN) TO authenticated;

-- ─── 15. RPC: manage_crm_stage — cria, edita, reordena ou exclui etapas ───────

CREATE OR REPLACE FUNCTION public.manage_crm_stage(
  p_client_id   UUID,
  p_action      TEXT,             -- 'create' | 'update' | 'delete' | 'reorder'
  p_stage_id    UUID   DEFAULT NULL,
  p_pipeline_id UUID   DEFAULT NULL,
  p_name        TEXT   DEFAULT NULL,
  p_color       TEXT   DEFAULT NULL,
  p_order       INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    UUID;
  v_count INTEGER;
  v_next  INTEGER;
BEGIN
  IF p_action = 'create' THEN
    IF p_name IS NULL OR trim(p_name) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Nome da etapa é obrigatório');
    END IF;
    IF p_pipeline_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'pipeline_id é obrigatório para criar etapa');
    END IF;
    -- Calcula próxima ordem
    SELECT COALESCE(MAX("order"), -1) + 1 INTO v_next
    FROM public.client_crm_pipeline_stages
    WHERE pipeline_id = p_pipeline_id AND client_id = p_client_id;

    INSERT INTO public.client_crm_pipeline_stages
      (client_id, organization_id, pipeline_id, name, color, "order")
    SELECT
      p_client_id, organization_id, p_pipeline_id,
      trim(p_name), COALESCE(p_color, '#6366f1'), v_next
    FROM public.client_crm_pipelines
    WHERE id = p_pipeline_id AND client_id = p_client_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Funil não encontrado');
    END IF;
    RETURN jsonb_build_object('success', true, 'stage_id', v_id);

  ELSIF p_action = 'update' THEN
    UPDATE public.client_crm_pipeline_stages SET
      name  = COALESCE(NULLIF(trim(p_name), ''), name),
      color = COALESCE(p_color, color)
    WHERE id = p_stage_id AND client_id = p_client_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Etapa não encontrada');
    END IF;
    RETURN jsonb_build_object('success', true, 'stage_id', v_id);

  ELSIF p_action = 'reorder' THEN
    -- p_order é a nova posição da etapa; reorganiza as demais
    UPDATE public.client_crm_pipeline_stages
    SET "order" = p_order
    WHERE id = p_stage_id AND client_id = p_client_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Etapa não encontrada');
    END IF;
    RETURN jsonb_build_object('success', true);

  ELSIF p_action = 'delete' THEN
    -- Não permite excluir se houver leads nessa etapa
    SELECT COUNT(*) INTO v_count FROM public.client_crm_leads
    WHERE client_id = p_client_id AND stage_id = p_stage_id;
    IF v_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('Existem %s leads nesta etapa. Mova-os antes de excluir.', v_count));
    END IF;
    DELETE FROM public.client_crm_pipeline_stages
    WHERE id = p_stage_id AND client_id = p_client_id;
    RETURN jsonb_build_object('success', true);

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida. Use: create, update, delete, reorder');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_crm_stage(UUID,TEXT,UUID,UUID,TEXT,TEXT,INTEGER) TO authenticated;

-- ─── 16. RPC: manage_crm_custom_field — CRUD de campos personalizados ─────────

CREATE OR REPLACE FUNCTION public.manage_crm_custom_field(
  p_client_id   UUID,
  p_action      TEXT,               -- 'create' | 'update' | 'delete' | 'reorder'
  p_field_id    UUID    DEFAULT NULL,
  p_name        TEXT    DEFAULT NULL,
  p_field_key   TEXT    DEFAULT NULL,
  p_field_type  TEXT    DEFAULT 'text',
  p_options     JSONB   DEFAULT NULL,
  p_required    BOOLEAN DEFAULT false,
  p_order       INTEGER DEFAULT NULL,
  p_active      BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_org_id UUID;
  v_key    TEXT;
  v_next   INTEGER;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  IF p_action = 'create' THEN
    IF p_name IS NULL OR trim(p_name) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Nome do campo é obrigatório');
    END IF;

    -- Gera field_key a partir do nome se não fornecido
    v_key := COALESCE(
      NULLIF(trim(lower(p_field_key)), ''),
      lower(regexp_replace(trim(p_name), '[^a-z0-9]+', '_', 'g'))
    );

    -- Próxima ordem
    SELECT COALESCE(MAX("order"), -1) + 1 INTO v_next
    FROM public.client_crm_custom_fields WHERE client_id = p_client_id;

    INSERT INTO public.client_crm_custom_fields
      (client_id, organization_id, name, field_key, field_type, options, required, "order", active)
    VALUES
      (p_client_id, v_org_id, trim(p_name), v_key, p_field_type, p_options,
       COALESCE(p_required, false), COALESCE(p_order, v_next), true)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'field_id', v_id);

  ELSIF p_action = 'update' THEN
    UPDATE public.client_crm_custom_fields SET
      name        = COALESCE(NULLIF(trim(p_name), ''), name),
      field_type  = COALESCE(p_field_type, field_type),
      options     = COALESCE(p_options, options),
      required    = COALESCE(p_required, required),
      "order"     = COALESCE(p_order, "order"),
      active      = COALESCE(p_active, active),
      updated_at  = now()
    WHERE id = p_field_id AND client_id = p_client_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Campo não encontrado');
    END IF;
    RETURN jsonb_build_object('success', true, 'field_id', v_id);

  ELSIF p_action = 'delete' THEN
    -- Soft delete: marca como inativo (preserva histórico de valores)
    UPDATE public.client_crm_custom_fields
    SET active = false, updated_at = now()
    WHERE id = p_field_id AND client_id = p_client_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Campo não encontrado');
    END IF;
    RETURN jsonb_build_object('success', true);

  ELSIF p_action = 'reorder' THEN
    UPDATE public.client_crm_custom_fields
    SET "order" = p_order, updated_at = now()
    WHERE id = p_field_id AND client_id = p_client_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Campo não encontrado');
    END IF;
    RETURN jsonb_build_object('success', true);

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida. Use: create, update, delete, reorder');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_crm_custom_field(UUID,TEXT,UUID,TEXT,TEXT,TEXT,JSONB,BOOLEAN,INTEGER,BOOLEAN) TO authenticated;

-- ─── 17. Seed: pipeline default para clientes que ainda não têm ───────────────
-- Cria um pipeline "Vendas" com as 5 etapas padrão para cada cliente
-- que já tem stages legadas em client_crm_pipeline_stages (sem pipeline_id).
-- Para novos clientes, o provisionamento deve chamar seed_crm_pipeline().

CREATE OR REPLACE FUNCTION public.seed_crm_pipeline(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id     UUID;
  v_pipeline_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  -- Se já tem pelo menos um pipeline, não recria
  IF EXISTS (
    SELECT 1 FROM public.client_crm_pipelines WHERE client_id = p_client_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'Pipeline já existe');
  END IF;

  -- Cria o pipeline padrão
  INSERT INTO public.client_crm_pipelines
    (client_id, organization_id, name, description, is_default)
  VALUES
    (p_client_id, v_org_id, 'Vendas', 'Funil de vendas padrão', true)
  RETURNING id INTO v_pipeline_id;

  -- Cria as 5 etapas padrão
  INSERT INTO public.client_crm_pipeline_stages
    (client_id, organization_id, pipeline_id, name, "order", color)
  VALUES
    (p_client_id, v_org_id, v_pipeline_id, 'Novo Lead',   0, '#6366f1'),
    (p_client_id, v_org_id, v_pipeline_id, 'Contato',     1, '#3b82f6'),
    (p_client_id, v_org_id, v_pipeline_id, 'Proposta',    2, '#f59e0b'),
    (p_client_id, v_org_id, v_pipeline_id, 'Negociação',  3, '#ec4899'),
    (p_client_id, v_org_id, v_pipeline_id, 'Ganhos',      4, '#10b981');

  RETURN jsonb_build_object(
    'success',     true,
    'skipped',     false,
    'pipeline_id', v_pipeline_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_crm_pipeline(UUID) TO authenticated;

COMMENT ON FUNCTION public.seed_crm_pipeline(UUID) IS
  'Cria o pipeline padrão "Vendas" com 5 etapas para um cliente. Idempotente — não recria se já existir.';

-- Seed retroativo: para cada cliente que tem stages sem pipeline_id,
-- cria um pipeline default e vincula as stages existentes a ele.
DO $seed$
DECLARE
  v_client    RECORD;
  v_org_id    UUID;
  v_pip_id    UUID;
BEGIN
  FOR v_client IN
    SELECT DISTINCT client_id
    FROM public.client_crm_pipeline_stages
    WHERE pipeline_id IS NULL
  LOOP
    -- Só processa clientes que ainda não têm pipeline
    IF NOT EXISTS (
      SELECT 1 FROM public.client_crm_pipelines WHERE client_id = v_client.client_id
    ) THEN
      SELECT organization_id INTO v_org_id
      FROM public.clients WHERE id = v_client.client_id;

      INSERT INTO public.client_crm_pipelines
        (client_id, organization_id, name, description, is_default)
      VALUES
        (v_client.client_id, v_org_id, 'Vendas', 'Funil de vendas padrão', true)
      RETURNING id INTO v_pip_id;

      -- Vincula as stages legadas ao novo pipeline
      UPDATE public.client_crm_pipeline_stages
      SET pipeline_id = v_pip_id
      WHERE client_id = v_client.client_id AND pipeline_id IS NULL;
    END IF;
  END LOOP;
END $seed$;

-- ─── 18. Versão ───────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('081_crm_leads_pipeline_custom_fields_v1')
ON CONFLICT (version) DO NOTHING;
