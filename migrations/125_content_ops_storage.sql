-- =============================================================================
-- Migration 125: Content Operations — Bucket content-staging no Storage
-- Banco A — Idempotente
--
-- Cria o bucket 'content-staging' para armazenar temporariamente arquivos
-- enviados pela Edge Function content-upload-asset enquanto o n8n processa
-- o upload para Google Drive ou Vimeo.
--
-- Após o processamento pelo n8n:
--   - O arquivo é removido do bucket pelo callback content-asset-callback
--   - O asset em content_assets é atualizado com external_id e embed_url
--
-- Políticas:
--   - service_role: acesso total (necessário para Edge Functions)
--   - authenticated: pode fazer upload (INSERT) em seu próprio path
--   - Sem acesso público de leitura (os arquivos são temporários)
--
-- NOTA: A criação do bucket via SQL requer a extensão storage do Supabase.
-- Se este script falhar, crie o bucket manualmente no Dashboard do Supabase:
--   Storage → New bucket → "content-staging" → Private (sem public access)
-- =============================================================================

-- Cria o bucket se não existir
-- A função storage.create_bucket é disponibilizada pela extensão Supabase Storage
DO $$
BEGIN
  -- Verifica se o bucket já existe
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'content-staging'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'content-staging',
      'content-staging',
      false,                    -- privado: sem leitura pública
      524288000,                -- 500 MB limite por arquivo
      ARRAY[
        'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
        'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/octet-stream'
      ]
    );
    RAISE NOTICE 'Bucket content-staging criado.';
  ELSE
    RAISE NOTICE 'Bucket content-staging já existe — sem alteração.';
  END IF;
END $$;

-- ─── Políticas de Storage ─────────────────────────────────────────────────────

-- Remove políticas antigas se existirem
DROP POLICY IF EXISTS "content_staging_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "content_staging_service_role_access"  ON storage.objects;
DROP POLICY IF EXISTS "content_staging_owner_read"           ON storage.objects;
DROP POLICY IF EXISTS "content_staging_owner_delete"         ON storage.objects;

-- Usuários autenticados podem fazer upload (INSERT) no bucket
-- O path deve começar com organization_id do usuário (validado na Edge Function)
CREATE POLICY "content_staging_authenticated_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'content-staging');

-- Usuários autenticados podem ler seus próprios arquivos (para download/presigned URL)
CREATE POLICY "content_staging_owner_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'content-staging');

-- Usuários autenticados podem deletar seus próprios arquivos
CREATE POLICY "content_staging_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'content-staging');

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('125_content_ops_storage')
ON CONFLICT (version) DO NOTHING;
