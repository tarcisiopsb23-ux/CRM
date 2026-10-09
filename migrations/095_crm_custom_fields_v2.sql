-- =============================================================================
-- Migration 095: CRM — Custom Fields v2 — Sistema polimórfico por entidade
--
-- Problema da migration 081:
--   • client_crm_custom_fields não tem entity_type — todos os campos vão para
--     leads, sem distinção de contacts/deals/products
--   • client_crm_custom_values referencia lead_id — não suporta contacts ou deals
--   • Apenas 5 tipos de campo (text, number, date, select, boolean)
--   • Sem: description, placeholder, valor padrão, visível/oculto, section
--
-- Esta migration:
--   1. Adiciona entity_type em client_crm_custom_fields ('contact'|'deal'|'product')
--   2. Migra registros existentes: NULL → 'deal' (compatibilidade com uso anterior)
--   3. Adiciona novos tipos de campo (10 novos, total 15)
--   4. Adiciona colunas de configuração (description, placeholder, default_value,
--      visible, section, multi_select)
--   5. Altera client_crm_custom_values: lead_id → entity_id + entity_type
--      de forma NÃO DESTRUTIVA (adiciona colunas novas, migra dados, mantém lead_id)
--   6. Atualiza RPC get_crm_data para retornar campos separados por entidade
--   7. Atualiza RPC manage_crm_custom_field para suportar entity_type
--
-- Compatibilidade:
--   • lead_id em client_crm_custom_values é mantido (NOT DROPPED)
--   • Registros existentes são migrados automaticamente
--   • RPCs antigas continuam funcionando via fallback
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXPANDIR client_crm_custom_fields
-- ═══════════════════════════════════════════════════════════════════════════

-- Entity type: qual entidade este campo pertence
ALTER TABLE public.client_crm_custom_fields
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'deal'
    CHECK (entity_type IN ('contact', 'deal', 'product'));

-- Migra registros existentes (todos eram usados para deals/leads)
UPDATE public.client_crm_custom_fields
SET entity_type = 'deal'
WHERE entity_type IS NULL OR entity_type = 'deal';

-- Ampliar CHECK de field_type para incluir os 10 novos tipos
DO $$
BEGIN
  ALTER TABLE public.client_crm_custom_fields
    DROP CONSTRAINT IF EXISTS client_crm_custom_fields_field_type_check;
  ALTER TABLE public.client_crm_custom_fields
    ADD CONSTRAINT client_crm_custom_fields_field_type_check
    CHECK (field_type IN (
      -- Tipos originais (5)
      'text', 'number', 'date', 'select', 'boolean',
      -- Tipos novos (10)
      'textarea',     -- texto longo
      'currency',     -- valor monetário
      'percent',      -- porcentagem
      'datetime',     -- data e hora
      'multiselect',  -- seleção múltipla
      'phone',        -- telefone com máscara
      'email',        -- e-mail com validação
      'url',          -- URL com validação
      'cpf',          -- CPF com máscara e validação
      'cnpj'          -- CNPJ com máscara e validação
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Configurações adicionais do campo
ALTER TABLE public.client_crm_custom_fields
  ADD COLUMN IF NOT EXISTS description    TEXT,          -- ajuda/tooltip exibida abaixo do campo
  ADD COLUMN IF NOT EXISTS placeholder    TEXT,          -- placeholder do input
  ADD COLUMN IF NOT EXISTS default_value  TEXT,          -- valor padrão ao criar novo registro
  ADD COLUMN IF NOT EXISTS visible        BOOLEAN NOT NULL DEFAULT true,  -- visível no formulário
  ADD COLUMN IF NOT EXISTS section        TEXT,          -- seção/grupo do formulário onde aparece
  -- Para multiselect: options já existe (JSONB array), mantém compatibilidade
  -- Para campos de texto: max_length
  ADD COLUMN IF NOT EXISTS max_length     INTEGER;

COMMENT ON COLUMN public.client_crm_custom_fields.entity_type IS
  'Entidade à qual este campo pertence: contact, deal ou product.';
COMMENT ON COLUMN public.client_crm_custom_fields.field_type IS
  'Tipos disponíveis: text, textarea, number, currency, percent, date, datetime, select, multiselect, boolean, phone, email, url, cpf, cnpj.';
COMMENT ON COLUMN public.client_crm_custom_fields.section IS
  'Seção/grupo do formulário onde o campo aparece. Ex: "Informações", "Financeiro".';
COMMENT ON COLUMN public.client_crm_custom_fields.visible IS
  'Quando false, o campo existe no banco mas não aparece no formulário.';
COMMENT ON COLUMN public.client_crm_custom_fields.default_value IS
  'Valor padrão ao criar um novo registro. Armazenado como TEXT, convertido pelo frontend.';

-- Atualizar índice para incluir entity_type
DROP INDEX IF EXISTS idx_client_crm_custom_fields_client_id;
CREATE INDEX IF NOT EXISTS idx_client_crm_custom_fields_client_entity
  ON public.client_crm_custom_fields(client_id, entity_type, "order")
  WHERE active = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EXPANDIR client_crm_custom_values — polimorfismo
-- ═══════════════════════════════════════════════════════════════════════════
-- Estratégia NÃO DESTRUTIVA:
--   • Adicionar entity_id (UUID) e entity_type (TEXT) novas colunas
--   • Migrar dados: lead_id → entity_id, entity_type = 'deal'
--   • Manter lead_id para compatibilidade (NOT DROPPED)
--   • Nova UNIQUE constraint: (field_id, entity_id, entity_type)
--   • Antiga UNIQUE (lead_id, field_id) é mantida para compatibilidade

ALTER TABLE public.client_crm_custom_values
  ADD COLUMN IF NOT EXISTS entity_id   UUID,
  ADD COLUMN IF NOT EXISTS entity_type TEXT CHECK (entity_type IN ('contact','deal','product'));

-- Migra registros existentes: lead_id → entity_id, entity_type = 'deal'
UPDATE public.client_crm_custom_values
SET
  entity_id   = lead_id,
  entity_type = 'deal'
WHERE lead_id IS NOT NULL
  AND entity_id IS NULL;

-- Nova constraint única: um valor por campo por entidade
-- Usa CREATE UNIQUE INDEX para ser idempotente (IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_custom_values_entity_field
  ON public.client_crm_custom_values(field_id, entity_id, entity_type)
  WHERE entity_id IS NOT NULL AND entity_type IS NOT NULL;

-- Índice de busca por entidade
CREATE INDEX IF NOT EXISTS idx_crm_custom_values_entity
  ON public.client_crm_custom_values(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

COMMENT ON COLUMN public.client_crm_custom_values.entity_id IS
  'ID da entidade (contact_id, deal_id ou product_id). Substitui lead_id.';
COMMENT ON COLUMN public.client_crm_custom_values.entity_type IS
  'Tipo da entidade: contact, deal ou product.';
COMMENT ON COLUMN public.client_crm_custom_values.lead_id IS
  'Mantido para compatibilidade com migration 081. Use entity_id + entity_type.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RPC: get_crm_data — atualizada para retornar campos por entidade
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_crm_data(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipelines      JSONB;
  v_stages         JSONB;
  v_contact_fields JSONB;
  v_deal_fields    JSONB;
  v_product_fields JSONB;
  -- Compatibilidade: custom_fields sem filtro (como estava antes)
  v_fields         JSONB;
BEGIN
  -- Pipelines
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

  -- Stages
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

  -- Helper para agregar campos por entity_type
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',            id,
      'name',          name,
      'field_key',     field_key,
      'field_type',    field_type,
      'entity_type',   entity_type,
      'options',       options,
      'required',      required,
      'visible',       visible,
      'order',         "order",
      'description',   description,
      'placeholder',   placeholder,
      'default_value', default_value,
      'section',       section,
      'max_length',    max_length
    ) ORDER BY entity_type, "order" ASC
  ), '[]'::jsonb)
  INTO v_fields
  FROM public.client_crm_custom_fields
  WHERE client_id = p_client_id
    AND active = true;

  -- Por entidade (para uso específico)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'field_key', field_key, 'field_type', field_type,
      'entity_type', entity_type, 'options', options, 'required', required,
      'visible', visible, 'order', "order", 'description', description,
      'placeholder', placeholder, 'default_value', default_value,
      'section', section, 'max_length', max_length
    ) ORDER BY "order" ASC
  ), '[]'::jsonb)
  INTO v_contact_fields
  FROM public.client_crm_custom_fields
  WHERE client_id = p_client_id AND active = true AND entity_type = 'contact';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'field_key', field_key, 'field_type', field_type,
      'entity_type', entity_type, 'options', options, 'required', required,
      'visible', visible, 'order', "order", 'description', description,
      'placeholder', placeholder, 'default_value', default_value,
      'section', section, 'max_length', max_length
    ) ORDER BY "order" ASC
  ), '[]'::jsonb)
  INTO v_deal_fields
  FROM public.client_crm_custom_fields
  WHERE client_id = p_client_id AND active = true AND entity_type = 'deal';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'field_key', field_key, 'field_type', field_type,
      'entity_type', entity_type, 'options', options, 'required', required,
      'visible', visible, 'order', "order", 'description', description,
      'placeholder', placeholder, 'default_value', default_value,
      'section', section, 'max_length', max_length
    ) ORDER BY "order" ASC
  ), '[]'::jsonb)
  INTO v_product_fields
  FROM public.client_crm_custom_fields
  WHERE client_id = p_client_id AND active = true AND entity_type = 'product';

  RETURN jsonb_build_object(
    'pipelines',       v_pipelines,
    'stages',          v_stages,
    -- Compatibilidade: custom_fields = todos os campos (comportamento anterior)
    'custom_fields',   v_fields,
    -- Novos: campos separados por entidade
    'contact_fields',  v_contact_fields,
    'deal_fields',     v_deal_fields,
    'product_fields',  v_product_fields
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_data(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RPC: manage_crm_custom_field — atualizada com entity_type e novos campos
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP obrigatório: a assinatura mudou (novos parâmetros p_entity_type,
-- p_description, p_placeholder, p_default_value, p_section, p_max_length).
-- O Postgres não permite CREATE OR REPLACE quando há ambiguidade de assinatura.

DROP FUNCTION IF EXISTS public.manage_crm_custom_field(UUID,TEXT,UUID,TEXT,TEXT,TEXT,JSONB,BOOLEAN,INTEGER,BOOLEAN);

CREATE OR REPLACE FUNCTION public.manage_crm_custom_field(
  p_client_id     UUID,
  p_action        TEXT,               -- 'create' | 'update' | 'delete' | 'reorder'
  p_field_id      UUID    DEFAULT NULL,
  p_name          TEXT    DEFAULT NULL,
  p_field_key     TEXT    DEFAULT NULL,
  p_field_type    TEXT    DEFAULT 'text',
  p_entity_type   TEXT    DEFAULT 'deal',  -- NOVO: 'contact' | 'deal' | 'product'
  p_options       JSONB   DEFAULT NULL,
  p_required      BOOLEAN DEFAULT false,
  p_visible       BOOLEAN DEFAULT true,
  p_order         INTEGER DEFAULT NULL,
  p_active        BOOLEAN DEFAULT true,
  p_description   TEXT    DEFAULT NULL,   -- NOVO
  p_placeholder   TEXT    DEFAULT NULL,   -- NOVO
  p_default_value TEXT    DEFAULT NULL,   -- NOVO
  p_section       TEXT    DEFAULT NULL,   -- NOVO
  p_max_length    INTEGER DEFAULT NULL    -- NOVO
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

    -- Valida entity_type
    IF p_entity_type NOT IN ('contact','deal','product') THEN
      RETURN jsonb_build_object('success', false, 'error', 'entity_type deve ser contact, deal ou product');
    END IF;

    -- Gera field_key a partir do nome se não fornecido
    v_key := COALESCE(
      NULLIF(trim(lower(p_field_key)), ''),
      lower(regexp_replace(
        translate(trim(p_name),
          'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸ',
          'aaaaaaaceeeeiiiidnoooooouuuuythaaaaaaaceeeeiiiidnoooooouuuuyyth'
        ),
        '[^a-z0-9]+', '_', 'g'
      ))
    );
    -- Trunca a 50 chars
    v_key := left(v_key, 50);

    -- Próxima ordem para esta entidade
    SELECT COALESCE(MAX("order"), -1) + 1 INTO v_next
    FROM public.client_crm_custom_fields
    WHERE client_id = p_client_id AND entity_type = p_entity_type;

    INSERT INTO public.client_crm_custom_fields (
      client_id, organization_id, name, field_key, field_type, entity_type,
      options, required, visible, "order", active,
      description, placeholder, default_value, section, max_length
    ) VALUES (
      p_client_id, v_org_id, trim(p_name), v_key, COALESCE(p_field_type,'text'),
      COALESCE(p_entity_type,'deal'),
      p_options, COALESCE(p_required, false), COALESCE(p_visible, true),
      COALESCE(p_order, v_next), true,
      p_description, p_placeholder, p_default_value, p_section, p_max_length
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'field_id', v_id);

  ELSIF p_action = 'update' THEN
    UPDATE public.client_crm_custom_fields SET
      name          = COALESCE(NULLIF(trim(p_name), ''), name),
      field_type    = COALESCE(p_field_type, field_type),
      options       = COALESCE(p_options, options),
      required      = COALESCE(p_required, required),
      visible       = COALESCE(p_visible, visible),
      "order"       = COALESCE(p_order, "order"),
      active        = COALESCE(p_active, active),
      description   = COALESCE(p_description, description),
      placeholder   = COALESCE(p_placeholder, placeholder),
      default_value = COALESCE(p_default_value, default_value),
      section       = COALESCE(p_section, section),
      max_length    = COALESCE(p_max_length, max_length),
      updated_at    = now()
    WHERE id = p_field_id AND client_id = p_client_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Campo não encontrado');
    END IF;
    RETURN jsonb_build_object('success', true, 'field_id', v_id);

  ELSIF p_action = 'delete' THEN
    -- Soft delete: preserva histórico de valores
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

GRANT EXECUTE ON FUNCTION public.manage_crm_custom_field TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RPC: save_crm_custom_values — salva valores por entidade (polimórfico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Substitui o inline custom_values do save_crm_lead.
-- p_values: [{field_id, value}]

CREATE OR REPLACE FUNCTION public.save_crm_custom_values(
  p_client_id   UUID,
  p_entity_id   UUID,
  p_entity_type TEXT,   -- 'contact' | 'deal' | 'product'
  p_values      JSONB   -- [{field_id: UUID, value: TEXT}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_count INTEGER := 0;
BEGIN
  IF p_entity_type NOT IN ('contact','deal','product') THEN
    RETURN jsonb_build_object('success', false, 'error', 'entity_type inválido');
  END IF;

  IF jsonb_array_length(COALESCE(p_values,'[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('success', true, 'saved', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_values)
  LOOP
    -- Upsert: cria ou atualiza valor por (field_id, entity_id, entity_type)
    INSERT INTO public.client_crm_custom_values
      (client_id, field_id, entity_id, entity_type, value)
    VALUES (
      p_client_id,
      (v_item->>'field_id')::UUID,
      p_entity_id,
      p_entity_type,
      v_item->>'value'
    )
    ON CONFLICT (field_id, entity_id, entity_type)
    WHERE entity_id IS NOT NULL AND entity_type IS NOT NULL
    DO UPDATE SET
      value      = EXCLUDED.value,
      updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'saved', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crm_custom_values TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RPC: get_crm_custom_values — carrega valores de uma entidade
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_crm_custom_values(
  p_client_id   UUID,
  p_entity_id   UUID,
  p_entity_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_values JSONB;
BEGIN
  SELECT COALESCE(jsonb_object_agg(
    cv.field_id::TEXT,
    cv.value
  ), '{}'::JSONB)
  INTO v_values
  FROM public.client_crm_custom_values cv
  WHERE cv.client_id   = p_client_id
    AND cv.entity_id   = p_entity_id
    AND cv.entity_type = p_entity_type;

  RETURN jsonb_build_object(
    'success', true,
    'values',  v_values   -- { "field_uuid": "valor", ... }
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_custom_values TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Atualizar view de compatibilidade crm_custom_values
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.crm_custom_fields
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_custom_fields;

CREATE OR REPLACE VIEW public.crm_custom_values
WITH (security_invoker = true) AS
SELECT * FROM public.client_crm_custom_values;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Versão
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.schema_migrations (version)
VALUES ('095_crm_custom_fields_v2')
ON CONFLICT (version) DO NOTHING;
