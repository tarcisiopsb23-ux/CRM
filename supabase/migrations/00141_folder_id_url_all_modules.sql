-- =============================================================================
-- Migration 00141: Adicionar folder_id e folder_url em suppliers, projects e profiles
-- (clients já recebeu via ALTER TABLE manual)
-- =============================================================================

-- 1. SUPPLIERS
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS folder_id TEXT,
  ADD COLUMN IF NOT EXISTS folder_url TEXT;

-- 2. PROJECTS
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS folder_id TEXT,
  ADD COLUMN IF NOT EXISTS folder_url TEXT;

-- 3. PROFILES (colaboradores)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS folder_id TEXT,
  ADD COLUMN IF NOT EXISTS folder_url TEXT;

-- 4. CLIENTS (garante que as colunas existam, caso a migration manual não tenha sido aplicada)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS folder_id TEXT,
  ADD COLUMN IF NOT EXISTS folder_url TEXT;

-- 5. Índices parciais para queries de "sem pasta"
CREATE INDEX IF NOT EXISTS idx_suppliers_no_folder
  ON public.suppliers (organization_id)
  WHERE folder_id IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_projects_no_folder
  ON public.projects (organization_id)
  WHERE folder_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_no_folder
  ON public.profiles (organization_id)
  WHERE folder_id IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_clients_no_folder
  ON public.clients (organization_id)
  WHERE folder_id IS NULL AND is_active = true;
