-- ============================================================
-- Migration: adiciona sidebar_logo_url à tabela ai_settings
-- Executar no Supabase de CADA CLIENTE (banco dinâmico)
-- ============================================================

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS sidebar_logo_url TEXT;

-- Cria o bucket de branding para upload do logo (se não existir)
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Política: leitura pública
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'branding_public_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "branding_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'branding')
    $policy$;
  END IF;
END $$;

-- Política: escrita via anon (para o dashboard do cliente poder fazer upload)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'branding_anon_write'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "branding_anon_write"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'branding')
    $policy$;
  END IF;
END $$;
