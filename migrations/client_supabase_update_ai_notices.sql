-- ============================================================
-- Migration: Atualiza tabela ai_notices — colunas de período
-- Executar no Supabase de CADA CLIENTE (banco dinâmico)
-- ============================================================

-- 1. Adiciona colunas de período como DATE dedicadas
ALTER TABLE public.ai_notices
  ADD COLUMN IF NOT EXISTS valid_from DATE,
  ADD COLUMN IF NOT EXISTS valid_to   DATE;

-- 2. Migra dados existentes do campo validity (JSON legado) para as novas colunas
UPDATE public.ai_notices
SET
  valid_from = (validity::jsonb ->> 'from')::DATE,
  valid_to   = (validity::jsonb ->> 'to')::DATE
WHERE
  validity IS NOT NULL
  AND validity LIKE '{%'
  AND (validity::jsonb ->> 'from') IS NOT NULL
  AND (validity::jsonb ->> 'to')   IS NOT NULL;

-- 3. Remove a coluna validity antiga (não é mais necessária)
ALTER TABLE public.ai_notices
  DROP COLUMN IF EXISTS validity;

-- 4. Garante que a coluna status existe com valor padrão e constraint
ALTER TABLE public.ai_notices
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.ai_notices
  DROP CONSTRAINT IF EXISTS ai_notices_status_check;

ALTER TABLE public.ai_notices
  ADD CONSTRAINT ai_notices_status_check
  CHECK (status IN ('active', 'inactive'));

-- 5. Recria constraint de priority aceitando com e sem acento
ALTER TABLE public.ai_notices
  DROP CONSTRAINT IF EXISTS ai_notices_priority_check;

ALTER TABLE public.ai_notices
  ADD CONSTRAINT ai_notices_priority_check
  CHECK (priority IN ('alta', 'média', 'media', 'baixa'));

-- 6. Garante RLS habilitado e políticas públicas
ALTER TABLE public.ai_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read"  ON public.ai_notices;
DROP POLICY IF EXISTS "public_write" ON public.ai_notices;

CREATE POLICY "public_read"
  ON public.ai_notices FOR SELECT
  USING (true);

CREATE POLICY "public_write"
  ON public.ai_notices FOR ALL
  USING (true)
  WITH CHECK (true);
