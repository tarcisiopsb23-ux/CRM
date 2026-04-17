-- Migration: 20260516000000_clients_plan_fields.sql
--
-- Adiciona campos de plano/contrato na tabela clients,
-- recebidos via provision-tenant a partir do Maestr.ia.
-- Idempotente: usa ADD COLUMN IF NOT EXISTS.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS max_users      INTEGER,
  ADD COLUMN IF NOT EXISTS plan_name      TEXT,
  ADD COLUMN IF NOT EXISTS plan_value     NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS billing_cycle  TEXT,
  ADD COLUMN IF NOT EXISTS due_day        INTEGER CHECK (due_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS contract_end   DATE;
