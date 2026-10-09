-- Migration: adiciona product_name em crm_leads para desnormalizar o nome do produto proposto
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
