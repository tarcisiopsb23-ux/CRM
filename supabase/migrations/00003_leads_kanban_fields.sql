-- Campos adicionais para Kanban de Leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS etapa_kanban VARCHAR(100) DEFAULT 'leads_recebidos',
  ADD COLUMN IF NOT EXISTS nicho VARCHAR(255),
  ADD COLUMN IF NOT EXISTS prioridade VARCHAR(50) DEFAULT 'media';

CREATE INDEX IF NOT EXISTS idx_leads_etapa_kanban ON leads(etapa_kanban);
