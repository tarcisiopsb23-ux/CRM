-- =============================================================================
-- Migration 00140: Vinculação de Fornecedor em projects, tasks e events
-- =============================================================================

-- 1. Adicionar supplier_id em projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- 2. Adicionar supplier_id em tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- 3. Adicionar supplier_id em events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- 4. Índice parcial em projects para queries por organização + fornecedor
CREATE INDEX IF NOT EXISTS idx_projects_supplier_id
  ON public.projects (organization_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

-- 5. Índice parcial em events para queries por organização + fornecedor
CREATE INDEX IF NOT EXISTS idx_events_supplier_id
  ON public.events (organization_id, supplier_id)
  WHERE supplier_id IS NOT NULL;
