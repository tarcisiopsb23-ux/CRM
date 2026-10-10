-- =============================================================================
-- Configuração do Storage: Bucket de Branding (Logos e Favicons)
-- =============================================================================

-- 1. Criar o bucket 'public' se não existir (ou reutilizar se preferir, mas 'public' é genérico)
INSERT INTO storage.buckets (id, name, public)
VALUES ('public', 'public', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de Acesso para o bucket 'public'

-- Permitir acesso público para leitura
CREATE POLICY "Arquivos públicos são acessíveis publicamente"
ON storage.objects FOR SELECT
USING (bucket_id = 'public');

-- Permitir que owners façam upload para a pasta branding
CREATE POLICY "Owners podem fazer upload de branding"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'public' AND 
  (storage.foldername(name))[1] = 'branding'
)
WITH CHECK (
  bucket_id = 'public' AND 
  (storage.foldername(name))[1] = 'branding'
);
