-- ============================================================
-- Migration 042: Adiciona modules_config à crm_client_plans (Banco A)
-- Execute no Supabase da AGÊNCIA
--
-- modules_config é o campo JSONB que controla quais módulos cada
-- cliente pode acessar no Public Dashboard. Lido pelo layout na
-- inicialização e usado para ocultar/exibir seções condicionalmente.
-- ============================================================

ALTER TABLE public.crm_client_plans
  ADD COLUMN IF NOT EXISTS modules_config JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.crm_client_plans.modules_config IS
  'Configuração de módulos do Public Dashboard por cliente. Estrutura: '
  '{ crm_enabled, whatsapp_enabled, demographics_enabled, ia_enabled, '
  'max_contacts, max_users, asaas_enabled, pixel_config: { meta_pixel_id, google_tag_id } }';

-- Backfill: popula modules_config baseado nos dados já existentes
UPDATE public.crm_client_plans
SET modules_config = jsonb_build_object(
  'crm_enabled',           true,
  'whatsapp_enabled',      false,
  'demographics_enabled',  false,
  'ia_enabled',            COALESCE('ia' = ANY(modules), false),
  'max_contacts',          5000,
  'max_users',             max_users,
  'asaas_enabled',         false,
  'pixel_config',          jsonb_build_object('meta_pixel_id', '', 'google_tag_id', '')
)
WHERE modules_config = '{}'::JSONB;

-- Índice para queries por features habilitadas
CREATE INDEX IF NOT EXISTS idx_crm_client_plans_modules_config
  ON public.crm_client_plans USING GIN (modules_config);
