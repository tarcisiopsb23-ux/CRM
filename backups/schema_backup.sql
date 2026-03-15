-- =============================================================================
-- MAESTR.IA - BACKUP DE ESTRUTURA (SCHEMA SNAPSHOT)
-- Data: 2026-03-15
-- Este arquivo contém a estrutura atual das tabelas, enums e índices principais.
-- Nota: Para um backup completo dos DADOS, utilize o painel do Supabase ou CLI.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
      CREATE TYPE user_role AS ENUM ('owner','admin','manager','member','viewer');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
      CREATE TYPE lead_status AS ENUM ('novo','qualificado','proposta','negociacao','ganho','perdido');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status') THEN
      CREATE TYPE contract_status AS ENUM ('rascunho','ativo','suspenso','encerrado','cancelado');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
      CREATE TYPE payment_status AS ENUM ('pendente','processando','pago','atrasado','cancelado','reembolsado');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
      CREATE TYPE task_status AS ENUM ('backlog','em_andamento','em_revisao','concluida','bloqueada');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
      CREATE TYPE task_priority AS ENUM ('baixa','media','alta','urgente');
   END IF;
END $$;

-- =============================================================================
-- TABELAS PRINCIPAIS
-- =============================================================================

-- ORGANIZAÇÕES
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PERFIS DE USUÁRIOS
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

-- LEADS (CRM)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES lead_pipelines(id) ON DELETE SET NULL,
  stage_id VARCHAR(100) NOT NULL,
  etapa_kanban VARCHAR(100) DEFAULT 'leads_recebidos',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  source VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  value DECIMAL(15,2) DEFAULT 0,
  nicho VARCHAR(255),
  prioridade VARCHAR(50) DEFAULT 'media',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Campos adicionais expandidos
  first_contact_date DATE,
  last_contact_date DATE,
  product_service VARCHAR(100),
  cpf_cnpj VARCHAR(50),
  contact_origin VARCHAR(100),
  decision_maker BOOLEAN DEFAULT false,
  decision_maker_name VARCHAR(255),
  decision_maker_phone VARCHAR(50),
  gbp_url TEXT,
  instagram_url TEXT,
  website_url TEXT,
  gmn_status VARCHAR(100),
  google_ads_level VARCHAR(100),
  meta_ads_level VARCHAR(100),
  social_media_status VARCHAR(100),
  lost_reason TEXT,
  cadence INTEGER DEFAULT 0,
  temperature INTEGER DEFAULT 0
);

-- CLIENTES
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  document VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(50),
  address_street TEXT,
  address_city VARCHAR(100),
  address_state VARCHAR(50),
  address_zip VARCHAR(20),
  metadata JSONB DEFAULT '{}',
  responsible_name VARCHAR(255),
  responsible_phone VARCHAR(50),
  decision_maker_name VARCHAR(255),
  decision_maker_phone VARCHAR(50),
  niche VARCHAR(100),
  origin VARCHAR(100),
  revenue DECIMAL(15,2),
  priority VARCHAR(50),
  registration_date TIMESTAMPTZ DEFAULT NOW(),
  registration_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONTRATOS
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  responsible_id UUID REFERENCES profiles(id),
  title VARCHAR(255) NOT NULL,
  service_contracted VARCHAR(255),
  description TEXT,
  value DECIMAL(15,2) NOT NULL,
  status contract_status DEFAULT 'rascunho',
  start_date DATE NOT NULL,
  end_date DATE,
  duration_months INTEGER,
  contract_date DATE,
  first_payment_value DECIMAL(15,2),
  first_payment_due_date DATE,
  first_payment_method VARCHAR(50),
  first_payment_installments INTEGER DEFAULT 1,
  first_payment_fees DECIMAL(15,2) DEFAULT 0,
  recurring_due_date DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PAGAMENTOS / FINANCEIRO
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id),
  client_id UUID REFERENCES clients(id),
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

-- AUDITORIA
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  action VARCHAR(50) NOT NULL,
  changes JSONB,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ÍNDICES DE PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_org_etapa ON leads(organization_id, etapa_kanban);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(record_id);

-- =============================================================================
-- REGRAS DE NEGÓCIO (TRIGGERS)
-- =============================================================================

-- Função para limpeza de pagamentos ao excluir contrato
CREATE OR REPLACE FUNCTION public.handle_contract_deletion_cleanup()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.payments WHERE contract_id = OLD.id AND status != 'pago';
    UPDATE public.payments SET contract_id = NULL WHERE contract_id = OLD.id AND status = 'pago';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Função para limpeza de pagamentos ao excluir cliente
CREATE OR REPLACE FUNCTION public.handle_client_deletion_cleanup()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.payments WHERE client_id = OLD.id AND status != 'pago';
    UPDATE public.payments SET client_id = NULL WHERE client_id = OLD.id AND status = 'pago';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_contract_deletion_cleanup ON public.contracts;
CREATE TRIGGER tr_contract_deletion_cleanup BEFORE DELETE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.handle_contract_deletion_cleanup();

DROP TRIGGER IF EXISTS tr_client_deletion_cleanup ON public.clients;
CREATE TRIGGER tr_client_deletion_cleanup BEFORE DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.handle_client_deletion_cleanup();

-- =============================================================================
-- FINALIZAÇÃO
-- =============================================================================
-- Nota: Triggers e políticas de RLS devem ser aplicadas conforme as migrations
-- originais da pasta /supabase/migrations para garantir a integridade do sistema.
