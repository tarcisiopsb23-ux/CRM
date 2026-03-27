-- Migration: Acesso à crm_leads e campos adicionais
-- 1. Habilita RLS e cria políticas permissivas para anon (banco single-tenant)
-- 2. Adiciona campos para maior clareza em qualquer nicho

-- ── Habilitar RLS e permitir acesso total via anon key ──────────────────────
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_crm_leads" ON crm_leads;
CREATE POLICY "anon_all_crm_leads" ON crm_leads
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── Campos adicionais ────────────────────────────────────────────────────────
-- company: empresa/negócio do lead
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS company VARCHAR(150);

-- origin: canal de origem (whatsapp, instagram, indicacao, site, etc.)
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS origin VARCHAR(100);

-- temperature: temperatura do lead (quente, morno, frio)
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS temperature VARCHAR(20);

-- potential_value: valor potencial estimado do negócio
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS potential_value NUMERIC(12,2);

-- whatsapp_link: link direto para conversa no WhatsApp
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS whatsapp_link TEXT;

-- last_contact_at: data do último contato
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;

-- next_followup_at: data do próximo follow-up agendado
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ;

-- lost_reason: motivo da perda (preenchido ao mover para 'perdido')
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- tags: etiquetas livres separadas por vírgula
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS tags TEXT;

-- updated_at
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Trigger updated_at (reutiliza função existente)
DROP TRIGGER IF EXISTS set_updated_at ON crm_leads;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
