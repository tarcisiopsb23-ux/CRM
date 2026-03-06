-- =============================================================================
-- MAESTR.IA - Modelagem de Banco de Dados Supabase
-- CRM / ERP para Agências
-- Multi-tenant | Realtime | Escalável
-- =============================================================================

-- =============================================================================
-- EXTENSÕES
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
      CREATE TYPE user_role AS ENUM ('owner','admin','manager','member','viewer');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
      CREATE TYPE lead_status AS ENUM ('novo','qualificado','proposta','negociacao','ganho','perdido');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status') THEN
      CREATE TYPE contract_status AS ENUM ('rascunho','ativo','suspenso','encerrado','cancelado');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
      CREATE TYPE payment_status AS ENUM ('pendente','processando','pago','atrasado','cancelado','reembolsado');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
      CREATE TYPE task_status AS ENUM ('backlog','em_andamento','em_revisao','concluida','bloqueada');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
      CREATE TYPE task_priority AS ENUM ('baixa','media','alta','urgente');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
      CREATE TYPE event_type AS ENUM ('reuniao','ligacao','entrega','lembrete','outro');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_status') THEN
      CREATE TYPE conversation_status AS ENUM ('aberta','em_atendimento','encerrada','aguardando');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_type') THEN
      CREATE TYPE report_type AS ENUM ('vendas','financeiro','projetos','rh','custom');
   END IF;
END $$;

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goal_period') THEN
      CREATE TYPE goal_period AS ENUM ('diario','semanal','mensal','trimestral','anual');
   END IF;
END $$;

-- =============================================================================
-- ORGANIZAÇÕES
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- USUÁRIOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  role user_role DEFAULT 'member',
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- EQUIPES
-- =============================================================================

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  lead_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, profile_id)
);

-- =============================================================================
-- LEADS
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  stages JSONB NOT NULL DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES lead_pipelines(id) ON DELETE SET NULL,
  stage_id VARCHAR(100) NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  source VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  value DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CLIENTES
-- =============================================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  document VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  address_street TEXT,
  address_city VARCHAR(100),
  address_state VARCHAR(50),
  address_zip VARCHAR(20),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CONTRATOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  responsible_id UUID REFERENCES profiles(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  value DECIMAL(15,2) NOT NULL,
  status contract_status DEFAULT 'rascunho',
  start_date DATE NOT NULL,
  end_date DATE,
  billing_cycle VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PAGAMENTOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  description VARCHAR(500) NOT NULL,
  value DECIMAL(15,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status payment_status DEFAULT 'pendente',
  payment_method VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- WHATSAPP
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  profile_pic_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, phone)
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id),
  status conversation_status DEFAULT 'aberta',
  last_message_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  direction VARCHAR(10),
  content TEXT,
  media_url TEXT,
  status VARCHAR(20),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TRIGGER updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS

CREATE TRIGGER update_org_updated
BEFORE UPDATE ON organizations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated
BEFORE UPDATE ON contracts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_contacts_updated
BEFORE UPDATE ON whatsapp_contacts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_conversations_updated
BEFORE UPDATE ON whatsapp_conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_org
ON profiles(organization_id);

CREATE INDEX IF NOT EXISTS idx_leads_org
ON leads(organization_id);

CREATE INDEX IF NOT EXISTS idx_leads_pipeline
ON leads(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_clients_org
ON clients(organization_id);

CREATE INDEX IF NOT EXISTS idx_contracts_client
ON contracts(client_id);

CREATE INDEX IF NOT EXISTS idx_payments_client
ON payments(client_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv
ON whatsapp_messages(conversation_id);

-- =============================================================================
-- REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;