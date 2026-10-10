-- =============================================================================
-- MAESTR.IA - Histórico de movimentação do Kanban
-- =============================================================================
-- Registra todas as alterações de etapa para analytics do funil
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage VARCHAR(100) NOT NULL,
  to_stage VARCHAR(100) NOT NULL,
  moved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead_id
  ON lead_stage_history(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_moved_at
  ON lead_stage_history(moved_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_to_stage
  ON lead_stage_history(to_stage);

ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;

-- Usuários da org podem ver histórico dos leads da org
CREATE POLICY lead_stage_history_select ON lead_stage_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_id
        AND l.organization_id = get_user_organization_id()
    )
  );

-- Apenas inserção via trigger (não expor INSERT direto ao client)
-- O trigger roda com SECURITY DEFINER e faz o insert
DROP POLICY IF EXISTS lead_stage_history_insert ON lead_stage_history;

-- Trigger: registra movimentação quando etapa_kanban muda
CREATE OR REPLACE FUNCTION record_lead_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.etapa_kanban IS DISTINCT FROM NEW.etapa_kanban THEN
    INSERT INTO lead_stage_history (lead_id, from_stage, to_stage, moved_by, moved_at)
    VALUES (
      NEW.id,
      COALESCE(OLD.etapa_kanban::text, 'leads_recebidos'),
      COALESCE(NEW.etapa_kanban::text, 'leads_recebidos'),
      auth.uid(),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_lead_stage_change ON leads;
CREATE TRIGGER on_lead_stage_change
  AFTER UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION record_lead_stage_change();
