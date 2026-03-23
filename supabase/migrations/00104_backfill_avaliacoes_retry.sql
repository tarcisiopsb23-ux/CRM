-- Migration 00104: retry backfill after RLS fix
-- Generate avaliacoes for any active ciclo that still has none
DO $$
DECLARE
  v_ciclo RECORD;
BEGIN
  FOR v_ciclo IN
    SELECT c.id, c.nome
    FROM ciclos_avaliacao c
    WHERE c.status = 'ativo'
      AND NOT EXISTS (
        SELECT 1 FROM avaliacoes_360 a WHERE a.ciclo_id = c.id
      )
  LOOP
    RAISE NOTICE 'Gerando avaliações para ciclo: %', v_ciclo.nome;
    PERFORM generate_360_avaliacoes(v_ciclo.id);
  END LOOP;
END;
$$;
