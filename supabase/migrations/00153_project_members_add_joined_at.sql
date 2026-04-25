-- Add joined_at column to project_members if it doesn't exist
-- The remote database was created without this column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_members'
      AND column_name = 'joined_at'
  ) THEN
    ALTER TABLE project_members
      ADD COLUMN joined_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
