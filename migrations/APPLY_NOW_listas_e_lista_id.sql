-- =============================================================================
-- APPLY NOW: Listas de Prospecção + coluna lista_id em leads
-- Aplicar no Banco A (banco da agência) via Supabase SQL Editor
-- Idempotente — pode ser executado múltiplas vezes sem erro
-- =============================================================================

-- 1. TABELA LISTAS
-- =============================================================================
CREATE TABLE IF NOT EXISTS listas (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             TEXT        NOT NULL,
  cidade           TEXT        NOT NULL,
  estado           TEXT        NOT NULL,
  nicho            TEXT        NOT NULL,
  versao           INTEGER     DEFAULT 1,
  responsavel_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  origem_principal TEXT,
  data_criacao     TIMESTAMP   DEFAULT NOW(),
  status           TEXT        DEFAULT 'ativa',   -- ativa | pausada | encerrada
  observacoes      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, cidade, nicho, versao)
);

-- 2. COLUNA lista_id EM LEADS + closer_id
-- =============================================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lista_id  UUID REFERENCES listas(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closer_id UUID REFERENCES profiles(id)  ON DELETE SET NULL;

-- 3. TABELA HISTÓRICO DE VINCULAÇÃO
-- =============================================================================
CREATE TABLE IF NOT EXISTS lead_lista_history (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id          UUID        NOT NULL REFERENCES leads(id)         ON DELETE CASCADE,
  lista_id_from    UUID        REFERENCES listas(id)                 ON DELETE SET NULL,
  lista_id_to      UUID        REFERENCES listas(id)                 ON DELETE SET NULL,
  changed_by       UUID        REFERENCES profiles(id)               ON DELETE SET NULL,
  changed_at       TIMESTAMPTZ DEFAULT NOW(),
  reason           TEXT
);

-- 4. ÍNDICES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_listas_organization_id
  ON listas(organization_id);

CREATE INDEX IF NOT EXISTS idx_listas_cidade_nicho
  ON listas(organization_id, cidade, nicho, status);

CREATE INDEX IF NOT EXISTS idx_leads_lista_id
  ON leads(lista_id);

CREATE INDEX IF NOT EXISTS idx_leads_closer_id
  ON leads(closer_id);

CREATE INDEX IF NOT EXISTS idx_lead_lista_history_lead_id
  ON lead_lista_history(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_lista_history_organization
  ON lead_lista_history(organization_id);

-- 5. FUNÇÃO: link_lead_to_lista
-- =============================================================================
CREATE OR REPLACE FUNCTION link_lead_to_lista(
  p_lead_id         UUID,
  p_organization_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_lista_id          UUID;
  v_cidade            TEXT;
  v_nicho             TEXT;
  v_lista_id_anterior UUID;
  v_lista_cidade      TEXT;
  v_lista_nicho       TEXT;
  v_cur_metadata      JSONB;
BEGIN
  SELECT metadata->>'cidade', nicho, lista_id, metadata
    INTO v_cidade, v_nicho, v_lista_id_anterior, v_cur_metadata
    FROM leads
   WHERE id = p_lead_id AND organization_id = p_organization_id;

  -- Sem cidade E sem nicho não é possível localizar uma lista
  IF v_cidade IS NULL AND v_nicho IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, cidade, nicho INTO v_lista_id, v_lista_cidade, v_lista_nicho
    FROM listas
   WHERE organization_id = p_organization_id
     AND (cidade = v_cidade OR v_cidade IS NULL)
     AND (nicho  = v_nicho  OR v_nicho  IS NULL)
     AND status = 'ativa'
   ORDER BY versao DESC
   LIMIT 1;

  IF v_lista_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Vincular lista
  IF v_lista_id IS DISTINCT FROM v_lista_id_anterior THEN
    UPDATE leads SET lista_id = v_lista_id WHERE id = p_lead_id;

    INSERT INTO lead_lista_history(
      organization_id, lead_id, lista_id_from, lista_id_to, reason
    ) VALUES (
      p_organization_id, p_lead_id, v_lista_id_anterior, v_lista_id, 'auto_link'
    );
  END IF;

  -- Backfill metadata.cidade se o lead não tiver cidade própria
  IF v_cidade IS NULL AND v_lista_cidade IS NOT NULL THEN
    UPDATE leads
       SET metadata = COALESCE(v_cur_metadata, '{}'::jsonb) || jsonb_build_object('cidade', v_lista_cidade)
     WHERE id = p_lead_id;
  END IF;

  -- Backfill nicho se o lead não tiver nicho próprio
  IF v_nicho IS NULL AND v_lista_nicho IS NOT NULL THEN
    UPDATE leads
       SET nicho = v_lista_nicho
     WHERE id = p_lead_id;
  END IF;

  RETURN v_lista_id;
END;
$$ LANGUAGE plpgsql;

-- 6. FUNÇÃO: auto_link_pending_leads
-- =============================================================================
CREATE OR REPLACE FUNCTION auto_link_pending_leads(
  p_organization_id UUID
)
RETURNS TABLE(linked_count INTEGER, error_msg TEXT) AS $$
DECLARE
  v_lead_id      UUID;
  v_linked_count INTEGER := 0;
  v_cursor CURSOR FOR
    SELECT id FROM leads
     WHERE organization_id = p_organization_id
       AND lista_id IS NULL
       AND (metadata->>'cidade' IS NOT NULL)
       AND nicho IS NOT NULL;
BEGIN
  OPEN v_cursor;
  LOOP
    FETCH v_cursor INTO v_lead_id;
    EXIT WHEN v_lead_id IS NULL;
    PERFORM link_lead_to_lista(v_lead_id, p_organization_id);
    v_linked_count := v_linked_count + 1;
  END LOOP;
  CLOSE v_cursor;
  RETURN QUERY SELECT v_linked_count, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 7. REALTIME
-- =============================================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE listas;
EXCEPTION WHEN duplicate_object OR others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE lead_lista_history;
EXCEPTION WHEN duplicate_object OR others THEN NULL; END $$;

-- 8. ROW LEVEL SECURITY — LISTAS
-- =============================================================================
ALTER TABLE listas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listas_read   ON listas;
DROP POLICY IF EXISTS listas_insert ON listas;
DROP POLICY IF EXISTS listas_update ON listas;
DROP POLICY IF EXISTS listas_delete ON listas;

CREATE POLICY listas_read ON listas FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY listas_insert ON listas FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

CREATE POLICY listas_update ON listas FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

CREATE POLICY listas_delete ON listas FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner']::user_role[])
  );

-- 9. ROW LEVEL SECURITY — LEAD_LISTA_HISTORY
-- =============================================================================
ALTER TABLE lead_lista_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_lista_history_read   ON lead_lista_history;
DROP POLICY IF EXISTS lead_lista_history_insert ON lead_lista_history;

CREATE POLICY lead_lista_history_read ON lead_lista_history FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY lead_lista_history_insert ON lead_lista_history FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());
