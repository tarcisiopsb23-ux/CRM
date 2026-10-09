-- ============================================================
-- Migration 064: Módulos contratáveis do C8 Control
-- Execute no Supabase da AGÊNCIA (Banco A)
--
-- Viabiliza contratação direta de módulos individuais:
--   • c8_modules       — catálogo de módulos disponíveis
--   • c8_module_plans  — preços e configurações por módulo
--   • client_modules   — módulos contratados por cliente
--
-- A flag modules_config no cliente continua sendo a fonte de
-- verdade para o frontend. Esta migration adiciona a camada
-- comercial que alimenta modules_config automaticamente.
-- ============================================================

-- ─── 1. Catálogo de módulos ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.c8_modules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL UNIQUE,
  name            TEXT        NOT NULL,
  description     TEXT,
  icon            TEXT,                        -- nome do ícone lucide-react
  -- Flag que este módulo ativa no modules_config do cliente
  modules_config_key TEXT     NOT NULL,        -- ex: 'agenda_enabled', 'crm_enabled'
  -- Visibilidade
  available       BOOLEAN     NOT NULL DEFAULT true,
  featured        BOOLEAN     NOT NULL DEFAULT false,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed dos módulos disponíveis
INSERT INTO public.c8_modules (slug, name, description, icon, modules_config_key, featured, sort_order)
VALUES
  ('dashboard',  'C8 Control Dashboard',  'Painel completo de resultados, performance e atendimento.',     'LayoutDashboard', 'dashboard_enabled',  true,  1),
  ('crm',        'C8 Control CRM',         'Gestão de contatos, pipeline de vendas e produtos.',            'Users',           'crm_enabled',        true,  2),
  ('agenda',     'C8 Control Agenda',      'Agendamentos online com página pública e Google Calendar.',     'CalendarDays',    'agenda_enabled',     true,  3),
  ('bot',        'C8 Control Bot',         'Agente de IA para WhatsApp com conteúdo gerado automaticamente.','Bot',            'ia_enabled',         true,  4),
  ('whatsapp',   'C8 Control WhatsApp',    'Integração com WhatsApp Business para gestão de conversas.',   'MessageCircle',   'whatsapp_enabled',   false, 5),
  ('completo',   'C8 Control Completo',    'Todos os módulos incluídos com desconto.',                      'Zap',             'all_modules',        true,  0)
ON CONFLICT (slug) DO UPDATE SET
  name               = EXCLUDED.name,
  description        = EXCLUDED.description,
  modules_config_key = EXCLUDED.modules_config_key,
  featured           = EXCLUDED.featured,
  sort_order         = EXCLUDED.sort_order,
  updated_at         = now();

-- ─── 2. Planos de preço por módulo ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.c8_module_plans (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id       UUID          NOT NULL REFERENCES public.c8_modules(id) ON DELETE CASCADE,
  name            TEXT          NOT NULL,        -- ex: 'Mensal', 'Anual'
  billing_cycle   TEXT          NOT NULL DEFAULT 'monthly'
                  CHECK (billing_cycle IN ('monthly','yearly','one_time')),
  price_brl       NUMERIC(10,2) NOT NULL,
  -- Módulos incluídos neste plano (para plano 'completo')
  includes_modules TEXT[]       DEFAULT '{}',
  -- Limites por plano
  max_appointments_month INTEGER DEFAULT NULL,   -- null = ilimitado
  max_contacts     INTEGER       DEFAULT NULL,
  max_users        INTEGER       DEFAULT 5,
  -- Asaas
  asaas_plan_id   TEXT,                          -- ID do plano no Asaas para cobrança recorrente
  active          BOOLEAN        NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_module_plans_module_id
  ON public.c8_module_plans(module_id);

-- ─── 3. Módulos contratados por cliente ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_modules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_id       UUID        NOT NULL REFERENCES public.c8_modules(id) ON DELETE CASCADE,
  plan_id         UUID        REFERENCES public.c8_module_plans(id) ON DELETE SET NULL,
  -- Estado
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','cancelled','trial')),
  -- Vigência
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,                   -- null = sem vencimento (vitalício/manual)
  trial_ends_at   TIMESTAMPTZ,
  -- Cobrança
  asaas_subscription_id TEXT,                    -- ID da assinatura no Asaas
  billing_cycle   TEXT        DEFAULT 'monthly',
  next_billing_at TIMESTAMPTZ,
  -- Origem da contratação
  contracted_by   TEXT        NOT NULL DEFAULT 'agency'
                  CHECK (contracted_by IN ('agency','client','site')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, module_id)                  -- um módulo por cliente
);

CREATE INDEX IF NOT EXISTS idx_client_modules_client_id
  ON public.client_modules(client_id);
CREATE INDEX IF NOT EXISTS idx_client_modules_status
  ON public.client_modules(status);
CREATE INDEX IF NOT EXISTS idx_client_modules_expires_at
  ON public.client_modules(expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE public.client_modules IS
  'Módulos do C8 Control contratados por cada cliente. Status active = acesso liberado.';
COMMENT ON COLUMN public.client_modules.contracted_by IS
  'agency = ativado pela agência manualmente | client = autocontratação | site = checkout do site';

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.c8_modules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.c8_module_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_modules  ENABLE ROW LEVEL SECURITY;

-- Módulos e planos: leitura pública (exibidos no site de vendas)
DROP POLICY IF EXISTS "public_read_modules"      ON public.c8_modules;
DROP POLICY IF EXISTS "public_read_module_plans" ON public.c8_module_plans;
CREATE POLICY "public_read_modules"
  ON public.c8_modules FOR SELECT USING (available = true);
CREATE POLICY "public_read_module_plans"
  ON public.c8_module_plans FOR SELECT USING (active = true);

-- Escrita restrita a authenticated (equipe interna via painel)
DROP POLICY IF EXISTS "auth_write_modules"       ON public.c8_modules;
DROP POLICY IF EXISTS "auth_write_module_plans"  ON public.c8_module_plans;
CREATE POLICY "auth_write_modules"
  ON public.c8_modules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_write_module_plans"
  ON public.c8_module_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Módulos do cliente: acesso autenticado
DROP POLICY IF EXISTS "auth_client_modules" ON public.client_modules;
CREATE POLICY "auth_client_modules"
  ON public.client_modules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 5. Trigger updated_at ───────────────────────────────────────────────────

DO $trg$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['c8_modules','c8_module_plans','client_modules'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $trg$;

-- ─── 6. RPC: sincronizar modules_config ao ativar/desativar módulo ───────────
-- Chamada sempre que client_modules muda. Atualiza modules_config do cliente.

CREATE OR REPLACE FUNCTION public.sync_client_modules_config(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config    JSONB := '{}'::JSONB;
  v_mod_key   TEXT;
  v_is_active BOOLEAN;
BEGIN
  -- Para cada módulo existente no catálogo, verifica se o cliente tem ativo
  FOR v_mod_key IN
    SELECT DISTINCT m.modules_config_key
    FROM public.c8_modules m
    WHERE m.modules_config_key <> 'all_modules'
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.client_modules cm
      JOIN public.c8_modules m ON m.id = cm.module_id
      WHERE cm.client_id = p_client_id
        AND cm.status    = 'active'
        AND m.modules_config_key = v_mod_key
        AND (cm.expires_at IS NULL OR cm.expires_at > now())
    ) INTO v_is_active;

    v_config := v_config || jsonb_build_object(v_mod_key, v_is_active);
  END LOOP;

  -- Caso especial: plano 'completo' ativa tudo
  IF EXISTS (
    SELECT 1 FROM public.client_modules cm
    JOIN public.c8_modules m ON m.id = cm.module_id
    WHERE cm.client_id = p_client_id
      AND cm.status    = 'active'
      AND m.slug       = 'completo'
      AND (cm.expires_at IS NULL OR cm.expires_at > now())
  ) THEN
    v_config := jsonb_build_object(
      'dashboard_enabled', true,
      'crm_enabled',       true,
      'agenda_enabled',    true,
      'ia_enabled',        true,
      'whatsapp_enabled',  true
    );
  END IF;

  -- Persiste no campo modules_config do cliente (tabela clients ou crm_client_plans)
  UPDATE public.crm_client_plans SET
    modules_config = modules_config || v_config
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object('success', true, 'modules_config', v_config);
END;
$$;

-- 7. RPC: ativar módulo para cliente (chamada pelo painel da agência ou n8n)
CREATE OR REPLACE FUNCTION public.activate_client_module(
  p_client_id      UUID,
  p_module_slug    TEXT,
  p_plan_id        UUID    DEFAULT NULL,
  p_contracted_by  TEXT    DEFAULT 'agency',
  p_expires_at     TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module_id UUID;
  v_org_id    UUID;
  v_id        UUID;
BEGIN
  SELECT id INTO v_module_id FROM public.c8_modules WHERE slug = p_module_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Módulo não encontrado: ' || p_module_slug);
  END IF;

  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  INSERT INTO public.client_modules (
    client_id, organization_id, module_id, plan_id,
    status, contracted_by, expires_at, started_at
  ) VALUES (
    p_client_id, v_org_id, v_module_id, p_plan_id,
    'active', p_contracted_by, p_expires_at, now()
  )
  ON CONFLICT (client_id, module_id) DO UPDATE SET
    status         = 'active',
    plan_id        = COALESCE(EXCLUDED.plan_id, client_modules.plan_id),
    contracted_by  = EXCLUDED.contracted_by,
    expires_at     = EXCLUDED.expires_at,
    updated_at     = now()
  RETURNING id INTO v_id;

  -- Sincroniza modules_config
  PERFORM public.sync_client_modules_config(p_client_id);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- 8. RPC: listar módulos disponíveis (para página de vendas/checkout)
CREATE OR REPLACE FUNCTION public.get_available_modules()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',          m.id,
      'slug',        m.slug,
      'name',        m.name,
      'description', m.description,
      'icon',        m.icon,
      'featured',    m.featured,
      'plans',       (
        SELECT jsonb_agg(jsonb_build_object(
          'id',            p.id,
          'name',          p.name,
          'billing_cycle', p.billing_cycle,
          'price_brl',     p.price_brl,
          'max_users',     p.max_users
        ) ORDER BY p.price_brl)
        FROM public.c8_module_plans p
        WHERE p.module_id = m.id AND p.active = true
      )
    ) ORDER BY m.sort_order
  ) INTO v_rows
  FROM public.c8_modules m
  WHERE m.available = true;

  RETURN COALESCE(v_rows, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_modules()                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_client_modules_config(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_client_module(UUID,TEXT,UUID,TEXT,TIMESTAMPTZ) TO authenticated;
