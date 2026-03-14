-- =============================================================================
-- Configuração do Storage: Bucket de Avatares
-- =============================================================================

-- 1. Criar o bucket 'avatars' se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de Acesso para o bucket 'avatars'

-- Permitir acesso público para leitura de avatares
CREATE POLICY "Avatares são acessíveis publicamente"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Permitir que usuários autenticados façam upload para sua própria pasta
-- A estrutura esperada é: avatars/{user_id}/{filename}
CREATE POLICY "Usuários podem fazer upload de seu próprio avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir que usuários atualizem seu próprio avatar
CREATE POLICY "Usuários podem atualizar seu próprio avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir que usuários excluam seu próprio avatar
CREATE POLICY "Usuários podem excluir seu próprio avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
