-- Migration 00105: force regenerate avaliacoes for ALL active ciclos
-- Runs generate_360_avaliacoes for every active ciclo regardless of existing rows.
-- ON CONFLICT DO NOTHING ensures no duplicates.
DO $$
DECLARE
  v_ciclo RECORD;
BEGIN
  FOR v_ciclo IN
    SELECT c.id, c.nome
    FROM ciclos_avaliacao c
    WHERE c.status = 'ativo'
  LOOP
    RAISE NOTICE 'Regenerando avaliações para ciclo: %', v_ciclo.nome;
    PERFORM generate_360_avaliacoes(v_ciclo.id);
  END LOOP;
END;
$$;
