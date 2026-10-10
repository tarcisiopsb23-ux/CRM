-- Migration 00094: tabela resultado_final_360
-- Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 7.1, 7.2, 8.1, 8.2, 11.1

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
DROP POLICY IF EXISTS "resultado_write" ON resultado_final_360;

-- SELECT: o próprio avaliado, gestores, admin/owner
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

-- INSERT/UPDATE: service_role (consolidação) e gestores/admin para feedback_final
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
