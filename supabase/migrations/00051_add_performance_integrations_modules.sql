BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'performance'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'performance';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'integrations'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'integrations';
  END IF;
END $$;

COMMIT;
