-- =============================================================================
-- MAESTR.IA - Função pública de validação de código de cadastro
-- =============================================================================
-- Chamável por usuários não autenticados (anon) para validar código antes do signUp.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_registration_code(code_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF code_input IS NULL OR TRIM(code_input) = '' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Código obrigatório');
  END IF;

  SELECT rc.id, o.name AS organization_name
  INTO rec
  FROM registration_codes rc
  JOIN organizations o ON o.id = rc.organization_id
  WHERE rc.code = TRIM(code_input)
    AND rc.used_by IS NULL
    AND rc.expires_at > NOW();

  IF FOUND THEN
    RETURN jsonb_build_object(
      'valid', true,
      'organization_name', rec.organization_name
    );
  ELSE
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Código inválido, expirado ou já utilizado'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION validate_registration_code IS 'Valida código de cadastro. Pode ser chamada sem autenticação.';
