-- =============================================================================
-- MAESTR.IA - Tabelas estendidas para CRM completo
-- =============================================================================
-- Clientes (campos adicionais), Fornecedores (pix, categoria), Contratos (tipo, periodicidade),
-- Projetos, Tarefas, Projetos-membros, Eventos, Participantes, client_contacts
-- =============================================================================

-- Enums adicionais
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_type') THEN
    CREATE TYPE registration_type AS ENUM ('prospeccao', 'cliente');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_type_enum') THEN
    CREATE TYPE contract_type_enum AS ENUM ('servico', 'trimestral', 'semestral', 'anual');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_periodicity') THEN
    CREATE TYPE payment_periodicity AS ENUM ('pagamento_unico', '50_50', 'mensal', 'trimestral', 'semestral', 'anual');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goal_indicator') THEN
    CREATE TYPE goal_indicator AS ENUM ('inadimplencia', 'efetivacoes', 'faturamento', 'numero_contatos', 'outro');
  END IF;
END $$;

-- =============================================================================
-- 1. CLIENT_CONTACTS (referenciada em 00002)
-- =============================================================================
CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(100),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON client_contacts(client_id);
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_contacts_all ON client_contacts;
CREATE POLICY client_contacts_all ON client_contacts FOR ALL
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.organization_id = get_user_organization_id()));

-- =============================================================================
-- 2. COLUNAS ADICIONAIS EM CLIENTS
-- =============================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS registration_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS registration_type registration_type DEFAULT 'cliente';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS niche VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS origin VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS revenue DECIMAL(15,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS priority VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS responsible_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS responsible_phone VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT; -- endereço completo (complemento de address_*)
COMMENT ON COLUMN clients.registration_type IS 'prospeccao ou cliente';

-- =============================================================================
-- 3. COLUNAS ADICIONAIS EM CONTRACTS
-- =============================================================================
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS service_contracted VARCHAR(500);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type contract_type_enum DEFAULT 'servico';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS periodicity payment_periodicity DEFAULT 'mensal';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_date DATE;
COMMENT ON COLUMN contracts.contract_type IS 'servico, trimestral, semestral, anual';
COMMENT ON COLUMN contracts.periodicity IS 'pagamento_unico, 50_50, mensal, trimestral, semestral, anual';

-- =============================================================================
-- 4. COLUNAS ADICIONAIS EM SUPPLIERS
-- =============================================================================
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS service_category VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS pix VARCHAR(100);
-- address já existe; address_street, address_city, etc.

-- =============================================================================
-- 5. COLUNA INDICADOR EM GOALS
-- =============================================================================
ALTER TABLE goals ADD COLUMN IF NOT EXISTS indicator goal_indicator DEFAULT 'outro';
COMMENT ON COLUMN goals.indicator IS 'inadimplencia, efetivacoes, faturamento, numero_contatos';

-- =============================================================================
-- 6. PROJECTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'ativo',
  start_date DATE NOT NULL,
  end_date DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_dates ON projects(start_date, end_date);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_all ON projects;
CREATE POLICY projects_all ON projects FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- =============================================================================
-- 7. TASKS (para Gantt)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status task_status DEFAULT 'backlog',
  priority task_priority DEFAULT 'media',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_days INTEGER, -- calculado ou manual
  position INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir que team_id existe (tasks pode ter sido criada em migration anterior sem essa coluna)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_all ON tasks;
CREATE POLICY tasks_all ON tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.organization_id = get_user_organization_id()));

-- =============================================================================
-- 8. PROJECT_MEMBERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_profile_id ON project_members(profile_id);
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_members_all ON project_members;
CREATE POLICY project_members_all ON project_members FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.organization_id = get_user_organization_id()));

-- =============================================================================
-- 9. EVENTS (Agenda)
-- =============================================================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  type event_type DEFAULT 'reuniao',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  google_event_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir que created_by existe (events pode ter sido criada com profile_id em migration anterior)
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_organization_id ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_at, end_at);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_all ON events;
CREATE POLICY events_all ON events FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- =============================================================================
-- 10. EVENT_ATTENDEES (delegação pessoa/equipe)
-- =============================================================================
CREATE TABLE IF NOT EXISTS event_attendees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'attendee',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT event_attendee_profile_or_team CHECK (profile_id IS NOT NULL OR team_id IS NOT NULL)
);

-- Garantir que team_id existe em event_attendees (retrocompatibilidade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_attendees' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE event_attendees ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_profile_id ON event_attendees(profile_id);
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_attendees_all ON event_attendees;
CREATE POLICY event_attendees_all ON event_attendees FOR ALL
  USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.organization_id = get_user_organization_id()));

-- =============================================================================
-- TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS update_client_contacts_updated ON client_contacts;
CREATE TRIGGER update_client_contacts_updated
  BEFORE UPDATE ON client_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_projects_updated ON projects;
CREATE TRIGGER update_projects_updated
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_tasks_updated ON tasks;
CREATE TRIGGER update_tasks_updated
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_events_updated ON events;
CREATE TRIGGER update_events_updated
  BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
