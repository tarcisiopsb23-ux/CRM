BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'dashboard'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'dashboard';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'crm'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'crm';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'sales_analytics'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'sales_analytics';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'whatsapp'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'whatsapp';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'meetings'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'meetings';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'reports'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'reports';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'campaigns'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'campaigns';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'audit'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'audit';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'permission_module' AND e.enumlabel = 'timeclock'
  ) THEN
    ALTER TYPE permission_module ADD VALUE 'timeclock';
  END IF;
END $$;

COMMIT;

