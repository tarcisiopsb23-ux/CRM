-- =============================================================================
-- Migration 010: Código numérico para clients, projects e suppliers
-- Cada entidade recebe um código sequencial por organização (ex: CLI-0001)
-- =============================================================================

-- Adiciona coluna code nas três tabelas
ALTER TABLE clients   ADD COLUMN IF NOT EXISTS code INTEGER;
ALTER TABLE projects  ADD COLUMN IF NOT EXISTS code INTEGER;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS code INTEGER;

-- Índices únicos por organização (garante que CLI-0001 não se repita dentro da mesma org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_code   ON clients(organization_id, code)   WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_code  ON projects(organization_id, code)  WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_org_code ON suppliers(organization_id, code) WHERE code IS NOT NULL;

-- ─── Função genérica que gera o próximo código para qualquer tabela ───────────
CREATE OR REPLACE FUNCTION next_entity_code(p_table TEXT, p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(MAX(code), 0) FROM %I WHERE organization_id = $1',
    p_table
  ) INTO v_max USING p_org_id;
  RETURN v_max + 1;
END;
$$;

-- ─── Triggers: preenchem code automaticamente ao inserir ─────────────────────

CREATE OR REPLACE FUNCTION trg_set_client_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := next_entity_code('clients', NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_client_code ON clients;
CREATE TRIGGER set_client_code
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION trg_set_client_code();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_set_project_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := next_entity_code('projects', NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_project_code ON projects;
CREATE TRIGGER set_project_code
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION trg_set_project_code();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_set_supplier_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := next_entity_code('suppliers', NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_supplier_code ON suppliers;
CREATE TRIGGER set_supplier_code
  BEFORE INSERT ON suppliers
  FOR EACH ROW EXECUTE FUNCTION trg_set_supplier_code();

-- ─── Preenche registros existentes que ainda não têm código ──────────────────
-- Atribui códigos sequenciais ordenados por created_at dentro de cada organização

DO $$
DECLARE
  org_row RECORD;
  rec     RECORD;
  v_seq   INTEGER;
BEGIN
  -- clients
  FOR org_row IN
    SELECT DISTINCT organization_id FROM clients WHERE code IS NULL
  LOOP
    v_seq := 1;
    FOR rec IN
      SELECT id FROM clients
      WHERE organization_id = org_row.organization_id AND code IS NULL
      ORDER BY created_at
    LOOP
      UPDATE clients SET code = v_seq WHERE id = rec.id;
      v_seq := v_seq + 1;
    END LOOP;
  END LOOP;

  -- projects
  FOR org_row IN
    SELECT DISTINCT organization_id FROM projects WHERE code IS NULL
  LOOP
    v_seq := 1;
    FOR rec IN
      SELECT id FROM projects
      WHERE organization_id = org_row.organization_id AND code IS NULL
      ORDER BY created_at
    LOOP
      UPDATE projects SET code = v_seq WHERE id = rec.id;
      v_seq := v_seq + 1;
    END LOOP;
  END LOOP;

  -- suppliers
  FOR org_row IN
    SELECT DISTINCT organization_id FROM suppliers WHERE code IS NULL
  LOOP
    v_seq := 1;
    FOR rec IN
      SELECT id FROM suppliers
      WHERE organization_id = org_row.organization_id AND code IS NULL
      ORDER BY created_at
    LOOP
      UPDATE suppliers SET code = v_seq WHERE id = rec.id;
      v_seq := v_seq + 1;
    END LOOP;
  END LOOP;
END;
$$;
