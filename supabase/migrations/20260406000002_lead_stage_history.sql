-- Migration: Lead Stage History
-- Tracks every stage a lead passes through, including implicit stages.
-- Rule: if a lead jumps from "novo" directly to "fechado", all intermediate
-- stages (contato, proposta, negociacao) are recorded with the same timestamp.
-- Records are NEVER deleted when a lead moves to another stage.

CREATE TABLE IF NOT EXISTS crm_lead_stage_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID        NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  stage      TEXT        NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- implicit = true means this stage was inferred (lead skipped it)
  implicit   BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead_id    ON crm_lead_stage_history (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_stage      ON crm_lead_stage_history (stage);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_entered_at ON crm_lead_stage_history (entered_at DESC);

-- RLS
ALTER TABLE crm_lead_stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_lead_stage_history" ON crm_lead_stage_history;
CREATE POLICY "anon_all_lead_stage_history" ON crm_lead_stage_history
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger function: records stage transitions with implicit stage fill-in
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_lead_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  -- Ordered pipeline stages (excluding "perdido" and "follow_up" which are terminal/post-sale)
  pipeline TEXT[] := ARRAY['novo', 'contato', 'proposta', 'negociacao', 'fechado'];
  old_idx  INT;
  new_idx  INT;
  i        INT;
  stage    TEXT;
BEGIN
  -- Only act on status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Find positions in pipeline
  old_idx := array_position(pipeline, OLD.status);
  new_idx := array_position(pipeline, NEW.status);

  -- If moving to "perdido" or from an unknown stage, just record the new stage
  IF new_idx IS NULL OR old_idx IS NULL THEN
    INSERT INTO crm_lead_stage_history (lead_id, stage, entered_at, implicit)
    VALUES (NEW.id, NEW.status, now(), false);
    RETURN NEW;
  END IF;

  -- If moving forward, fill in all skipped intermediate stages as implicit
  IF new_idx > old_idx THEN
    FOR i IN (old_idx + 1)..(new_idx - 1) LOOP
      stage := pipeline[i];
      -- Only insert if this stage hasn't been recorded yet for this lead
      IF NOT EXISTS (
        SELECT 1 FROM crm_lead_stage_history
        WHERE lead_id = NEW.id AND stage = pipeline[i]
      ) THEN
        INSERT INTO crm_lead_stage_history (lead_id, stage, entered_at, implicit)
        VALUES (NEW.id, pipeline[i], now(), true);
      END IF;
    END LOOP;
  END IF;

  -- Always record the actual new stage (explicit)
  INSERT INTO crm_lead_stage_history (lead_id, stage, entered_at, implicit)
  VALUES (NEW.id, NEW.status, now(), false);

  RETURN NEW;
END;
$$;

-- Attach trigger to crm_leads
DROP TRIGGER IF EXISTS trg_lead_stage_change ON crm_leads;
CREATE TRIGGER trg_lead_stage_change
  AFTER UPDATE OF status ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION record_lead_stage_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: record initial "novo" stage for all existing leads
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO crm_lead_stage_history (lead_id, stage, entered_at, implicit)
SELECT id, 'novo', created_at, false
FROM crm_leads
WHERE NOT EXISTS (
  SELECT 1 FROM crm_lead_stage_history
  WHERE lead_id = crm_leads.id AND stage = 'novo'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_funnel_stats(date_from, date_to)
-- Returns funnel counts per stage for the given date range.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_funnel_stats(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE (
  stage       TEXT,
  total       BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    stage,
    COUNT(DISTINCT lead_id) AS total
  FROM crm_lead_stage_history
  WHERE entered_at >= p_from
    AND entered_at <= p_to
    -- follow_up is a post-sale stage, excluded from funnel metrics
    AND stage NOT IN ('follow_up')
  GROUP BY stage
  ORDER BY
    CASE stage
      WHEN 'novo'       THEN 1
      WHEN 'contato'    THEN 2
      WHEN 'proposta'   THEN 3
      WHEN 'negociacao' THEN 4
      WHEN 'fechado'    THEN 5
      WHEN 'perdido'    THEN 6
      ELSE 7
    END;
$$;
