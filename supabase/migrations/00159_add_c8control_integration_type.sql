-- Migration 00159: Adiciona 'c8control' ao enum integration_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'c8control'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'integration_type')
  ) THEN
    ALTER TYPE integration_type ADD VALUE 'c8control';
  END IF;
END $$;
