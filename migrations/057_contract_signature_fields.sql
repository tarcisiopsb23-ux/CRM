-- Adicionar campos de assinatura e geração do contrato
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS is_signed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES contract_templates(id);
