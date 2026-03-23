-- ============================================================
-- SCRIPT CONSOLIDADO — Avaliação 360°
-- Execute este arquivo no SQL Editor do Supabase Dashboard
-- ============================================================

-- 00091: ciclos_avaliacao
CREATE TABLE IF NOT EXISTS ciclos_avaliacao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  data_inicio     DATE NOT NULL,
  data_fim        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','encerrado')),
  tipo            TEXT NOT NULL DEFAULT '360' CHECK (tipo IN ('360','checkin')),
  peso_360        DECIMAL(4,2) NOT NULL DEFAULT 0.60,
  peso_metas      DECIMAL(4,2) NOT NULL DEFAULT 0.25,
  peso_prod       DECIMAL(4,2) NOT NULL DEFAULT 0.15,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_datas CHECK (data_fim >= data_inicio),
  CONSTRAINT chk_pesos CHECK (ABS((peso_360 + peso_metas + peso_prod) - 1.0) < 0.001)
);

CREATE INDEX IF NOT EXISTS idx_ciclos_avaliacao_org ON ciclos_avaliacao(organization_id);
CREATE INDEX IF NOT EXISTS idx_ciclos_avaliacao_status ON ciclos_avaliacao(status);

ALTER TABLE ciclos_avaliacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ciclos_select" ON ciclos_avaliacao;
CREATE POLICY "ciclos_select" ON ciclos_avaliacao FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = ciclos_avaliacao.organization_id
    )
  );

DROP POLICY IF EXISTS "ciclos_write" ON ciclos_avaliacao;
CREATE POLICY "ciclos_write" ON ciclos_avaliacao FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = ciclos_avaliacao.organization_id
        AND p.role IN ('admin','owner')
    )
  );

-- 00092: avaliacoes_360
CREATE TABLE IF NOT EXISTS avaliacoes_360 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id        UUID NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  avaliador_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  avaliado_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('autoavaliacao','gestor','pares','liderado')),
  anonimo         BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluido')),
  data_resposta   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ciclo_id, avaliador_id, avaliado_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_360_ciclo ON avaliacoes_360(ciclo_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_360_avaliador ON avaliacoes_360(avaliador_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_360_avaliado ON avaliacoes_360(avaliado_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_360_org ON avaliacoes_360(organization_id);

ALTER TABLE avaliacoes_360 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacoes_select" ON avaliacoes_360;
CREATE POLICY "avaliacoes_select" ON avaliacoes_360 FOR SELECT
  USING (
    avaliador_id = auth.uid()
    OR (avaliado_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_360.organization_id
        AND p.role IN ('admin','owner')
    )
  );

DROP POLICY IF EXISTS "avaliacoes_write" ON avaliacoes_360;
CREATE POLICY "avaliacoes_write" ON avaliacoes_360 FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_360.organization_id
        AND p.role IN ('admin','owner')
    )
  );

-- 00093: respostas_avaliacao_360
CREATE TABLE IF NOT EXISTS respostas_avaliacao_360 (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id  UUID NOT NULL REFERENCES avaliacoes_360(id) ON DELETE CASCADE,
  criterio      TEXT NOT NULL CHECK (criterio IN (
    'comunicacao','trabalho_em_equipe','proatividade',
    'responsabilidade','qualidade_entrega','alinhamento_cultural'
  )),
  nota          SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (avaliacao_id, criterio)
);

CREATE INDEX IF NOT EXISTS idx_respostas_360_avaliacao ON respostas_avaliacao_360(avaliacao_id);

ALTER TABLE respostas_avaliacao_360 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "respostas_select" ON respostas_avaliacao_360;
CREATE POLICY "respostas_select" ON respostas_avaliacao_360 FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM avaliacoes_360 a
      WHERE a.id = respostas_avaliacao_360.avaliacao_id
        AND (
          a.avaliador_id = auth.uid()
          OR a.avaliado_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.organization_id = a.organization_id
              AND p.role IN ('admin','owner')
          )
        )
    )
  );

DROP POLICY IF EXISTS "respostas_insert" ON respostas_avaliacao_360;
CREATE POLICY "respostas_insert" ON respostas_avaliacao_360 FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM avaliacoes_360 a
      WHERE a.id = respostas_avaliacao_360.avaliacao_id
        AND a.avaliador_id = auth.uid()
        AND a.status = 'pendente'
    )
  );

DROP POLICY IF EXISTS "respostas_no_update" ON respostas_avaliacao_360;
CREATE POLICY "respostas_no_update" ON respostas_avaliacao_360 FOR UPDATE USING (false);

DROP POLICY IF EXISTS "respostas_no_delete" ON respostas_avaliacao_360;
CREATE POLICY "respostas_no_delete" ON respostas_avaliacao_360 FOR DELETE USING (false);

-- 00094: resultado_final_360
CREATE TABLE IF NOT EXISTS resultado_final_360 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id              UUID NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL,
  avaliado_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_geral           DECIMAL(4,2),
  media_autoavaliacao   DECIMAL(4,2),
  media_pares           DECIMAL(4,2),
  media_gestor          DECIMAL(4,2),
  media_liderado        DECIMAL(4,2),
  score_final           DECIMAL(4,2),
  feedback_final        TEXT,
  feedback_updated_at   TIMESTAMPTZ,
  feedback_updated_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ciclo_id, avaliado_id)
);

CREATE INDEX IF NOT EXISTS idx_resultado_360_ciclo ON resultado_final_360(ciclo_id);
CREATE INDEX IF NOT EXISTS idx_resultado_360_avaliado ON resultado_final_360(avaliado_id);
CREATE INDEX IF NOT EXISTS idx_resultado_360_org ON resultado_final_360(organization_id);

ALTER TABLE resultado_final_360 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resultado_select" ON resultado_final_360;
CREATE POLICY "resultado_select" ON resultado_final_360 FOR SELECT
  USING (
    avaliado_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = resultado_final_360.organization_id
        AND p.role IN ('admin','owner','manager')
    )
  );

DROP POLICY IF EXISTS "resultado_write" ON resultado_final_360;
CREATE POLICY "resultado_write" ON resultado_final_360 FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = resultado_final_360.organization_id
        AND p.role IN ('admin','owner','manager')
    )
  );

-- 00095: audit_log_360
CREATE TABLE IF NOT EXISTS audit_log_360 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  previous_data   JSONB,
  new_data        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_360_org ON audit_log_360(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_360_entity ON audit_log_360(entity_type, entity_id);

ALTER TABLE audit_log_360 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON audit_log_360;
CREATE POLICY "audit_log_select" ON audit_log_360 FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = audit_log_360.organization_id
        AND p.role IN ('admin','owner')
    )
  );

DROP POLICY IF EXISTS "audit_log_insert" ON audit_log_360;
CREATE POLICY "audit_log_insert" ON audit_log_360 FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);

-- 00096: avaliacoes_tecnicas
CREATE TABLE IF NOT EXISTS avaliacoes_tecnicas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  colaborador_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  avaliador_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  titulo          TEXT NOT NULL CHECK (trim(titulo) <> ''),
  data            DATE NOT NULL,
  criterios       JSONB NOT NULL DEFAULT '[]'::jsonb,
  nota_geral      SMALLINT NOT NULL CHECK (nota_geral BETWEEN 1 AND 5),
  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_tecnicas_colaborador ON avaliacoes_tecnicas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_tecnicas_org ON avaliacoes_tecnicas(organization_id);

ALTER TABLE avaliacoes_tecnicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacoes_tecnicas_select" ON avaliacoes_tecnicas;
CREATE POLICY "avaliacoes_tecnicas_select" ON avaliacoes_tecnicas FOR SELECT
  USING (
    colaborador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_tecnicas.organization_id
        AND p.role IN ('admin','owner','manager')
    )
  );

DROP POLICY IF EXISTS "avaliacoes_tecnicas_insert" ON avaliacoes_tecnicas;
CREATE POLICY "avaliacoes_tecnicas_insert" ON avaliacoes_tecnicas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_tecnicas.organization_id
        AND p.role IN ('admin','owner')
    )
  );

DROP POLICY IF EXISTS "avaliacoes_tecnicas_no_update" ON avaliacoes_tecnicas;
CREATE POLICY "avaliacoes_tecnicas_no_update" ON avaliacoes_tecnicas FOR UPDATE USING (false);

DROP POLICY IF EXISTS "avaliacoes_tecnicas_no_delete" ON avaliacoes_tecnicas;
CREATE POLICY "avaliacoes_tecnicas_no_delete" ON avaliacoes_tecnicas FOR DELETE USING (false);

-- 00097: RPC generate_360_avaliacoes
CREATE OR REPLACE FUNCTION generate_360_avaliacoes(p_ciclo_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ciclo ciclos_avaliacao%ROWTYPE;
  v_avaliado RECORD;
  v_gestor_id UUID;
  v_par RECORD;
BEGIN
  SELECT * INTO v_ciclo FROM ciclos_avaliacao WHERE id = p_ciclo_id;

  FOR v_avaliado IN
    SELECT p.id FROM profiles p
    WHERE p.organization_id = v_ciclo.organization_id
      AND p.is_active = true
      AND p.role IN ('member','manager')
  LOOP
    INSERT INTO avaliacoes_360 (ciclo_id, organization_id, avaliador_id, avaliado_id, tipo, anonimo)
    VALUES (p_ciclo_id, v_ciclo.organization_id, v_avaliado.id, v_avaliado.id, 'autoavaliacao', false)
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
      VALUES (p_ciclo_id, v_ciclo.organization_id, v_gestor_id, v_avaliado.id, 'gestor', false)
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
      VALUES (p_ciclo_id, v_ciclo.organization_id, v_par.profile_id, v_avaliado.id, 'pares', true)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS after_ciclo_insert ON ciclos_avaliacao;

CREATE OR REPLACE FUNCTION trigger_generate_avaliacoes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM generate_360_avaliacoes(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_ciclo_insert
  AFTER INSERT ON ciclos_avaliacao
  FOR EACH ROW EXECUTE FUNCTION trigger_generate_avaliacoes();

-- 00098: RPC close_ciclo
CREATE OR REPLACE FUNCTION close_ciclo(p_ciclo_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ciclo ciclos_avaliacao%ROWTYPE;
  v_caller_org UUID;
  v_caller_role TEXT;
BEGIN
  SELECT organization_id, role INTO v_caller_org, v_caller_role
  FROM profiles WHERE id = auth.uid();

  SELECT * INTO v_ciclo FROM ciclos_avaliacao WHERE id = p_ciclo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Ciclo não encontrado');
  END IF;

  IF v_ciclo.organization_id != v_caller_org THEN
    RETURN jsonb_build_object('error', 'Acesso negado');
  END IF;

  IF v_caller_role NOT IN ('admin','owner') THEN
    RETURN jsonb_build_object('error', 'Apenas admin ou owner podem encerrar ciclos');
  END IF;

  IF v_ciclo.status = 'encerrado' THEN
    RETURN jsonb_build_object('error', 'Ciclo já está encerrado');
  END IF;

  UPDATE ciclos_avaliacao
  SET status = 'encerrado', updated_at = now()
  WHERE id = p_ciclo_id;

  INSERT INTO audit_log_360 (organization_id, user_id, action, entity_type, entity_id, previous_data, new_data)
  VALUES (
    v_ciclo.organization_id,
    auth.uid(),
    'close_ciclo',
    'ciclo_avaliacao',
    p_ciclo_id,
    jsonb_build_object('status', 'ativo'),
    jsonb_build_object('status', 'encerrado', 'closed_at', now())
  );

  RETURN jsonb_build_object('success', true, 'ciclo_id', p_ciclo_id);
END;
$$;
