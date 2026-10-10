-- =============================================================================
-- Migration 00138: PINs gerenciais
-- PIN numérico de 8 dígitos para confirmar ações críticas.
-- Disponível para roles: owner, admin, manager.
-- O PIN é armazenado como hash SHA-256 — nunca em texto puro.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.manager_pins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pin_hash        TEXT NOT NULL,  -- SHA-256 hex do PIN
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manager_pins_user ON public.manager_pins (user_id);
CREATE INDEX IF NOT EXISTS idx_manager_pins_org  ON public.manager_pins (organization_id);

ALTER TABLE public.manager_pins ENABLE ROW LEVEL SECURITY;

-- Usuário só acessa o próprio PIN
CREATE POLICY manager_pins_self ON public.manager_pins
  FOR ALL
  USING (user_id = auth.uid());

-- Owner/admin podem ver PINs da organização (para auditoria)
CREATE POLICY manager_pins_admin ON public.manager_pins
  FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_manager_pins_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_manager_pins_updated_at
  BEFORE UPDATE ON public.manager_pins
  FOR EACH ROW EXECUTE FUNCTION update_manager_pins_updated_at();

-- =============================================================================
-- RPC: set_manager_pin — define ou atualiza o PIN do usuário logado
-- Recebe o PIN em texto puro, armazena o hash SHA-256
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_manager_pin(p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id  UUID;
  v_role    user_role;
  v_hash    TEXT;
BEGIN
  -- Validar que o usuário está autenticado
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  -- Buscar role e org do usuário
  SELECT role, organization_id INTO v_role, v_org_id
  FROM profiles WHERE id = v_user_id;

  -- Apenas manager, admin e owner podem ter PIN
  IF v_role NOT IN ('owner', 'admin', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas manager, admin e owner podem cadastrar PIN');
  END IF;

  -- Validar formato: exatamente 8 dígitos numéricos
  IF p_pin IS NULL OR p_pin !~ '^\d{8}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN deve ter exatamente 8 dígitos numéricos');
  END IF;

  -- Gerar hash SHA-256 do PIN
  v_hash := encode(digest(p_pin, 'sha256'), 'hex');

  -- Upsert
  INSERT INTO manager_pins (user_id, organization_id, pin_hash)
  VALUES (v_user_id, v_org_id, v_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_manager_pin(TEXT) TO authenticated;

-- =============================================================================
-- RPC: verify_manager_pin — verifica o PIN do usuário logado
-- Retorna true/false sem expor o hash
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verify_manager_pin(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_hash    TEXT;
  v_stored  TEXT;
BEGIN
  IF v_user_id IS NULL THEN RETURN false; END IF;
  IF p_pin IS NULL OR p_pin !~ '^\d{8}$' THEN RETURN false; END IF;

  SELECT pin_hash INTO v_stored
  FROM manager_pins WHERE user_id = v_user_id;

  IF v_stored IS NULL THEN RETURN false; END IF;

  v_hash := encode(digest(p_pin, 'sha256'), 'hex');
  RETURN v_hash = v_stored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_manager_pin(TEXT) TO authenticated;

-- =============================================================================
-- RPC: has_manager_pin — verifica se o usuário logado tem PIN cadastrado
-- =============================================================================
CREATE OR REPLACE FUNCTION public.has_manager_pin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM manager_pins WHERE user_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_manager_pin() TO authenticated;
