-- =============================================================================
-- Migration 014: Adiciona campos de endereço separados e código numérico
-- na tabela profiles (colaboradores)
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS code                 INTEGER,
  ADD COLUMN IF NOT EXISTS address_street       TEXT,
  ADD COLUMN IF NOT EXISTS address_number       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address_complement   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_neighborhood VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_city         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_state        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS address_zip          VARCHAR(20);

-- Índice único de código por organização
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_org_code
  ON profiles(organization_id, code)
  WHERE code IS NOT NULL;

-- ─── Trigger para gerar código automático ao inserir ─────────────────────────
CREATE OR REPLACE FUNCTION trg_set_profile_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL AND NEW.organization_id IS NOT NULL THEN
    NEW.code := next_entity_code('profiles', NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_code ON profiles;
CREATE TRIGGER set_profile_code
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_set_profile_code();

-- ─── Preenche registros existentes ───────────────────────────────────────────
DO $$
DECLARE
  org_row RECORD;
  rec     RECORD;
  v_seq   INTEGER;
BEGIN
  FOR org_row IN
    SELECT DISTINCT organization_id FROM profiles WHERE code IS NULL AND organization_id IS NOT NULL
  LOOP
    v_seq := 1;
    FOR rec IN
      SELECT id FROM profiles
      WHERE organization_id = org_row.organization_id AND code IS NULL
      ORDER BY created_at
    LOOP
      UPDATE profiles SET code = v_seq WHERE id = rec.id;
      v_seq := v_seq + 1;
    END LOOP;
  END LOOP;
END;
$$;
