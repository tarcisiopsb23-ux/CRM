-- =============================================================================
-- Migration: c8_password_reset_tokens
-- Banco: C8 Control (xcymhcqbyyuozkzhpxgi.supabase.co)
--
-- Tabela de tokens de reset de senha gerados pelo Maestr.ia.
-- O Maestr.ia insere via service role key do C8 Control.
-- O C8 Control valida e consome o token ao definir a nova senha.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.c8_password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  tenant_id   UUID,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_c8_prt_token   ON public.c8_password_reset_tokens (token);
CREATE INDEX IF NOT EXISTS idx_c8_prt_user_id ON public.c8_password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_c8_prt_expires  ON public.c8_password_reset_tokens (expires_at);

ALTER TABLE public.c8_password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Apenas service role pode inserir/deletar (Maestr.ia usa service key)
-- Usuários autenticados não acessam diretamente — usam a RPC abaixo

-- RPC pública: valida token e retorna email (sem autenticação — token é a prova)
CREATE OR REPLACE FUNCTION public.validate_c8_reset_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT t.user_id, t.email, t.tenant_id
  INTO rec
  FROM c8_password_reset_tokens t
  WHERE t.token = TRIM(p_token)
    AND t.used_at IS NULL
    AND t.expires_at > NOW();

  IF FOUND THEN
    RETURN jsonb_build_object(
      'valid',     true,
      'user_id',   rec.user_id,
      'email',     rec.email,
      'tenant_id', rec.tenant_id
    );
  ELSE
    RETURN jsonb_build_object('valid', false);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_c8_reset_token(TEXT) TO anon, authenticated;

-- RPC: consome o token e retorna user_id (chamada pela edge function do C8 Control)
CREATE OR REPLACE FUNCTION public.consume_c8_reset_token(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE c8_password_reset_tokens
  SET used_at = NOW()
  WHERE token = TRIM(p_token)
    AND used_at IS NULL
    AND expires_at > NOW()
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_c8_reset_token(TEXT) TO anon, authenticated;
