-- Create tables for Client KPIs and History
-- 1. Table for KPI definitions per client
CREATE TABLE IF NOT EXISTS public.client_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    category VARCHAR DEFAULT 'Geral',
    unit VARCHAR DEFAULT 'currency', -- 'currency', 'percentage', 'number'
    is_predefined BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure correct columns exist and remove incorrect/legacy ones (fix for PGRST204/23502)
DO $$ 
BEGIN 
    -- 1. REMOVE LEGACY COLUMNS (that cause 23502 NOT NULL violations)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='date') THEN
        ALTER TABLE public.client_kpis DROP COLUMN "date";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='metric_name') THEN
        ALTER TABLE public.client_kpis DROP COLUMN "metric_name";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='metric_value') THEN
        ALTER TABLE public.client_kpis DROP COLUMN "metric_value";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='value') THEN
        ALTER TABLE public.client_kpis DROP COLUMN "value";
    END IF;

    -- 2. ENSURE REQUIRED COLUMNS EXIST
    -- name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='name') THEN
        ALTER TABLE public.client_kpis ADD COLUMN name VARCHAR NOT NULL DEFAULT 'Indicador';
    END IF;

    -- category
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='category') THEN
        ALTER TABLE public.client_kpis ADD COLUMN category VARCHAR DEFAULT 'Geral';
    END IF;
    
    -- is_predefined
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='is_predefined') THEN
        ALTER TABLE public.client_kpis ADD COLUMN is_predefined BOOLEAN DEFAULT false;
    END IF;

    -- unit
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='unit') THEN
        ALTER TABLE public.client_kpis ADD COLUMN unit VARCHAR DEFAULT 'currency';
    END IF;

    -- 3. INSPECTION FOR CONSISTENCY (organization_id, client_id)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='organization_id') THEN
        ALTER TABLE public.client_kpis ADD COLUMN organization_id UUID NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_kpis' AND column_name='client_id') THEN
        ALTER TABLE public.client_kpis ADD COLUMN client_id UUID NOT NULL;
    END IF;
END $$;

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';

-- Force PostgREST schema reload (if permissions allow)
NOTIFY pgrst, 'reload schema';

-- 2. Table for KPI historical values
CREATE TABLE IF NOT EXISTS public.client_kpi_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    kpi_id UUID NOT NULL REFERENCES public.client_kpis(id) ON DELETE CASCADE,
    month_year DATE NOT NULL, -- Stored as first day of month (e.g., 2024-01-01)
    value DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(kpi_id, month_year)
);

-- RLS Policies
ALTER TABLE public.client_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_kpi_history ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can manage KPIs for their organization" ON public.client_kpis;
DROP POLICY IF EXISTS "Users can manage KPI history for their organization" ON public.client_kpi_history;

-- Policies for client_kpis
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'client_kpis' 
        AND policyname = 'client_kpis_all'
    ) THEN
        CREATE POLICY "client_kpis_all"
        ON public.client_kpis
        FOR ALL
        USING (organization_id = get_user_organization_id())
        WITH CHECK (organization_id = get_user_organization_id());
    END IF;
END $$;

-- Policies for client_kpi_history
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'client_kpi_history' 
        AND policyname = 'client_kpi_history_all'
    ) THEN
        CREATE POLICY "client_kpi_history_all"
        ON public.client_kpi_history
        FOR ALL
        USING (organization_id = get_user_organization_id())
        WITH CHECK (organization_id = get_user_organization_id());
    END IF;
END $$;

-- Add Indexes
CREATE INDEX IF NOT EXISTS idx_client_kpis_client_id ON public.client_kpis(client_id);
CREATE INDEX IF NOT EXISTS idx_client_kpi_history_client_id ON public.client_kpi_history(client_id);
CREATE INDEX IF NOT EXISTS idx_client_kpi_history_month_year ON public.client_kpi_history(month_year);
