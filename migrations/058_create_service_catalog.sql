-- Migration: 058_create_service_catalog.sql
-- Description: Creates the service_catalog table with RLS policies
-- Requirements: 1.1, 1.2, 10.1, 10.4

-- ============================================================
-- Create table
-- ============================================================
CREATE TABLE service_catalog (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 150),
  category        TEXT        NOT NULL CHECK (char_length(category) BETWEEN 1 AND 100),
  sub_services    JSONB       NOT NULL DEFAULT '[]',
  display_order   INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;

-- SELECT: users can only see services from their own organization
CREATE POLICY "service_catalog_select_policy"
  ON service_catalog
  FOR SELECT
  USING (organization_id = get_user_organization_id());

-- INSERT: users can only insert services into their own organization
CREATE POLICY "service_catalog_insert_policy"
  ON service_catalog
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

-- UPDATE: users can only update services from their own organization
CREATE POLICY "service_catalog_update_policy"
  ON service_catalog
  FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- DELETE: users can only delete services from their own organization
CREATE POLICY "service_catalog_delete_policy"
  ON service_catalog
  FOR DELETE
  USING (organization_id = get_user_organization_id());
