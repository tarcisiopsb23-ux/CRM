-- Migration 059: Alter existing contract tables (non-destructive)
-- Adds 'structure' column to contract_templates and
-- 'min_duration_months' column to contracts.
-- Safe to re-run: uses IF NOT EXISTS, does not modify existing data.

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS structure JSONB DEFAULT NULL;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS min_duration_months INTEGER NOT NULL DEFAULT 0;
