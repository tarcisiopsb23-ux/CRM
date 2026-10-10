-- =============================================================================
-- Migration 024: Tabela de compartilhamentos de pastas/arquivos no Drive
-- Registra quem compartilhou, com quem, quando e o item compartilhado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS drive_shares (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Item compartilhado
  item_id          TEXT NOT NULL,          -- ID da pasta ou arquivo no Google Drive
  item_name        TEXT NOT NULL,          -- Nome da pasta ou arquivo
  item_type        TEXT NOT NULL CHECK (item_type IN ('folder', 'file')),

  -- Compartilhamento
  shared_with      TEXT NOT NULL,          -- E-mail de quem recebeu acesso
  role             TEXT NOT NULL DEFAULT 'reader', -- reader | commenter | writer
  shared_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  shared_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Revogação
  revoked_at       TIMESTAMPTZ,
  revoked_by       UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_drive_shares_org      ON drive_shares(organization_id);
CREATE INDEX IF NOT EXISTS idx_drive_shares_item     ON drive_shares(item_id);
CREATE INDEX IF NOT EXISTS idx_drive_shares_active   ON drive_shares(item_id) WHERE revoked_at IS NULL;

-- RLS
ALTER TABLE drive_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drive_shares_org_access" ON drive_shares
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
