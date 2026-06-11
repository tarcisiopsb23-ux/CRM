-- =============================================================================
-- MAESTR.IA - Listas de Prospecção (Campanhas)
-- Suporta vinculação automática de leads por cidade+nicho
-- =============================================================================

-- =====================
-- 1. CRIAR TABELA LISTAS
-- =====================
CREATE TABLE IF NOT EXISTS listas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  nicho TEXT NOT NULL,
  versao INTEGER DEFAULT 1,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  origem_principal TEXT,
  data_criacao TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'ativa', -- ativa | pausada | encerrada
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Deduplicação: uma lista por (org, cidade, nicho, versao)
  UNIQUE(organization_id, cidade, nicho, versao)
);

-- ==========================================
-- 2. ALTER LEADS - ADICIONAR CAMPOS NOVOS
-- ==========================================
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS lista_id UUID REFERENCES listas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS closer_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ================
-- 3. CRIAR ÍNDICES
-- ================
CREATE INDEX IF NOT EXISTS idx_listas_organization_id ON listas(organization_id);
CREATE INDEX IF NOT EXISTS idx_listas_cidade_nicho ON listas(organization_id, cidade, nicho, status);
CREATE INDEX IF NOT EXISTS idx_leads_lista_id ON leads(lista_id);
CREATE INDEX IF NOT EXISTS idx_leads_closer_id ON leads(closer_id);

-- ================================================
-- 4. TABELA DE HISTÓRICO DE VINCULAÇÃO DE LEADS
-- ================================================
CREATE TABLE IF NOT EXISTS lead_lista_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  lista_id_from UUID REFERENCES listas(id) ON DELETE SET NULL,
  lista_id_to UUID REFERENCES listas(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_lead_lista_history_lead_id ON lead_lista_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_lista_history_organization ON lead_lista_history(organization_id);

-- ======================================
-- 5. FUNÇÃO: VINCULAR LEAD A LISTA AUTO
-- ======================================
CREATE OR REPLACE FUNCTION link_lead_to_lista(
  p_lead_id UUID,
  p_organization_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_lista_id UUID;
  v_cidade TEXT;
  v_nicho TEXT;
  v_lista_id_anterior UUID;
BEGIN
  -- Obter cidade e nicho do lead
  SELECT 
    metadata->>'cidade',
    nicho,
    lista_id
  INTO v_cidade, v_nicho, v_lista_id_anterior
  FROM leads 
  WHERE id = p_lead_id 
    AND organization_id = p_organization_id;

  -- Se não tem cidade ou nicho, não vincular
  IF v_cidade IS NULL OR v_nicho IS NULL THEN
    RETURN NULL;
  END IF;

  -- Buscar lista com EXACT match (cidade + nicho)
  SELECT id INTO v_lista_id
  FROM listas
  WHERE organization_id = p_organization_id
    AND cidade = v_cidade
    AND nicho = v_nicho
    AND status = 'ativa'
  ORDER BY versao DESC
  LIMIT 1;

  -- Se encontrou, vincular e registrar histórico
  IF v_lista_id IS NOT NULL AND v_lista_id != v_lista_id_anterior THEN
    UPDATE leads 
    SET lista_id = v_lista_id
    WHERE id = p_lead_id;

    INSERT INTO lead_lista_history(
      organization_id, lead_id, lista_id_from, lista_id_to, reason
    ) VALUES (
      p_organization_id, p_lead_id, v_lista_id_anterior, v_lista_id, 'auto_link'
    );
  END IF;

  RETURN v_lista_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. FUNÇÃO: AUTO-VINCULAR LEADS COM LISTA_ID NULA
-- ============================================================
CREATE OR REPLACE FUNCTION auto_link_pending_leads(
  p_organization_id UUID
)
RETURNS TABLE(linked_count INTEGER, error_msg TEXT) AS $$
DECLARE
  v_lead_id UUID;
  v_cursor CURSOR FOR 
    SELECT id FROM leads 
    WHERE organization_id = p_organization_id 
      AND lista_id IS NULL 
      AND (metadata->>'cidade' IS NOT NULL)
      AND (nicho IS NOT NULL);
  v_linked_count INTEGER := 0;
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

-- ======================================
-- 7. ATIVAR REALTIME PARA TABELAS NOVAS
-- ======================================
ALTER PUBLICATION supabase_realtime ADD TABLE listas;
ALTER PUBLICATION supabase_realtime ADD TABLE lead_lista_history;

-- ========================================
-- 8. ROW LEVEL SECURITY - LISTAS
-- ========================================
ALTER TABLE listas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listas_read ON listas;
DROP POLICY IF EXISTS listas_insert ON listas;
DROP POLICY IF EXISTS listas_update ON listas;
DROP POLICY IF EXISTS listas_delete ON listas;

-- Ler: Owner, Admin, Member (tudo que tem acesso à org)
CREATE POLICY listas_read ON listas FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Inserir: Owner, Admin
CREATE POLICY listas_insert ON listas FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

-- Atualizar: Owner, Admin
CREATE POLICY listas_update ON listas FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

-- Deletar: Owner apenas
CREATE POLICY listas_delete ON listas FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner']::user_role[])
  );

-- ================================================
-- 9. ROW LEVEL SECURITY - LEAD_LISTA_HISTORY
-- ================================================
ALTER TABLE lead_lista_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_lista_history_read ON lead_lista_history;
DROP POLICY IF EXISTS lead_lista_history_insert ON lead_lista_history;

CREATE POLICY lead_lista_history_read ON lead_lista_history FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY lead_lista_history_insert ON lead_lista_history FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

-- ============================================
-- 10. TRIGGERS - ATUALIZAR UPDATED_AT LISTAS
-- ============================================
CREATE OR REPLACE FUNCTION update_listas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS listas_updated_at_trigger ON listas;
CREATE TRIGGER listas_updated_at_trigger
  BEFORE UPDATE ON listas
  FOR EACH ROW
  EXECUTE FUNCTION update_listas_updated_at();

-- ============================================================
-- 11. COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ============================================================
COMMENT ON TABLE listas IS 'Listas de Prospecção/Campanhas com suporte a versioning e deduplicação por cidade+nicho';
COMMENT ON COLUMN listas.versao IS 'Versão da lista (múltiplas versões para mesmo cidade+nicho)';
COMMENT ON COLUMN listas.status IS 'Estado da lista: ativa | pausada | encerrada';
COMMENT ON TABLE lead_lista_history IS 'Histórico de vinculações de leads a listas (para auditoria)';
COMMENT ON FUNCTION link_lead_to_lista IS 'Vincula um lead a uma lista automaticamente por cidade+nicho';
COMMENT ON FUNCTION auto_link_pending_leads IS 'Executa vinculação em lote para todos os leads pendentes (lista_id IS NULL)';
