-- Migration: Catálogo de Produtos e Serviços
-- Tabela para o parceiro cadastrar seus produtos/serviços oferecidos.

CREATE TABLE IF NOT EXISTS products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(100),
  type        VARCHAR(20)  NOT NULL DEFAULT 'servico'
                CHECK(type IN ('produto', 'servico')),
  recurrence  VARCHAR(20)  NOT NULL DEFAULT 'continuo'
                CHECK(recurrence IN ('continuo', 'esporadico')),
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_products ON products;
CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- RLS: acesso total via anon (single-tenant)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_products" ON products;
CREATE POLICY "anon_all_products" ON products
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- FK opcional: associar produto a um lead
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
