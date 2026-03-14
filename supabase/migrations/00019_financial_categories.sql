-- =============================================================================
-- MAESTR.IA - Categorias Financeiras (crédito/débito)
-- =============================================================================

CREATE TABLE IF NOT EXISTS financial_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'financial_categories'
      AND column_name = 'type'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'financial_categories'
      AND column_name = 'category_type'
  ) THEN
    ALTER TABLE financial_categories RENAME COLUMN type TO category_type;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'financial_categories'
      AND column_name = 'category_type'
  ) THEN
    ALTER TABLE financial_categories ADD COLUMN category_type TEXT;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'financial_categories'
      AND column_name = 'type'
  ) THEN
    EXECUTE 'UPDATE financial_categories SET category_type = type WHERE category_type IS NULL';
    ALTER TABLE financial_categories DROP COLUMN IF EXISTS type;
  END IF;
END $$;

UPDATE financial_categories
SET category_type = 'debit'
WHERE category_type IS NULL;

ALTER TABLE financial_categories
  ALTER COLUMN category_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_financial_categories_category_type'
      AND conrelid = 'public.financial_categories'::regclass
  ) THEN
    ALTER TABLE financial_categories
      ADD CONSTRAINT ck_financial_categories_category_type
      CHECK (category_type IN ('credit', 'debit'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_categories_org_type_name
ON financial_categories(organization_id, category_type, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_financial_categories_organization_id
ON financial_categories(organization_id);

ALTER TABLE financial_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_categories_all ON financial_categories;
CREATE POLICY financial_categories_all
ON financial_categories
FOR ALL
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());

DROP TRIGGER IF EXISTS update_financial_categories_updated ON financial_categories;
CREATE TRIGGER update_financial_categories_updated
  BEFORE UPDATE ON financial_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
