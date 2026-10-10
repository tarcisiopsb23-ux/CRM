-- =============================================================================
-- Migration 096: CRM — Campos padrão configuráveis + Histórico de atividades
--
-- 1. client_crm_field_config   — ativar/desativar/reordenar campos padrão por tenant
-- 2. client_crm_activities     — histórico de alterações e atividades do CRM
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. client_crm_field_config — configuração de campos padrão por tenant
-- ═══════════════════════════════════════════════════════════════════════════
-- Permite ao admin do tenant ativar/desativar campos padrão e definir
-- obrigatoriedade. Campos estruturais (id, client_id, created_at etc.)
-- nunca são expostos aqui — só campos visíveis ao usuário final.

CREATE TABLE IF NOT EXISTS public.client_crm_field_config (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identifica qual campo padrão esta configuração cobre
  entity_type     TEXT        NOT NULL CHECK (entity_type IN ('contact','deal','product')),
  field_key       TEXT        NOT NULL,   -- chave do campo padrão: "cpf", "address", "probability"

  -- Configuração do tenant para este campo
  active          BOOLEAN     NOT NULL DEFAULT true,   -- campo aparece nos formulários
  required        BOOLEAN     NOT NULL DEFAULT false,  -- obrigatório no formulário
  "order"         INTEGER     NOT NULL DEFAULT 0,      -- posição no formulário
  label_override  TEXT,                                -- label personalizada (NULL = usa padrão)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (client_id, entity_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_field_config_client_entity
  ON public.client_crm_field_config(client_id, entity_type);

ALTER TABLE public.client_crm_field_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.client_crm_field_config;
CREATE POLICY "authenticated_access"
  ON public.client_crm_field_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "no_anon_access" ON public.client_crm_field_config;
CREATE POLICY "no_anon_access"
  ON public.client_crm_field_config FOR ALL TO anon
  USING (false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_field_config_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_crm_field_config_updated_at
      BEFORE UPDATE ON public.client_crm_field_config
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

COMMENT ON TABLE public.client_crm_field_config IS
  'Configuração de campos padrão do CRM por tenant. Controla visibilidade, obrigatoriedade e ordem.';
COMMENT ON COLUMN public.client_crm_field_config.field_key IS
  'Chave do campo padrão conforme definido no frontend (ex: cpf, zip_code, probability).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. client_crm_activities — histórico de atividades e alterações
-- ═══════════════════════════════════════════════════════════════════════════
-- Registra alterações relevantes em contatos e deals.
-- Não duplica o sistema de audit_logs da agência — este é específico
-- para o histórico visível ao usuário do C8 Control dentro do CRM.

CREATE TABLE IF NOT EXISTS public.client_crm_activities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Entidade relacionada
  entity_type     TEXT        NOT NULL CHECK (entity_type IN ('contact','deal','product')),
  entity_id       UUID        NOT NULL,

  -- Tipo de atividade
  activity_type   TEXT        NOT NULL,
  -- Exemplos:
  --   stage_changed, status_changed, responsible_changed
  --   deal_won, deal_lost, deal_created
  --   contact_created, contact_updated, note_added
  --   call, meeting, email_sent, whatsapp_sent, task

  -- Dados da alteração
  title           TEXT,                   -- resumo legível: "Etapa alterada: Proposta → Fechado"
  description     TEXT,                   -- detalhes livres
  old_value       TEXT,                   -- valor anterior (quando aplicável)
  new_value       TEXT,                   -- valor novo (quando aplicável)
  field_key       TEXT,                   -- campo que foi alterado

  -- Quem realizou
  performed_by    UUID,                   -- dashboard_users(id) — NULL se automático
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Metadados extras (JSON livre)
  metadata        JSONB       DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_entity
  ON public.client_crm_activities(entity_type, entity_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_client
  ON public.client_crm_activities(client_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type
  ON public.client_crm_activities(client_id, activity_type, performed_at DESC);

ALTER TABLE public.client_crm_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.client_crm_activities;
CREATE POLICY "authenticated_access"
  ON public.client_crm_activities FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "no_anon_access" ON public.client_crm_activities;
CREATE POLICY "no_anon_access"
  ON public.client_crm_activities FOR ALL TO anon
  USING (false);

COMMENT ON TABLE public.client_crm_activities IS
  'Histórico de atividades e alterações do CRM por contato/deal. Visível ao usuário do C8 Control.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RPC: log_crm_activity — registra uma atividade
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_crm_activity(
  p_client_id     UUID,
  p_entity_type   TEXT,
  p_entity_id     UUID,
  p_activity_type TEXT,
  p_title         TEXT    DEFAULT NULL,
  p_description   TEXT    DEFAULT NULL,
  p_old_value     TEXT    DEFAULT NULL,
  p_new_value     TEXT    DEFAULT NULL,
  p_field_key     TEXT    DEFAULT NULL,
  p_performed_by  UUID    DEFAULT NULL,
  p_metadata      JSONB   DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  INSERT INTO public.client_crm_activities (
    client_id, organization_id, entity_type, entity_id,
    activity_type, title, description, old_value, new_value,
    field_key, performed_by, metadata
  ) VALUES (
    p_client_id, v_org_id, p_entity_type, p_entity_id,
    p_activity_type, p_title, p_description, p_old_value, p_new_value,
    p_field_key, p_performed_by, COALESCE(p_metadata, '{}')
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_crm_activity TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RPC: get_crm_activities — retorna histórico de uma entidade
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_crm_activities(
  p_client_id   UUID,
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_limit       INTEGER DEFAULT 50,
  p_offset      INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',            a.id,
      'activity_type', a.activity_type,
      'title',         a.title,
      'description',   a.description,
      'old_value',     a.old_value,
      'new_value',     a.new_value,
      'field_key',     a.field_key,
      'performed_by',  a.performed_by,
      'performed_at',  a.performed_at,
      'metadata',      a.metadata
    ) ORDER BY a.performed_at DESC
  ), '[]'::JSONB)
  INTO v_rows
  FROM public.client_crm_activities a
  WHERE a.client_id   = p_client_id
    AND a.entity_type = p_entity_type
    AND a.entity_id   = p_entity_id
  LIMIT p_limit OFFSET p_offset;

  RETURN jsonb_build_object('activities', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_activities TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RPC: get_crm_field_config — retorna configuração de campos para uma entidade
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_crm_field_config(
  p_client_id   UUID,
  p_entity_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'field_key',      field_key,
      'active',         active,
      'required',       required,
      'order',          "order",
      'label_override', label_override
    ) ORDER BY "order"
  ), '[]'::JSONB)
  INTO v_rows
  FROM public.client_crm_field_config
  WHERE client_id   = p_client_id
    AND entity_type = p_entity_type;

  RETURN jsonb_build_object('fields', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_field_config TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RPC: upsert_crm_field_config — configura um campo padrão
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_crm_field_config(
  p_client_id      UUID,
  p_entity_type    TEXT,
  p_field_key      TEXT,
  p_active         BOOLEAN DEFAULT true,
  p_required       BOOLEAN DEFAULT false,
  p_order          INTEGER DEFAULT 0,
  p_label_override TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  INSERT INTO public.client_crm_field_config
    (client_id, organization_id, entity_type, field_key, active, required, "order", label_override)
  VALUES
    (p_client_id, v_org_id, p_entity_type, p_field_key,
     p_active, p_required, p_order, p_label_override)
  ON CONFLICT (client_id, entity_type, field_key)
  DO UPDATE SET
    active         = EXCLUDED.active,
    required       = EXCLUDED.required,
    "order"        = EXCLUDED."order",
    label_override = EXCLUDED.label_override,
    updated_at     = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_crm_field_config TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Versão
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.schema_migrations (version)
VALUES ('096_crm_field_config_and_activities_v1')
ON CONFLICT (version) DO NOTHING;
