-- Add target_value (meta) column to client_kpis
ALTER TABLE public.client_kpis
  ADD COLUMN IF NOT EXISTS target_value DECIMAL(18,2) DEFAULT NULL;
