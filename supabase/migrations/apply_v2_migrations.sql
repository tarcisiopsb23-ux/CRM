-- ============================================================
-- APPLY V2 MIGRATIONS — run this in Supabase SQL Editor
-- Inclui: 00107 + 00108 + 00109
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 00107: Sistema de Avaliações V2 (schema changes)
-- ─────────────────────────────────────────────────────────────

-- 1. Expandir tipo em ciclos_avaliacao
ALTER TABLE ciclos_avaliacao
  DROP CONSTRAINT IF EXISTS ciclos_avaliacao_tipo_check;

ALTER TABLE ciclos_avaliacao
  ADD CONSTRAINT ciclos_avaliacao_tipo_check
  CHECK (tipo IN ('360', 'checkin', 'probatorio'));

ALTER TABLE ciclos_avaliacao
  ADD COLUMN IF NOT EXISTS colaborador_alvo_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Expandir critérios em respostas_avaliacao_360
ALTER TABLE respostas_avaliacao_360
  DROP CONSTRAINT IF EXISTS respostas_avaliacao_360_criterio_check;

ALTER TABLE respostas_avaliacao_360
  ADD CONSTRAINT respostas_avaliacao_360_criterio_check
  CHECK (criterio IN (
    'comunicacao', 'trabalho_em_equipe', 'proatividade',
    'responsabilidade', 'alinhamento_cultural',
    'qualidade_de_entrega', 'foco_em_resultados',
    'resolucao_de_problemas', 'evolucao_e_aprendizado',
    'dominio_tecnico', 'qualidade_entrega_prob', 'cumprimento_prazos',
    'adaptacao_cultura', 'relacionamento_equipe', 'comunicacao_prob',
    'iniciativa', 'capacidade_aprendizado',
    'bem_estar', 'progresso_metas', 'dificuldades',
    'alinhamento_gestor', 'motivacao'
  ));

-- 3. Escala 1-10
ALTER TABLE respostas_avaliacao_360
  DROP CONSTRAINT IF EXISTS respostas_avaliacao_360_nota_check;

ALTER TABLE respostas_avaliacao_360
  ADD CONSTRAINT respostas_avaliacao_360_nota_check
  CHECK (nota BETWEEN 1 AND 10);

-- 4. Perguntas abertas
ALTER TABLE respostas_avaliacao_360
  ADD COLUMN IF NOT EXISTS ponto_forte    TEXT,
  ADD COLUMN IF NOT EXISTS ponto_melhoria TEXT;

-- 5. Decisão probatória
ALTER TABLE avaliacoes_360
  ADD COLUMN IF NOT EXISTS decisao_probatorio TEXT
  CHECK (decisao_probatorio IN ('efetivado', 'desligado', 'periodo_estendido') OR decisao_probatorio IS NULL);

-- 6. Classificação no resultado final
ALTER TABLE resultado_final_360
  ADD COLUMN IF NOT EXISTS classificacao          TEXT
  CHECK (classificacao IN ('Top Performer', 'Alta Performance', 'Regular', 'Baixa Performance / Risco') OR classificacao IS NULL),
  ADD COLUMN IF NOT EXISTS media_comportamental   DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS media_performance      DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS media_desenvolvimento  DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS score_360              DECIMAL(4,2);

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_ciclos_colaborador_alvo ON ciclos_avaliacao(colaborador_alvo_id);

-- 8. Responsável manual para probatório (sem equipe)
ALTER TABLE ciclos_avaliacao
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ciclos_responsavel ON ciclos_avaliacao(responsavel_id);

-- ─────────────────────────────────────────────────────────────
-- 00108: Atualizar consolidate_360 RPC com classificação
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION consolidate_360(p_ciclo_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ciclo       ciclos_avaliacao%ROWTYPE;
  v_org_id      UUID;
  v_avaliado    RECORD;
  v_media_comp  DECIMAL(4,2);
  v_media_perf  DECIMAL(4,2);
  v_media_dev   DECIMAL(4,2);
  v_score_360   DECIMAL(4,2);
  v_score_final DECIMAL(4,2);
  v_classif     TEXT;

  CRITERIOS_COMP  TEXT[] := ARRAY['comunicacao','trabalho_em_equipe','proatividade','responsabilidade','alinhamento_cultural'];
  CRITERIOS_PERF  TEXT[] := ARRAY['qualidade_de_entrega','foco_em_resultados'];
  CRITERIOS_DEV   TEXT[] := ARRAY['resolucao_de_problemas','evolucao_e_aprendizado'];
BEGIN
  SELECT * INTO v_ciclo FROM ciclos_avaliacao WHERE id = p_ciclo_id;
  v_org_id := v_ciclo.organization_id;

  FOR v_avaliado IN
    SELECT DISTINCT avaliado_id FROM avaliacoes_360
    WHERE ciclo_id = p_ciclo_id AND status = 'concluido'
  LOOP
    -- Médias por categoria (apenas avaliações 360 e probatório)
    SELECT
      AVG(CASE WHEN r.criterio = ANY(CRITERIOS_COMP) THEN r.nota END),
      AVG(CASE WHEN r.criterio = ANY(CRITERIOS_PERF) THEN r.nota END),
      AVG(CASE WHEN r.criterio = ANY(CRITERIOS_DEV)  THEN r.nota END)
    INTO v_media_comp, v_media_perf, v_media_dev
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.status = 'concluido';

    -- Score 360 ponderado
    v_score_360 := ROUND(
      COALESCE(v_media_comp, 0) * 0.3 +
      COALESCE(v_media_perf, 0) * 0.4 +
      COALESCE(v_media_dev,  0) * 0.3,
    2);

    -- Score final (360 * peso_360 + metas * peso_metas + prod * peso_prod)
    -- Sem dados de metas/prod ainda: usa score_360 * peso_360
    v_score_final := ROUND(v_score_360 * v_ciclo.peso_360, 2);

    -- Classificação
    v_classif := CASE
      WHEN v_score_final >= 9 THEN 'Top Performer'
      WHEN v_score_final >= 7 THEN 'Alta Performance'
      WHEN v_score_final >= 5 THEN 'Regular'
      ELSE 'Baixa Performance / Risco'
    END;

    INSERT INTO resultado_final_360 (
      ciclo_id, organization_id, avaliado_id,
      media_geral,
      media_autoavaliacao,
      media_pares,
      media_gestor,
      media_liderado,
      media_comportamental,
      media_performance,
      media_desenvolvimento,
      score_360,
      score_final,
      classificacao
    )
    SELECT
      p_ciclo_id,
      v_org_id,
      v_avaliado.avaliado_id,
      AVG(r.nota),
      AVG(CASE WHEN a.tipo = 'autoavaliacao' THEN r.nota END),
      AVG(CASE WHEN a.tipo = 'pares'         THEN r.nota END),
      AVG(CASE WHEN a.tipo = 'gestor'        THEN r.nota END),
      AVG(CASE WHEN a.tipo = 'liderado'      THEN r.nota END),
      v_media_comp,
      v_media_perf,
      v_media_dev,
      v_score_360,
      v_score_final,
      v_classif
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.status = 'concluido'
    ON CONFLICT (ciclo_id, avaliado_id) DO UPDATE SET
      media_geral           = EXCLUDED.media_geral,
      media_autoavaliacao   = EXCLUDED.media_autoavaliacao,
      media_pares           = EXCLUDED.media_pares,
      media_gestor          = EXCLUDED.media_gestor,
      media_liderado        = EXCLUDED.media_liderado,
      media_comportamental  = EXCLUDED.media_comportamental,
      media_performance     = EXCLUDED.media_performance,
      media_desenvolvimento = EXCLUDED.media_desenvolvimento,
      score_360             = EXCLUDED.score_360,
      score_final           = EXCLUDED.score_final,
      classificacao         = EXCLUDED.classificacao,
      updated_at            = now();
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 00109: Atualizar generate_360_avaliacoes para probatório/check-in
-- ─────────────────────────────────────────────────────────────

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

    -- Autoavaliação
    INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
    VALUES (p_ciclo_id, v_ciclo.organization_id,
            v_ciclo.colaborador_alvo_id, v_ciclo.colaborador_alvo_id,
            'autoavaliacao', false)
    ON CONFLICT DO NOTHING;

    -- Gestor: 1º responsavel_id explícito
    v_gestor_id := v_ciclo.responsavel_id;

    -- 2º lead da equipe do colaborador
    IF v_gestor_id IS NULL THEN
      SELECT t.lead_id INTO v_gestor_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.profile_id = v_ciclo.colaborador_alvo_id
        AND t.lead_id IS NOT NULL
        AND t.lead_id != v_ciclo.colaborador_alvo_id
      LIMIT 1;
    END IF;

    -- 3º fallback: primeiro owner/admin da org
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

    -- Pares (anônimo)
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
