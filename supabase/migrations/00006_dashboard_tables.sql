-- =============================================================================
-- MAESTR.IA - Suppliers, Goals (Dashboard)
-- =============================================================================
-- Tables for accounts payable and goals widgets
-- =============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  document VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(50),
  address_street TEXT,
  address_city VARCHAR(100),
  address_state VARCHAR(50),
  address_zip VARCHAR(20),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  value DECIMAL(15,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status payment_status DEFAULT 'pendente',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_value DECIMAL(15,2) NOT NULL,
  current_value DECIMAL(15,2) DEFAULT 0,
  unit VARCHAR(50),
  period goal_period NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  value DECIMAL(15,2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_suppliers_organization_id ON suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_supplier_expenses_supplier_id ON supplier_expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_expenses_organization_id ON supplier_expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_supplier_expenses_due_date ON supplier_expenses(due_date);
CREATE INDEX IF NOT EXISTS idx_goals_organization_id ON goals(organization_id);
CREATE INDEX IF NOT EXISTS idx_goals_team_id ON goals(team_id);
CREATE INDEX IF NOT EXISTS idx_goals_assigned_to ON goals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_goals_period ON goals(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_goal_progress_goal_id ON goal_progress(goal_id);

-- RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_all ON suppliers;
CREATE POLICY suppliers_all ON suppliers FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS supplier_expenses_all ON supplier_expenses;
CREATE POLICY supplier_expenses_all ON supplier_expenses FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS goals_all ON goals;
CREATE POLICY goals_all ON goals FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS goal_progress_all ON goal_progress;
CREATE POLICY goal_progress_all ON goal_progress FOR ALL
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_id AND g.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_id AND g.organization_id = get_user_organization_id()));
