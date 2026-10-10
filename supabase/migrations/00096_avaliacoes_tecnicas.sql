-- Migration 00096: tabela avaliacoes_tecnicas
-- Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8

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

-- Estrutura do campo criterios (JSONB):
-- [{ "nome": "Domínio técnico", "nota": 4, "comentario": "..." }, ...]

CREATE INDEX IF NOT EXISTS idx_avaliacoes_tecnicas_colaborador ON avaliacoes_tecnicas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_tecnicas_org ON avaliacoes_tecnicas(organization_id);

ALTER TABLE avaliacoes_tecnicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacoes_tecnicas_select" ON avaliacoes_tecnicas;
DROP POLICY IF EXISTS "avaliacoes_tecnicas_insert" ON avaliacoes_tecnicas;
DROP POLICY IF EXISTS "avaliacoes_tecnicas_no_update" ON avaliacoes_tecnicas;
DROP POLICY IF EXISTS "avaliacoes_tecnicas_no_delete" ON avaliacoes_tecnicas;

-- SELECT: o próprio colaborador, gestores, admin/owner da organização
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

-- INSERT: apenas admin/owner
CREATE POLICY "avaliacoes_tecnicas_insert" ON avaliacoes_tecnicas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = avaliacoes_tecnicas.organization_id
        AND p.role IN ('admin','owner')
    )
  );

-- UPDATE/DELETE: bloqueado para todos (imutabilidade após criação)
CREATE POLICY "avaliacoes_tecnicas_no_update" ON avaliacoes_tecnicas FOR UPDATE
  USING (false);

CREATE POLICY "avaliacoes_tecnicas_no_delete" ON avaliacoes_tecnicas FOR DELETE
  USING (false);
