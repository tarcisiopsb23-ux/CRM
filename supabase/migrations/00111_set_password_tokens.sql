-- =============================================================================
-- Tokens para colaboradores definirem sua senha após cadastro sem senha
-- =============================================================================

CREATE TABLE IF NOT EXISTS set_password_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_set_password_tokens_token ON set_password_tokens(token);
CREATE INDEX IF NOT EXISTS idx_set_password_tokens_user ON set_password_tokens(user_id);

ALTER TABLE set_password_tokens ENABLE ROW LEVEL SECURITY;

-- Apenas service role acessa diretamente (edge functions usam service key)
-- Leitura pública via RPC para validação do token
CREATE POLICY set_password_tokens_admin ON set_password_tokens
  USING (organization_id = get_user_organization_id() AND user_has_role(ARRAY['owner', 'admin']::user_role[]));

-- RPC: cria token de definição de senha (chamada pela edge function com service role)
CREATE OR REPLACE FUNCTION create_set_password_token(
  p_user_id UUID,
  p_org_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_token TEXT;
BEGIN
  -- Invalida tokens anteriores do mesmo usuário
  DELETE FROM set_password_tokens WHERE user_id = p_user_id;

  new_token := ENCODE(gen_random_bytes(24), 'hex');

  INSERT INTO set_password_tokens (user_id, token, organization_id, expires_at)
  VALUES (p_user_id, new_token, p_org_id, NOW() + INTERVAL '72 hours');

  RETURN new_token;
END;
$$;

-- RPC pública: valida token e retorna email do colaborador
CREATE OR REPLACE FUNCTION validate_set_password_token(token_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF token_input IS NULL OR TRIM(token_input) = '' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT spt.user_id, p.email, p.full_name
  INTO rec
  FROM set_password_tokens spt
  JOIN profiles p ON p.id = spt.user_id
  WHERE spt.token = TRIM(token_input)
    AND spt.used_at IS NULL
    AND spt.expires_at > NOW();

  IF FOUND THEN
    RETURN jsonb_build_object(
      'valid', true,
      'user_id', rec.user_id,
      'email', rec.email,
      'full_name', rec.full_name
    );
  ELSE
    RETURN jsonb_build_object('valid', false);
  END IF;
END;
$$;

-- RPC: consome o token e define a senha (chamada pela edge function)
CREATE OR REPLACE FUNCTION consume_set_password_token(token_input TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE set_password_tokens
  SET used_at = NOW()
  WHERE token = TRIM(token_input)
    AND used_at IS NULL
    AND expires_at > NOW()
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$;
