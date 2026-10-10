-- Migration 00097: RPC generate_360_avaliacoes + trigger after_ciclo_insert
-- Requirements: 2.1, 2.2, 2.3, 2.4, 9.1

CREATE OR REPLACE FUNCTION generate_360_avaliacoes(p_ciclo_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ciclo ciclos_avaliacao%ROWTYPE;
  v_avaliado RECORD;
  v_gestor_id UUID;
  v_par RECORD;
BEGIN
  SELECT * INTO v_ciclo FROM ciclos_avaliacao WHERE id = p_ciclo_id;

  -- Para cada colaborador ativo da organização (member e manager)
  FOR v_avaliado IN
    SELECT p.id FROM profiles p
    WHERE p.organization_id = v_ciclo.organization_id
      AND p.is_active = true
      AND p.role IN ('member','manager')
  LOOP
    -- 1. Autoavaliação
    INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
    VALUES (p_ciclo_id, v_ciclo.organization_id, v_avaliado.id, v_avaliado.id, 'autoavaliacao', false)
    ON CONFLICT DO NOTHING;

    -- 2. Gestor avalia o colaborador
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

    -- Log de aviso se colaborador sem equipe
    IF v_gestor_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM team_members WHERE profile_id = v_avaliado.id
    ) THEN
      INSERT INTO audit_log_360 (organization_id, user_id, action, entity_type, entity_id, new_data)
      VALUES (
        v_ciclo.organization_id,
        NULL,
        'warn_no_team',
        'profile',
        v_avaliado.id,
        jsonb_build_object(
          'ciclo_id', p_ciclo_id,
          'message', 'Colaborador sem equipe — apenas autoavaliação criada'
        )
      );
    END IF;
  END LOOP;

  -- Notificar todos os avaliadores com avaliações pendentes (Req 9.1)
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
    -- tabela notifications não existe ainda, ignorar
    NULL;
  END;

END;
$$;

-- Trigger: dispara generate_360_avaliacoes após INSERT em ciclos_avaliacao
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
