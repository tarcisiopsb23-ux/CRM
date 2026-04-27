-- Migration 00186: Adiciona 'recruitment' ao enum integration_type
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'integration_type' AND e.enumlabel = 'recruitment'
  ) THEN
    ALTER TYPE integration_type ADD VALUE 'recruitment';
  END IF;
END $$;
