-- Migration 00108: Atualizar RPC consolidate_ciclo_results para V2
-- Calcula score com pesos por categoria + classificação automática

CREATE OR REPLACE FUNCTION consolidate_ciclo_results(p_ciclo_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ciclo       ciclos_avaliacao%ROWTYPE;
  v_avaliado    RECORD;
  v_media_comp  DECIMAL(4,2);
  v_media_perf  DECIMAL(4,2);
  v_media_dev   DECIMAL(4,2);
  v_score_360   DECIMAL(4,2);
  v_score_final DECIMAL(4,2);
  v_classif     TEXT;
  v_media_auto  DECIMAL(4,2);
  v_media_pares DECIMAL(4,2);
  v_media_gest  DECIMAL(4,2);
  v_media_lid   DECIMAL(4,2);
  v_media_geral DECIMAL(4,2);

  -- Critérios por categoria
  CRITERIOS_COMPORTAMENTAL CONSTANT TEXT[] := ARRAY[
    'comunicacao','trabalho_em_equipe','proatividade',
    'responsabilidade','alinhamento_cultural'
  ];
  CRITERIOS_PERFORMANCE CONSTANT TEXT[] := ARRAY[
    'qualidade_de_entrega','foco_em_resultados'
  ];
  CRITERIOS_DESENVOLVIMENTO CONSTANT TEXT[] := ARRAY[
    'resolucao_de_problemas','evolucao_e_aprendizado'
  ];
  -- Critérios probatório
  CRITERIOS_PROB CONSTANT TEXT[] := ARRAY[
    'dominio_tecnico','qualidade_entrega_prob','cumprimento_prazos',
    'adaptacao_cultura','relacionamento_equipe','comunicacao_prob',
    'iniciativa','capacidade_aprendizado'
  ];
BEGIN
  SELECT * INTO v_ciclo FROM ciclos_avaliacao WHERE id = p_ciclo_id;

  FOR v_avaliado IN
    SELECT DISTINCT avaliado_id FROM avaliacoes_360
    WHERE ciclo_id = p_ciclo_id AND status = 'concluido'
  LOOP
    -- ── Médias por tipo de avaliador ──────────────────────────────────────
    SELECT AVG(r.nota) INTO v_media_auto
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.tipo = 'autoavaliacao';

    SELECT AVG(r.nota) INTO v_media_pares
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.tipo = 'pares';

    SELECT AVG(r.nota) INTO v_media_gest
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.tipo = 'gestor';

    SELECT AVG(r.nota) INTO v_media_lid
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.tipo = 'liderado';

    -- ── Médias por categoria (apenas avaliações externas para score) ──────
    SELECT AVG(r.nota) INTO v_media_comp
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.tipo != 'autoavaliacao'
      AND r.criterio = ANY(CRITERIOS_COMPORTAMENTAL);

    SELECT AVG(r.nota) INTO v_media_perf
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.tipo != 'autoavaliacao'
      AND r.criterio = ANY(CRITERIOS_PERFORMANCE);

    SELECT AVG(r.nota) INTO v_media_dev
    FROM respostas_avaliacao_360 r
    JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
    WHERE a.ciclo_id = p_ciclo_id
      AND a.avaliado_id = v_avaliado.avaliado_id
      AND a.tipo != 'autoavaliacao'
      AND r.criterio = ANY(CRITERIOS_DESENVOLVIMENTO);

    -- Para probatório: usar todos os critérios juntos
    IF v_ciclo.tipo = 'probatorio' THEN
      SELECT AVG(r.nota) INTO v_media_comp
      FROM respostas_avaliacao_360 r
      JOIN avaliacoes_360 a ON a.id = r.avaliacao_id
      WHERE a.ciclo_id = p_ciclo_id
        AND a.avaliado_id = v_avaliado.avaliado_id
        AND r.criterio = ANY(CRITERIOS_PROB);
      v_media_perf := v_media_comp;
      v_media_dev  := v_media_comp;
    END IF;

    -- ── Score 360 com pesos ───────────────────────────────────────────────
    -- peso_comportamental=0.3, peso_performance=0.4, peso_desenvolvimento=0.3
    v_score_360 := COALESCE(
      (COALESCE(v_media_comp, 0) * 0.3) +
      (COALESCE(v_media_perf, 0) * 0.4) +
      (COALESCE(v_media_dev,  0) * 0.3),
      NULL
    );

    -- ── Score final com pesos do ciclo ────────────────────────────────────
    -- score_final = score_360 * peso_360 + metas * peso_metas + prod * peso_prod
    -- metas e produtividade ainda não têm fonte automática → usam score_360 como proxy
    v_media_geral := COALESCE(v_media_gest, v_media_pares, v_media_auto);

    v_score_final := ROUND(
      COALESCE(v_score_360, 0) * v_ciclo.peso_360 +
      COALESCE(v_score_360, 0) * v_ciclo.peso_metas +
      COALESCE(v_score_360, 0) * v_ciclo.peso_prod,
      2
    );

    -- ── Classificação automática ──────────────────────────────────────────
    v_classif := CASE
      WHEN v_score_final >= 9 THEN 'Top Performer'
      WHEN v_score_final >= 7 THEN 'Alta Performance'
      WHEN v_score_final >= 5 THEN 'Regular'
      ELSE 'Baixa Performance / Risco'
    END;

    -- ── Upsert resultado ──────────────────────────────────────────────────
    INSERT INTO resultado_final_360 (
      ciclo_id, organization_id, avaliado_id,
      media_geral, media_autoavaliacao, media_pares, media_gestor, media_liderado,
      media_comportamental, media_performance, media_desenvolvimento,
      score_360, score_final, classificacao,
      created_at, updated_at
    ) VALUES (
      p_ciclo_id, v_ciclo.organization_id, v_avaliado.avaliado_id,
      v_media_geral, v_media_auto, v_media_pares, v_media_gest, v_media_lid,
      v_media_comp, v_media_perf, v_media_dev,
      v_score_360, v_score_final, v_classif,
      now(), now()
    )
    ON CONFLICT (ciclo_id, avaliado_id) DO UPDATE SET
      media_geral            = EXCLUDED.media_geral,
      media_autoavaliacao    = EXCLUDED.media_autoavaliacao,
      media_pares            = EXCLUDED.media_pares,
      media_gestor           = EXCLUDED.media_gestor,
      media_liderado         = EXCLUDED.media_liderado,
      media_comportamental   = EXCLUDED.media_comportamental,
      media_performance      = EXCLUDED.media_performance,
      media_desenvolvimento  = EXCLUDED.media_desenvolvimento,
      score_360              = EXCLUDED.score_360,
      score_final            = EXCLUDED.score_final,
      classificacao          = EXCLUDED.classificacao,
      updated_at             = now();

  END LOOP;
END;
$$;
