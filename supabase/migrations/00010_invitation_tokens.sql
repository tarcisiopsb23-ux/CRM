-- =============================================================================
-- MAESTR.IA - Convite por e-mail com token (substitui registration_codes)
-- =============================================================================
-- Admin informa e-mail → sistema gera token e envia link por e-mail
-- Convidado acessa link em até 24h para completar cadastro
-- =============================================================================

-- =============================================================================
-- 1. TABELA invitation_tokens
-- =============================================================================

CREATE TABLE IF NOT EXISTS invitation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token ON invitation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_email ON invitation_tokens(email);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_org ON invitation_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_expires ON invitation_tokens(expires_at);

COMMENT ON TABLE invitation_tokens IS 'Tokens de convite enviados por e-mail. Validade 24h.';

-- =============================================================================
-- 2. FUNÇÃO create_invitation_token(org_id, email)
-- =============================================================================

CREATE OR REPLACE FUNCTION create_invitation_token(
  org_id UUID,
  email_input TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_token TEXT;
  org_name TEXT;
BEGIN
  IF NOT user_has_role(ARRAY['owner', 'admin']::user_role[]) THEN
    RAISE EXCEPTION 'Apenas owner/admin podem convidar usuários';
  END IF;

  IF org_id IS NULL OR org_id != get_user_organization_id() THEN
    RAISE EXCEPTION 'organization_id inválido';
  END IF;

  email_input := LOWER(TRIM(email_input));
  IF email_input = '' OR email_input !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  -- Token seguro (32 chars hex)
  new_token := ENCODE(gen_random_bytes(24), 'hex');

  SELECT name INTO org_name FROM organizations WHERE id = org_id;

  INSERT INTO invitation_tokens (email, token, organization_id, expires_at, created_by)
  VALUES (email_input, new_token, org_id, NOW() + INTERVAL '24 hours', auth.uid());

  RETURN jsonb_build_object(
    'token', new_token,
    'email', email_input,
    'expires_at', (SELECT expires_at FROM invitation_tokens WHERE token = new_token),
    'organization_name', org_name
  );
END;
$$;

COMMENT ON FUNCTION create_invitation_token IS 'Cria token de convite e retorna link. Edge Function envia o e-mail.';

-- =============================================================================
-- 3. FUNÇÃO validate_invitation_token(token_input)
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_invitation_token(token_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF token_input IS NULL OR TRIM(token_input) = '' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Token obrigatório');
  END IF;

  SELECT it.email, o.name AS organization_name
  INTO rec
  FROM invitation_tokens it
  JOIN organizations o ON o.id = it.organization_id
  WHERE it.token = TRIM(token_input)
    AND it.used_by IS NULL
    AND it.expires_at > NOW();

  IF FOUND THEN
    RETURN jsonb_build_object(
      'valid', true,
      'email', rec.email,
      'organization_name', rec.organization_name
    );
  ELSE
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Convite inválido, expirado ou já utilizado. Solicite um novo.'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION validate_invitation_token IS 'Valida token de convite. Chamável sem autenticação.';

-- =============================================================================
-- 4. ATUALIZAÇÃO handle_new_user - Suporte a invitation_token
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  new_org_id UUID;
  org_slug TEXT;
  token_row RECORD;
  token_val TEXT;
BEGIN
  -- Suporta invitation_token (novo) ou registration_code (legado)
  token_val := COALESCE(
    NEW.raw_user_meta_data->>'invitation_token',
    NEW.raw_user_meta_data->>'registration_code'
  );

  IF token_val IS NOT NULL AND TRIM(token_val) != '' THEN
    SELECT id, organization_id INTO token_row
    FROM invitation_tokens
    WHERE token = TRIM(token_val)
      AND used_by IS NULL
      AND expires_at > NOW();

    IF NOT FOUND THEN
      SELECT id, organization_id INTO token_row
      FROM registration_codes
      WHERE code = TRIM(token_val)
        AND used_by IS NULL
        AND expires_at > NOW();
    ELSE
      UPDATE invitation_tokens
      SET used_by = NEW.id, used_at = NOW()
      WHERE id = token_row.id;
      new_org_id := token_row.organization_id;

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

    IF FOUND AND token_row.organization_id IS NOT NULL THEN
      new_org_id := token_row.organization_id;
      UPDATE registration_codes
      SET used_by = NEW.id, used_at = NOW()
      WHERE id = token_row.id;

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
  END IF;

  -- Fluxo original: novo usuário sem token - cria organização
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
-- 5. RLS E AUDITORIA
-- =============================================================================

ALTER TABLE invitation_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitation_tokens_select ON invitation_tokens;
CREATE POLICY invitation_tokens_select ON invitation_tokens FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS invitation_tokens_insert ON invitation_tokens;
CREATE POLICY invitation_tokens_insert ON invitation_tokens FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

-- Audit trigger
DROP TRIGGER IF EXISTS audit_invitation_tokens ON invitation_tokens;
CREATE TRIGGER audit_invitation_tokens
  AFTER INSERT OR UPDATE OR DELETE ON invitation_tokens
  FOR EACH ROW EXECUTE FUNCTION audit_changes();
