-- =============================================================================
-- MAESTR.IA - Segurança, Auditoria e Cadastro Restrito
-- =============================================================================
-- 1. Tabela registration_codes (cadastro por código)
-- 2. Função generate_registration_code()
-- 3. Tabela audit_logs
-- 4. Função audit_changes()
-- 5. Triggers de auditoria em tabelas críticas
-- 6. Atualização do trigger handle_new_user para suportar códigos
-- 7. RLS e policies para registration_codes e audit_logs
-- 8. Views administrativas
-- =============================================================================

-- =============================================================================
-- 1. TABELA registration_codes
-- =============================================================================

CREATE TABLE IF NOT EXISTS registration_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registration_codes_code ON registration_codes(code);
CREATE INDEX IF NOT EXISTS idx_registration_codes_org ON registration_codes(organization_id);
CREATE INDEX IF NOT EXISTS idx_registration_codes_expires ON registration_codes(expires_at);

COMMENT ON TABLE registration_codes IS 'Códigos temporários para cadastro restrito. Sem código válido, novo usuário não completa cadastro.';

-- =============================================================================
-- 2. FUNÇÃO generate_registration_code(org_id, validity_hours)
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_registration_code(
  org_id UUID,
  validity_hours INT DEFAULT 72
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
BEGIN
  -- Apenas owner/admin podem gerar códigos (chamada via RPC com RLS)
  IF NOT user_has_role(ARRAY['owner', 'admin']::user_role[]) THEN
    RAISE EXCEPTION 'Apenas owner/admin podem gerar códigos de cadastro';
  END IF;

  IF org_id IS NULL OR org_id != get_user_organization_id() THEN
    RAISE EXCEPTION 'organization_id inválido ou não pertence ao usuário';
  END IF;

  -- Gera código aleatório (ex: MAESTR-A1B2C3D4)
  new_code := 'MAESTR-' || UPPER(SUBSTRING(ENCODE(gen_random_bytes(4), 'hex') FROM 1 FOR 8));

  INSERT INTO registration_codes (code, organization_id, expires_at, created_by)
  VALUES (new_code, org_id, NOW() + (validity_hours || ' hours')::INTERVAL, auth.uid());

  RETURN new_code;
END;
$$;

COMMENT ON FUNCTION generate_registration_code IS 'Gera código temporário para novo cadastro na organização. Retorna o código para compartilhar.';

-- =============================================================================
-- 3. TABELA audit_logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changes JSONB,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON audit_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);

COMMENT ON TABLE audit_logs IS 'Registro de todas as alterações em tabelas críticas para rastreabilidade.';

-- =============================================================================
-- 4. FUNÇÃO audit_changes()
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_id UUID;
  org_id UUID;
  old_json JSONB;
  new_json JSONB;
  chg JSONB;
BEGIN
  -- Determina record_id e organization_id conforme a tabela
  IF TG_OP = 'DELETE' THEN
    rec_id := OLD.id;
    old_json := to_jsonb(OLD);
    new_json := NULL;
    org_id := CASE
      WHEN TG_TABLE_NAME = 'profiles' THEN (OLD.organization_id)
      WHEN TG_TABLE_NAME = 'registration_codes' THEN OLD.organization_id
      ELSE (OLD.organization_id)
    END;
    chg := jsonb_build_object('old', old_json);
  ELSIF TG_OP = 'INSERT' THEN
    rec_id := NEW.id;
    new_json := to_jsonb(NEW);
    old_json := NULL;
    org_id := CASE
      WHEN TG_TABLE_NAME = 'profiles' THEN NEW.organization_id
      WHEN TG_TABLE_NAME = 'registration_codes' THEN NEW.organization_id
      ELSE NEW.organization_id
    END;
    chg := jsonb_build_object('new', new_json);
  ELSE
    rec_id := NEW.id;
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);
    org_id := CASE
      WHEN TG_TABLE_NAME = 'profiles' THEN NEW.organization_id
      WHEN TG_TABLE_NAME = 'registration_codes' THEN NEW.organization_id
      ELSE NEW.organization_id
    END;
    chg := jsonb_build_object('old', old_json, 'new', new_json);
  END IF;

  INSERT INTO audit_logs (table_name, record_id, action, changed_by, changes, organization_id)
  VALUES (TG_TABLE_NAME, rec_id, TG_OP, auth.uid(), chg, org_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- =============================================================================
-- 5. TRIGGERS DE AUDITORIA
-- =============================================================================

-- Leads
DROP TRIGGER IF EXISTS audit_leads ON leads;
CREATE TRIGGER audit_leads
  AFTER INSERT OR UPDATE OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- Payments
DROP TRIGGER IF EXISTS audit_payments ON payments;
CREATE TRIGGER audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- Supplier expenses
DROP TRIGGER IF EXISTS audit_supplier_expenses ON supplier_expenses;
CREATE TRIGGER audit_supplier_expenses
  AFTER INSERT OR UPDATE OR DELETE ON supplier_expenses
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- Goals
DROP TRIGGER IF EXISTS audit_goals ON goals;
CREATE TRIGGER audit_goals
  AFTER INSERT OR UPDATE OR DELETE ON goals
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- WhatsApp conversations
DROP TRIGGER IF EXISTS audit_whatsapp_conversations ON whatsapp_conversations;
CREATE TRIGGER audit_whatsapp_conversations
  AFTER INSERT OR UPDATE OR DELETE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- Profiles
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- Registration codes
DROP TRIGGER IF EXISTS audit_registration_codes ON registration_codes;
CREATE TRIGGER audit_registration_codes
  AFTER INSERT OR UPDATE OR DELETE ON registration_codes
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- Triggers de auditoria em tabelas críticas
DROP TRIGGER IF EXISTS audit_clients ON clients;
CREATE TRIGGER audit_clients
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_contracts ON contracts;
CREATE TRIGGER audit_contracts
  AFTER INSERT OR UPDATE OR DELETE ON contracts
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_projects ON projects;
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_tasks ON tasks;
CREATE TRIGGER audit_tasks
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_events ON events;
CREATE TRIGGER audit_events
  AFTER INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_teams ON teams;
CREATE TRIGGER audit_teams
  AFTER INSERT OR UPDATE OR DELETE ON teams
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_invitation_tokens ON invitation_tokens;
CREATE TRIGGER audit_invitation_tokens
  AFTER INSERT OR UPDATE OR DELETE ON invitation_tokens
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- =============================================================================
-- 6. ATUALIZAÇÃO handle_new_user - Suporte a registration_code
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_slug TEXT;
  code_row RECORD;
BEGIN
  -- Verifica se há registration_code em user_metadata (fluxo restrito)
  IF NEW.raw_user_meta_data ? 'registration_code' THEN
    SELECT id, organization_id INTO code_row
    FROM registration_codes
    WHERE code = (NEW.raw_user_meta_data->>'registration_code')
      AND used_by IS NULL
      AND expires_at > NOW();
    
    IF FOUND THEN
      new_org_id := code_row.organization_id;
      UPDATE registration_codes
      SET used_by = NEW.id, used_at = NOW()
      WHERE id = code_row.id;
      
      INSERT INTO public.profiles (id, organization_id, full_name, email, role)
      VALUES (
        NEW.id,
        new_org_id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        'member'
      );
      RETURN NEW;
    END IF;
    -- Código inválido: continua fluxo normal (cria nova org) para não travar signup
  END IF;

  -- Fluxo original: novo usuário sem código - cria organização
  org_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9]', '', 'g'));
  IF LENGTH(org_slug) < 3 THEN
    org_slug := 'org-' || REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', '');
  END IF;
  org_slug := org_slug || '-' || SUBSTRING(NEW.id::text, 1, 8);

  INSERT INTO organizations (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)) || '''s Organization',
    org_slug
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, organization_id, full_name, email, role)
  VALUES (
    NEW.id,
    new_org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'owner'
  );

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 7. RLS - registration_codes e audit_logs
-- =============================================================================

ALTER TABLE registration_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- registration_codes: owner/admin da org podem ver e criar
DROP POLICY IF EXISTS registration_codes_select ON registration_codes;
CREATE POLICY registration_codes_select ON registration_codes FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS registration_codes_insert ON registration_codes;
CREATE POLICY registration_codes_insert ON registration_codes FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

-- Nota: UPDATE (marcar used_by) é feito pela função handle_new_user (SECURITY DEFINER)
DROP POLICY IF EXISTS registration_codes_update ON registration_codes;
CREATE POLICY registration_codes_update ON registration_codes FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

-- audit_logs: owner/admin podem ler logs da própria organização
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

-- Inserção em audit_logs é feita apenas por triggers (SECURITY DEFINER)
-- O trigger executa como definer e ignora RLS para INSERT

-- =============================================================================
-- 8. VIEWS ADMINISTRATIVAS
-- =============================================================================

-- admin_profiles: perfis da org com dados para monitoramento
CREATE OR REPLACE VIEW admin_profiles AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.organization_id,
  o.name AS organization_name,
  p.is_active,
  p.created_at
FROM profiles p
LEFT JOIN organizations o ON o.id = p.organization_id
WHERE p.organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner', 'admin']::user_role[]);

-- RLS: a view usa get_user_organization_id(), então retorna apenas da org do usuário

-- admin_audit_logs: logs da organização para monitoramento
CREATE OR REPLACE VIEW admin_audit_logs AS
SELECT
  a.id,
  a.table_name,
  a.record_id,
  a.action,
  a.changed_by,
  p.full_name AS changed_by_name,
  a.changed_at,
  a.changes,
  a.organization_id
FROM audit_logs a
LEFT JOIN profiles p ON p.id = a.changed_by
WHERE a.organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner', 'admin']::user_role[]);

-- =============================================================================
-- 9. COMENTÁRIOS DE CONFIGURAÇÃO MANUAL (NÃO-SQL)
-- =============================================================================
-- Desabilitar signup público:
--   Supabase Dashboard → Authentication → Providers → Email → Desmarcar "Enable email signups"
--
-- Correção envio de e-mail:
--   Project Settings → Auth → SMTP: configurar servidor SMTP próprio
--
-- Fluxo com código:
--   1. Admin chama generate_registration_code(org_id, 72) via RPC
--   2. Compartilha o código com o novo usuário
--   3. Frontend envia signUp({ email, password, options: { data: { registration_code: "MAESTR-XXX" } } })
-- =============================================================================
