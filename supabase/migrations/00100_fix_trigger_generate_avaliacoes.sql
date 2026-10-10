-- Migration 00100: fix trigger_generate_avaliacoes — use $$ dollar quoting
-- The previous migration 00097 used single $ which may have caused issues.

CREATE OR REPLACE FUNCTION trigger_generate_avaliacoes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM generate_360_avaliacoes(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_ciclo_insert ON ciclos_avaliacao;

CREATE TRIGGER after_ciclo_insert
  AFTER INSERT ON ciclos_avaliacao
  FOR EACH ROW EXECUTE FUNCTION trigger_generate_avaliacoes();
