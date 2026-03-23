-- =============================================================================
-- Migration 00083: Campos de comissão em profiles + trigger board_member_sync
-- Refs: Requirements 19.1, 5.4, 5.5
-- =============================================================================

-- 1. Adicionar colunas de comissão/bônus à tabela profiles (idempotente)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS commission_rate  DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_rate_120   DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_rate_135   DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_rate_150   DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_board_member  BOOLEAN DEFAULT false;

-- hire_date fica em metadata.hire_date (JSON) — sem coluna nova
-- commission_percent em metadata é legado — não gravar mais

-- 2. Função sync_board_member
CREATE OR REPLACE FUNCTION sync_board_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_team_name TEXT;
BEGIN
  SELECT name INTO v_team_name
    FROM teams
   WHERE id = COALESCE(NEW.team_id, OLD.team_id);

  IF v_team_name = 'Diretoria' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE profiles SET is_board_member = true  WHERE id = NEW.profile_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE profiles SET is_board_member = false WHERE id = OLD.profile_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Trigger board_member_sync (idempotente via DROP IF EXISTS)
DROP TRIGGER IF EXISTS board_member_sync ON team_members;

CREATE TRIGGER board_member_sync
  AFTER INSERT OR DELETE ON team_members
  FOR EACH ROW EXECUTE FUNCTION sync_board_member();
