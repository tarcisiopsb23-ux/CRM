-- =============================================================================
-- Migration 124: Content Operations — Permissões
-- Banco A — Idempotente
--
-- Adiciona o módulo 'content_ops' ao enum permission_module.
-- Esse enum é usado pela tabela user_permissions e pelos hooks
-- usePermissions.ts e ModuleGuard no frontend.
--
-- Também documenta o campo content_ops_enabled em clients.modules_config
-- via um COMMENT (a validação real é feita no frontend e nas RPCs).
-- =============================================================================

-- ─── 1. Adiciona content_ops ao enum permission_module ───────────────────────
-- Verifica se o enum existe antes de tentar adicionar o valor.

DO $migration$
DECLARE
  v_enum_exists BOOLEAN;
BEGIN
  -- Verifica se o tipo permission_module existe como enum
  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'permission_module'
      AND t.typtype = 'e'
  ) INTO v_enum_exists;

  IF v_enum_exists THEN
    -- Adiciona content_ops se não existir
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'permission_module'
        AND e.enumlabel = 'content_ops'
    ) THEN
      ALTER TYPE public.permission_module ADD VALUE IF NOT EXISTS 'content_ops';
      RAISE NOTICE 'Valor content_ops adicionado ao enum permission_module.';
    ELSE
      RAISE NOTICE 'Valor content_ops já existe no enum permission_module — sem alteração.';
    END IF;
  ELSE
    RAISE NOTICE 'Enum permission_module não encontrado — módulo content_ops deve ser adicionado manualmente quando o enum for criado.';
  END IF;
END $migration$;

-- ─── 2. Comentário documentando content_ops_enabled em modules_config ────────
-- O campo modules_config é JSONB em public.clients.
-- Documentamos o novo campo esperado via COMMENT no schema.

DO $comment$
BEGIN
  -- Tenta adicionar comentário à coluna modules_config se ela existir
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'clients'
      AND column_name  = 'modules_config'
  ) THEN
    COMMENT ON COLUMN public.clients.modules_config IS
      'Configuração de módulos disponíveis para o cliente no C8 Control.
       Campos boolean esperados:
         crm_enabled             — módulo CRM
         whatsapp_enabled        — módulo WhatsApp (legado)
         demographics_enabled    — dados demográficos
         ia_enabled              — IA legada
         agenda_enabled          — módulo Agenda
         dashboard_enabled       — dashboard de performance
         messaging_enabled       — módulo Mensagens
         automation_enabled      — módulo Chatbot
         content_ops_enabled     — módulo Gestão de Conteúdo (Content Operations)
       Outros campos:
         max_contacts, max_users — limites do plano
         pixel_config            — configuração de pixel
         c8_free_access          — acesso gratuito
         c8_included             — incluído no contrato pai';
  END IF;
END $comment$;

-- ─── 3. Garante que a tabela user_permissions aceita content_ops ──────────────
-- Se user_permissions usa o enum permission_module, a adição no passo 1 já resolve.
-- Se usa TEXT, não há o que fazer aqui.

-- ─── 4. RPC auxiliar: check_content_ops_permission ───────────────────────────
-- Verifica se o usuário autenticado tem permissão no módulo content_ops.
-- Usado pelos guards do frontend como alternativa a user_permissions quando
-- o módulo ainda não foi inserido via UI.

CREATE OR REPLACE FUNCTION public.check_content_ops_permission(
  p_user_id       UUID,
  p_permission    TEXT DEFAULT 'can_view'   -- 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    UUID;
  v_role      TEXT;
  v_has_perm  BOOLEAN;
BEGIN
  -- Busca a organização e o role do usuário
  SELECT organization_id, role INTO v_org_id, v_role
  FROM public.profiles
  WHERE id = p_user_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Owner e Admin têm acesso total por padrão
  IF v_role IN ('owner','admin') THEN
    RETURN true;
  END IF;

  -- Verifica em user_permissions
  EXECUTE format(
    'SELECT %I FROM public.user_permissions
     WHERE user_id = $1
       AND organization_id = $2
       AND module = $3
     LIMIT 1',
    p_permission
  )
  INTO v_has_perm
  USING p_user_id, v_org_id, 'content_ops';

  RETURN COALESCE(v_has_perm, false);
END;
$$;

COMMENT ON FUNCTION public.check_content_ops_permission IS
  'Verifica permissão do usuário no módulo content_ops.
   Owner e Admin têm acesso total por padrão.
   Outros roles dependem de registro em user_permissions.';

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('124_content_ops_permissions')
ON CONFLICT (version) DO NOTHING;
