-- Migration 00093: tabela respostas_avaliacao_360
-- Requirements: 3.1, 3.2, 3.3, 3.5, 10.3, 10.4, 11.1

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
DROP POLICY IF EXISTS "respostas_insert" ON respostas_avaliacao_360;
DROP POLICY IF EXISTS "respostas_no_update" ON respostas_avaliacao_360;
DROP POLICY IF EXISTS "respostas_no_delete" ON respostas_avaliacao_360;

-- SELECT: segue regras de avaliacoes_360 via JOIN
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

-- INSERT: apenas o avaliador dono da avaliação (ou service_role)
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

-- UPDATE/DELETE: bloqueado para todos (imutabilidade após submissão)
CREATE POLICY "respostas_no_update" ON respostas_avaliacao_360 FOR UPDATE
  USING (false);

CREATE POLICY "respostas_no_delete" ON respostas_avaliacao_360 FOR DELETE
  USING (false);
