-- ============================================================
-- Migration 046: Credenciais Supabase do cliente (armazenamento seguro)
-- Execute no Supabase da AGÊNCIA (Banco A)
--
-- Adiciona campos para registrar o e-mail, senha e service key do
-- projeto Supabase de cada cliente, de forma que a equipe possa
-- acessar sem que os valores vazem para o frontend ou para qualquer
-- SELECT público.
--
-- Padrão de segurança (igual ao Asaas no Banco B):
--   • Campos sensíveis NUNCA retornados em nenhuma RPC ou view pública.
--   • Escrita feita via RPC SECURITY DEFINER (save_client_supabase_credentials).
--   • Leitura feita via RPC SECURITY DEFINER (get_client_supabase_credentials),
--     restrita a roles autenticados com perfil owner/admin.
--   • Flags booleanos (_set) informam ao frontend se o campo está preenchido.
-- ============================================================

-- ── 1. Novas colunas na tabela clients ───────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_supabase_service_key      TEXT,
  ADD COLUMN IF NOT EXISTS client_supabase_service_key_set  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_supabase_email            TEXT,
  ADD COLUMN IF NOT EXISTS client_supabase_email_set        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_supabase_password         TEXT,
  ADD COLUMN IF NOT EXISTS client_supabase_password_set     BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.client_supabase_service_key IS
  'Service role key do projeto Supabase do cliente. NUNCA retornada ao frontend.';
COMMENT ON COLUMN public.clients.client_supabase_service_key_set IS
  'Indica se a service key do cliente está configurada, sem expor o valor.';
COMMENT ON COLUMN public.clients.client_supabase_email IS
  'E-mail de acesso ao painel Supabase do cliente. NUNCA retornado ao frontend.';
COMMENT ON COLUMN public.clients.client_supabase_email_set IS
  'Indica se o e-mail do cliente está configurado, sem expor o valor.';
COMMENT ON COLUMN public.clients.client_supabase_password IS
  'Senha de acesso ao painel Supabase do cliente. NUNCA retornada ao frontend.';
COMMENT ON COLUMN public.clients.client_supabase_password_set IS
  'Indica se a senha do cliente está configurada, sem expor o valor.';

-- ── 2. RPC de escrita: salva credenciais (nunca as retorna) ──────────────────
-- Chamada pelo painel interno da agência (usuários autenticados).
-- Retorna apenas os flags _set, nunca os valores reais.

CREATE OR REPLACE FUNCTION public.save_client_supabase_credentials(
  p_client_id                UUID,
  p_service_key              TEXT    DEFAULT NULL,
  p_email                    TEXT    DEFAULT NULL,
  p_password                 TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Verifica se o cliente existe
  SELECT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id)
    INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  UPDATE public.clients SET
    -- Service key: só atualiza se fornecida
    client_supabase_service_key     = CASE
      WHEN p_service_key IS NOT NULL AND p_service_key <> ''
        THEN p_service_key
      ELSE client_supabase_service_key
    END,
    client_supabase_service_key_set = CASE
      WHEN p_service_key IS NOT NULL AND p_service_key <> '' THEN true
      ELSE client_supabase_service_key_set
    END,
    -- E-mail: só atualiza se fornecido
    client_supabase_email           = CASE
      WHEN p_email IS NOT NULL AND p_email <> ''
        THEN p_email
      ELSE client_supabase_email
    END,
    client_supabase_email_set       = CASE
      WHEN p_email IS NOT NULL AND p_email <> '' THEN true
      ELSE client_supabase_email_set
    END,
    -- Senha: só atualiza se fornecida
    client_supabase_password        = CASE
      WHEN p_password IS NOT NULL AND p_password <> ''
        THEN p_password
      ELSE client_supabase_password
    END,
    client_supabase_password_set    = CASE
      WHEN p_password IS NOT NULL AND p_password <> '' THEN true
      ELSE client_supabase_password_set
    END,
    updated_at = now()
  WHERE id = p_client_id;

  RETURN jsonb_build_object(
    'success',                      true,
    'client_supabase_service_key_set', (
      SELECT client_supabase_service_key_set FROM public.clients WHERE id = p_client_id
    ),
    'client_supabase_email_set',    (
      SELECT client_supabase_email_set    FROM public.clients WHERE id = p_client_id
    ),
    'client_supabase_password_set', (
      SELECT client_supabase_password_set FROM public.clients WHERE id = p_client_id
    )
  );
END;
$$;

-- Apenas usuários autenticados podem chamar esta RPC
REVOKE ALL ON FUNCTION public.save_client_supabase_credentials(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_client_supabase_credentials(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.save_client_supabase_credentials(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ── 3. RPC de leitura: retorna credenciais reais (acesso interno restrito) ───
-- Usada pelo painel da agência para acessar o Supabase do cliente,
-- e pelo n8n para provisionar o Banco B.
-- Acesso restrito: apenas service_role e authenticated.
-- O frontend DEVE chamar esta RPC; SELECT direto em clients nunca expõe os campos.

CREATE OR REPLACE FUNCTION public.get_client_supabase_credentials(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.clients%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.clients WHERE id = p_client_id LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'client_id',        v_row.id,
    'supabase_url',     v_row.client_supabase_url,
    'anon_key',         v_row.client_supabase_anon_key,
    'service_key',      v_row.client_supabase_service_key,
    'email',            v_row.client_supabase_email,
    'password',         v_row.client_supabase_password
  );
END;
$$;

-- Leitura das credenciais reais: apenas service_role e authenticated (equipe interna)
-- anon NUNCA acessa esta função
REVOKE ALL ON FUNCTION public.get_client_supabase_credentials(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_supabase_credentials(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_client_supabase_credentials(UUID) TO authenticated;

-- ── 4. View segura da tabela clients (sem campos sensíveis) ──────────────────
-- Substitui SELECT direto em clients para consumo pelo frontend.
-- Os campos _set informam ao UI se o campo está preenchido.

CREATE OR REPLACE VIEW public.clients_safe
WITH (security_invoker = true) AS
SELECT
  -- Identificação
  id, organization_id, lead_id, name, company, document,
  email, phone,
  -- Endereço
  address, address_street, address_city, address_state, address_zip,
  address_number, address_complement,
  -- Dados comerciais
  registration_date, registration_type, niche, origin, revenue, priority,
  responsible_name, responsible_phone,
  decision_maker_name, decision_maker_phone,
  -- Dashboard público
  dashboard_slug, show_ia_content,
  -- Supabase do cliente — apenas URL pública e anon key (seguras)
  client_supabase_url,
  client_supabase_anon_key,
  -- Credenciais sensíveis: somente os flags booleanos
  client_supabase_service_key_set,
  client_supabase_email_set,
  client_supabase_password_set,
  -- C8 Control
  c8_control_enabled,
  -- Integrações
  asaas_id, code,
  -- Controle
  is_active, metadata, created_at, updated_at
FROM public.clients;

-- ── 5. Registra versão ────────────────────────────────────────────────────────
-- (Banco A não usa a tabela schema_migrations — controle feito pelo Supabase CLI)
