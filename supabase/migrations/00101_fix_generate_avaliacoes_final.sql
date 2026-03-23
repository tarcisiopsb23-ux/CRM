-- Migration 00101: fix generate_360_avaliacoes — correct $$ quoting + include all roles
-- Previous migrations 00097 and 00099 used single $ which is invalid.
-- Also: include all active profiles (not just member/manager) so owners/admins get evaluations too.

CREATE OR REPLACE FUNCTION generate_360_avaliacoes(p_ciclo_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ciclo ciclos_avaliacao%ROWTYPE;
  v_avaliado RECORD;
  v_gestor_id UUID;
  v_par RECORD;
BEGIN
  SELECT * INTO v_ciclo FROM ciclos_avaliacao WHERE id = p_ciclo_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Para cada colaborador ativo da organização (todos os roles)
  FOR v_avaliado IN
    SELECT p.id FROM profiles p
    WHERE p.organization_id = v_ciclo.organization_id
      AND p.is_active = true
  LOOP
    -- 1. Autoavaliação
    INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
    VALUES (p_ciclo_id, v_ciclo.organization_id, v_avaliado.id, v_avaliado.id, 'autoavaliacao', false)
    ON CONFLICT DO NOTHING;

    -- 2. Gestor avalia o colaborador
    v_gestor_id := NULL;
    SELECT t.lead_id INTO v_gestor_id
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.profile_id = v_avaliado.id
      AND t.lead_id IS NOT NULL
      AND t.lead_id != v_avaliado.id
    LIMIT 1;

    IF v_gestor_id IS NOT NULL THEN
      INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
      VALUES (p_ciclo_id, v_ciclo.organization_id, v_gestor_id, v_avaliado.id, 'gestor', false)
      ON CONFLICT DO NOTHING;
    END IF;

    -- 3. Pares (demais membros da mesma equipe) — anônimo
    FOR v_par IN
      SELECT DISTINCT tm2.profile_id
      FROM team_members tm1
      JOIN team_members tm2 ON tm2.team_id = tm1.team_id
      WHERE tm1.profile_id = v_avaliado.id
        AND tm2.profile_id != v_avaliado.id
    LOOP
      INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
      VALUES (p_ciclo_id, v_ciclo.organization_id, v_par.profile_id, v_avaliado.id, 'pares', true)
      ON CONFLICT DO NOTHING;
    END LOOP;

  END LOOP;

  -- Notificar avaliadores — guard para caso a tabela não exista
  BEGIN
    INSERT INTO notifications (organization_id, user_id, title, message, type)
    SELECT DISTINCT
      a.organization_id,
      a.avaliador_id,
      'Novo ciclo de avaliação iniciado',
      'Você tem avaliações pendentes no ciclo: ' || v_ciclo.nome,
      'info'
    FROM avaliacoes_360 a
    WHERE a.ciclo_id = p_ciclo_id
      AND a.status = 'pendente'
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

END;
$$;

-- Recriar trigger com $$ correto
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
