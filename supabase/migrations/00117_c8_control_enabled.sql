-- Migration 00117: ADD COLUMN c8_control_enabled na tabela clients
-- Habilita o produto C8 Control (CRM externo) por cliente

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS c8_control_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_c8_control
  ON public.clients (c8_control_enabled);
