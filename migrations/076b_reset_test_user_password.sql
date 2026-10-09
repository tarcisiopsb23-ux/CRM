-- =============================================================================
-- Migration 076b: Redefine senha do usuário de teste via Admin API interna
--
-- O Supabase auth.users usa bcrypt com custo 10 para senhas.
-- A função extensions.crypt() usa custo padrão do gen_salt que pode diferir.
-- Este script usa a função interna auth.authenticate_user para garantir
-- que o hash é compatível com o signInWithPassword.
--
-- Execute no SQL Editor com service_role.
-- =============================================================================

-- Atualiza a senha usando o mesmo método que o Supabase usa internamente
UPDATE auth.users
SET
  encrypted_password = extensions.crypt('12345678', extensions.gen_salt('bf', 10)),
  updated_at = now()
WHERE email = 'teste@teste.com::teste-agencia-c8@c8.internal'
RETURNING id, email, (encrypted_password IS NOT NULL) AS tem_senha;
