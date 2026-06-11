-- ============================================================
-- Migration 041: Trigger de sincronização auth.users → crm_users (Banco B)
-- Execute no Supabase de CADA CLIENTE (Banco B)
--
-- Quando um usuário é criado/atualizado no Supabase Auth do Banco B,
-- este trigger mantém crm_users sincronizado automaticamente.
--
-- O campo client_id é lido dos metadados do usuário (user_metadata.client_id)
-- que deve ser definido pela Edge Function ao criar o convite.
-- ============================================================

-- ── Função: sincroniza auth.users → crm_users ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_crm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id TEXT;
  v_role      TEXT;
  v_full_name TEXT;
BEGIN
  -- Extrai metadados do JWT payload
  v_client_id := COALESCE(
    (NEW.raw_user_meta_data ->> 'client_id'),
    (NEW.raw_app_meta_data  ->> 'client_id')
  );
  v_role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role'),
    (NEW.raw_app_meta_data  ->> 'role'),
    'member'
  );
  v_full_name := COALESCE(
    (NEW.raw_user_meta_data ->> 'full_name'),
    (NEW.raw_user_meta_data ->> 'name'),
    split_part(NEW.email, '@', 1)
  );

  -- Sem client_id nos metadados: não sincroniza (usuário órfão)
  IF v_client_id IS NULL OR v_client_id = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.crm_users (
    id,
    client_id,
    email,
    full_name,
    role,
    active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_client_id,
    NEW.email,
    v_full_name,
    v_role,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    full_name  = COALESCE(EXCLUDED.full_name, crm_users.full_name),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- ── Registra o trigger na tabela auth.users ───────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_auth_user ON auth.users;
CREATE TRIGGER trg_sync_auth_user
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data, raw_app_meta_data
  ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_to_crm();

-- ── Trigger extra: atualiza last_seen_at quando usuário faz login ──────────────
CREATE OR REPLACE FUNCTION public.update_crm_user_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- last_sign_in_at muda a cada login
  IF OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at AND NEW.last_sign_in_at IS NOT NULL THEN
    UPDATE public.crm_users
    SET last_seen_at = NEW.last_sign_in_at,
        updated_at   = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_user_last_seen ON auth.users;
CREATE TRIGGER trg_crm_user_last_seen
  AFTER UPDATE OF last_sign_in_at
  ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_crm_user_last_seen();

-- ── Backfill: sincroniza usuários auth existentes que não têm crm_users ──────
-- (executar manualmente uma vez após aplicar esta migration)
-- INSERT INTO public.crm_users (id, client_id, email, full_name, role, active)
-- SELECT
--   u.id,
--   COALESCE(u.raw_user_meta_data ->> 'client_id', u.raw_app_meta_data ->> 'client_id'),
--   u.email,
--   COALESCE(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
--   COALESCE(u.raw_user_meta_data ->> 'role', 'member'),
--   true
-- FROM auth.users u
-- WHERE NOT EXISTS (SELECT 1 FROM public.crm_users c WHERE c.id = u.id)
--   AND (u.raw_user_meta_data ->> 'client_id') IS NOT NULL;

-- Registra versão
INSERT INTO public.schema_migrations (version) VALUES ('041')
ON CONFLICT (version) DO NOTHING;
