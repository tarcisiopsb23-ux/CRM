-- Migration 00092: tabela avaliacoes_360
-- Requirements: 2.1, 2.2, 2.3, 3.4, 3.5, 4.1, 4.2, 4.3, 11.1

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
DROP POLICY IF EXISTS "avaliacoes_write" ON avaliacoes_360;

-- SELECT: avaliador vê suas próprias; avaliado vê sobre si; admin/owner veem tudo da org
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

-- INSERT/UPDATE: service_role (geração automática) e admin/owner
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
