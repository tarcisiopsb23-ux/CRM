-- =============================================================================
-- Migration 016: Adiciona 'notaas' ao enum integration_type
--                e cria bucket fiscal-certificates no Storage
-- =============================================================================

-- 1. Adiciona o valor 'notaas' ao enum integration_type (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'notaas'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'integration_type'
      )
  ) THEN
    ALTER TYPE integration_type ADD VALUE 'notaas';
  END IF;
END;
$$;

-- 2. Cria o bucket fiscal-certificates para armazenar certificados A1
-- (privado — acesso apenas via service role ou políticas RLS de Storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fiscal-certificates',
  'fiscal-certificates',
  false,                          -- bucket privado
  5242880,                        -- 5 MB
  ARRAY['application/octet-stream', 'application/x-pkcs12']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas de Storage para fiscal-certificates
--    Apenas usuários autenticados da mesma organização podem ler/escrever
--    O path segue o padrão: {organization_id}/certificado_a1_{timestamp}.pfx

-- Leitura: usuário autenticado pode ler arquivos da sua organização
DROP POLICY IF EXISTS "fiscal_cert_select" ON storage.objects;
CREATE POLICY "fiscal_cert_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fiscal-certificates'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
  );

-- Inserção: usuário autenticado pode fazer upload na sua organização
DROP POLICY IF EXISTS "fiscal_cert_insert" ON storage.objects;
CREATE POLICY "fiscal_cert_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fiscal-certificates'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
  );

-- Atualização (upsert)
DROP POLICY IF EXISTS "fiscal_cert_update" ON storage.objects;
CREATE POLICY "fiscal_cert_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fiscal-certificates'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
  );

-- Remoção
DROP POLICY IF EXISTS "fiscal_cert_delete" ON storage.objects;
CREATE POLICY "fiscal_cert_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fiscal-certificates'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
  );
