-- Migration 00091: tabela ciclos_avaliacao
-- Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 11.1

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
DROP POLICY IF EXISTS "ciclos_write" ON ciclos_avaliacao;

-- Leitura para todos da organização
CREATE POLICY "ciclos_select" ON ciclos_avaliacao FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = ciclos_avaliacao.organization_id
    )
  );

-- Escrita apenas admin/owner
CREATE POLICY "ciclos_write" ON ciclos_avaliacao FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = ciclos_avaliacao.organization_id
        AND p.role IN ('admin','owner')
    )
  );
