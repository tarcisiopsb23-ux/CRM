-- =============================================================================
-- MAESTR.IA - Índices, RLS e Realtime (SAFE MIGRATION)
-- =============================================================================

-- =============================================================================
-- 1. ÍNDICES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

CREATE INDEX IF NOT EXISTS idx_teams_organization_id ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_profile_id ON team_members(profile_id);

CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_position ON leads(pipeline_id, stage_id, position);

CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_document ON clients(document);
-- client_contacts criada em 00011; índice em 00011

CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_dates ON contracts(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_payments_organization_id ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract_id ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- suppliers, goals: criados em 00006 com índices próprios
-- projects, tasks, events, event_attendees: criados em 00011 com índices próprios
-- report_templates, report_snapshots: criados em 00012

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_organization_id ON whatsapp_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_contact_id ON whatsapp_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_to ON whatsapp_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_id ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);

-- =============================================================================
-- 2. FUNÇÕES RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
SELECT organization_id
FROM profiles
WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION user_has_role(required_roles user_role[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
SELECT EXISTS (
SELECT 1
FROM profiles
WHERE id = auth.uid()
AND role = ANY(required_roles)
)
$$;

CREATE OR REPLACE FUNCTION user_can_access(resource_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
SELECT organization_id = resource_org_id
FROM profiles
WHERE id = auth.uid()
$$;

-- =============================================================================
-- 3. ENABLE RLS
-- =============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- client_contacts, suppliers, goals, projects, tasks, events: RLS em 00006 e 00011
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. POLICIES
-- =============================================================================

DROP POLICY IF EXISTS org_insert ON organizations;
CREATE POLICY org_insert
ON organizations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select
ON organizations
FOR SELECT
USING (id = get_user_organization_id());

DROP POLICY IF EXISTS org_update ON organizations;
CREATE POLICY org_update
ON organizations
FOR UPDATE
USING (
id = get_user_organization_id()
AND user_has_role(ARRAY['owner','admin']::user_role[])
);

-- Leads
DROP POLICY IF EXISTS leads_all ON leads;
CREATE POLICY leads_all
ON leads
FOR ALL
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());

-- Clients
DROP POLICY IF EXISTS clients_all ON clients;
CREATE POLICY clients_all
ON clients
FOR ALL
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());

-- tasks_all, events_all: definidos em 00011 (tabelas criadas lá)

-- Payments
DROP POLICY IF EXISTS payments_all ON payments;
CREATE POLICY payments_all
ON payments
FOR ALL
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());

-- WhatsApp
DROP POLICY IF EXISTS whatsapp_contacts_all ON whatsapp_contacts;
CREATE POLICY whatsapp_contacts_all
ON whatsapp_contacts
FOR ALL
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS whatsapp_conversations_all ON whatsapp_conversations;
CREATE POLICY whatsapp_conversations_all
ON whatsapp_conversations
FOR ALL
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS whatsapp_messages_all ON whatsapp_messages;
CREATE POLICY whatsapp_messages_all
ON whatsapp_messages
FOR ALL
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());

-- =============================================================================
-- 5. SUPABASE REALTIME
-- =============================================================================

DO $$
BEGIN

IF NOT EXISTS (
SELECT 1 FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='leads'
) THEN
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
END IF;

-- tasks, events: adicionados em 00012 (tabelas criadas em 00011)

IF NOT EXISTS (
SELECT 1 FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='whatsapp_conversations'
) THEN
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
END IF;

IF NOT EXISTS (
SELECT 1 FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='whatsapp_messages'
) THEN
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
END IF;

IF NOT EXISTS (
SELECT 1 FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='payments'
) THEN
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
END IF;

END $$;