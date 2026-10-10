-- =============================================================================
-- Migration 022: Amplia o campo numero em invoices
--
-- O campo numeroNfe retornado pela Notaas pode ter até 52+ caracteres
-- (ex: NFS31686062262659676000149000000000000326040602154784).
-- Amplia de VARCHAR(50) para VARCHAR(100) para acomodar.
-- =============================================================================

ALTER TABLE invoices
  ALTER COLUMN numero TYPE VARCHAR(100);
