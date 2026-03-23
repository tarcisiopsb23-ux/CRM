-- Migration 00110: Responsável manual para ciclo probatório
-- Quando o colaborador não tem equipe/gestor, permite definir um responsável
-- (admin/owner) que fará a avaliação de gestor no probatório.
-- Também aplica fallback automático para o primeiro admin/owner da org.

-- ─── 1. Coluna responsavel_id em ciclos_avaliacao ────────────────────────────
ALTER TABLE ciclos_avaliacao
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ciclos_responsavel ON ciclos_avaliacao(responsavel_id);

-- ─── 2. Atualizar generate_360_avaliacoes com fallback ───────────────────────
CREATE OR REPLACE FUNCTION generate_360_avaliacoes(p_ciclo_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ciclo      ciclos_avaliacao%ROWTYPE;
  v_avaliado   RECORD;
  v_gestor_id  UUID;
  v_par        RECORD;
BEGIN
  SELECT * INTO v_ciclo FROM ciclos_avaliacao WHERE id = p_ciclo_id;

  -- ── PROBATÓRIO ────────────────────────────────────────────────────────────
  IF v_ciclo.tipo = 'probatorio' THEN
    IF v_ciclo.colaborador_alvo_id IS NULL THEN
      RAISE EXCEPTION 'Ciclo probatório requer colaborador_alvo_id';
    END IF;

    -- Autoavaliação do colaborador
    INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
    VALUES (p_ciclo_id, v_ciclo.organization_id,
            v_ciclo.colaborador_alvo_id, v_ciclo.colaborador_alvo_id,
            'autoavaliacao', false)
    ON CONFLICT DO NOTHING;

    -- Gestor: 1º tenta responsavel_id explícito
    v_gestor_id := v_ciclo.responsavel_id;

    -- 2º tenta lead da equipe do colaborador
    IF v_gestor_id IS NULL THEN
      SELECT t.lead_id INTO v_gestor_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.profile_id = v_ciclo.colaborador_alvo_id
        AND t.lead_id IS NOT NULL
        AND t.lead_id != v_ciclo.colaborador_alvo_id
      LIMIT 1;
    END IF;

    -- 3º fallback: primeiro admin ou owner da organização
    IF v_gestor_id IS NULL THEN
      SELECT id INTO v_gestor_id
      FROM profiles
      WHERE organization_id = v_ciclo.organization_id
        AND role IN ('admin', 'owner')
        AND is_active = true
        AND id != v_ciclo.colaborador_alvo_id
      ORDER BY
        CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 END,
        created_at
      LIMIT 1;
    END IF;

    IF v_gestor_id IS NOT NULL THEN
      INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
      VALUES (p_ciclo_id, v_ciclo.organization_id,
              v_gestor_id, v_ciclo.colaborador_alvo_id,
              'gestor', false)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Pares: membros da mesma equipe (anônimo)
    FOR v_par IN
      SELECT DISTINCT tm2.profile_id
      FROM team_members tm1
      JOIN team_members tm2 ON tm2.team_id = tm1.team_id
      WHERE tm1.profile_id = v_ciclo.colaborador_alvo_id
        AND tm2.profile_id != v_ciclo.colaborador_alvo_id
    LOOP
      INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
      VALUES (p_ciclo_id, v_ciclo.organization_id,
              v_par.profile_id, v_ciclo.colaborador_alvo_id,
              'pares', true)
      ON CONFLICT DO NOTHING;
    END LOOP;

    RETURN;
  END IF;

  -- ── CHECK-IN ──────────────────────────────────────────────────────────────
  IF v_ciclo.tipo = 'checkin' THEN
    FOR v_avaliado IN
      SELECT p.id FROM profiles p
      WHERE p.organization_id = v_ciclo.organization_id
        AND p.is_active = true
        AND p.role IN ('member','manager')
    LOOP
      INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
      VALUES (p_ciclo_id, v_ciclo.organization_id,
              v_avaliado.id, v_avaliado.id,
              'autoavaliacao', false)
      ON CONFLICT DO NOTHING;

      SELECT t.lead_id INTO v_gestor_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.profile_id = v_avaliado.id
        AND t.lead_id IS NOT NULL
        AND t.lead_id != v_avaliado.id
      LIMIT 1;

      IF v_gestor_id IS NOT NULL THEN
        INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
        VALUES (p_ciclo_id, v_ciclo.organization_id,
                v_gestor_id, v_avaliado.id,
                'gestor', false)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    RETURN;
  END IF;

  -- ── 360° COMPLETO ─────────────────────────────────────────────────────────
  FOR v_avaliado IN
    SELECT p.id FROM profiles p
    WHERE p.organization_id = v_ciclo.organization_id
      AND p.is_active = true
      AND p.role IN ('member','manager')
  LOOP
    INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
    VALUES (p_ciclo_id, v_ciclo.organization_id,
            v_avaliado.id, v_avaliado.id,
            'autoavaliacao', false)
    ON CONFLICT DO NOTHING;

    SELECT t.lead_id INTO v_gestor_id
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.profile_id = v_avaliado.id
      AND t.lead_id IS NOT NULL
      AND t.lead_id != v_avaliado.id
    LIMIT 1;

    IF v_gestor_id IS NOT NULL THEN
      INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
      VALUES (p_ciclo_id, v_ciclo.organization_id,
              v_gestor_id, v_avaliado.id,
              'gestor', false)
      ON CONFLICT DO NOTHING;
    END IF;

    FOR v_par IN
      SELECT DISTINCT tm2.profile_id
      FROM team_members tm1
      JOIN team_members tm2 ON tm2.team_id = tm1.team_id
      WHERE tm1.profile_id = v_avaliado.id
        AND tm2.profile_id != v_avaliado.id
    LOOP
      INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
      VALUES (p_ciclo_id, v_ciclo.organization_id,
              v_par.profile_id, v_avaliado.id,
              'pares', true)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Notificações
  BEGIN
    INSERT INTO notifications (organization_id, user_id, title, message, type)
    SELECT DISTINCT a.organization_id, a.avaliador_id,
      'Novo ciclo de avaliação iniciado',
      'Você tem avaliações pendentes no ciclo: ' || v_ciclo.nome,
      'info'
    FROM avaliacoes_360 a
    WHERE a.ciclo_id = p_ciclo_id AND a.status = 'pendente'
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

END;
$$;
