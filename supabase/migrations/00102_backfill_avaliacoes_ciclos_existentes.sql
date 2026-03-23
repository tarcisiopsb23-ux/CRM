-- Migration 00102: backfill — gerar avaliações para ciclos ativos que não têm avaliações ainda
DO $$
DECLARE
  v_ciclo RECORD;
BEGIN
  FOR v_ciclo IN
    SELECT c.id
    FROM ciclos_avaliacao c
    WHERE c.status = 'ativo'
      AND NOT EXISTS (
        SELECT 1 FROM avaliacoes_360 a WHERE a.ciclo_id = c.id
      )
  LOOP
    PERFORM generate_360_avaliacoes(v_ciclo.id);
  END LOOP;
END;
$$;
