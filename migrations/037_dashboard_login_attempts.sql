-- ============================================================
-- Migration 037: Rate limiting server-side para login do Public Dashboard
-- Execute no Supabase da AGÊNCIA (Banco A)
-- Complementa o rate limiting client-side já existente no frontend.
-- ============================================================

-- Tabela de controle de tentativas de login por IP+slug
CREATE TABLE IF NOT EXISTS public.dashboard_login_attempts (
  rate_key       TEXT        PRIMARY KEY,           -- "<ip>:<slug>"
  attempts       INTEGER     NOT NULL DEFAULT 0,
  window_start   BIGINT,                            -- Unix timestamp (segundos)
  blocked_until  BIGINT,                            -- Unix timestamp; NULL = não bloqueado
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para limpeza periódica de entradas antigas
CREATE INDEX IF NOT EXISTS idx_dashboard_login_attempts_updated
  ON public.dashboard_login_attempts(updated_at);

-- RLS: apenas service_role acessa esta tabela (Edge Function usa service_role_key)
ALTER TABLE public.dashboard_login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_only" ON public.dashboard_login_attempts;
CREATE POLICY "service_only" ON public.dashboard_login_attempts
  FOR ALL USING (false);  -- bloqueia acesso anon/authenticated; só service_role bypassa RLS

-- Função para limpar entradas antigas (executar via cron ou manualmente)
CREATE OR REPLACE FUNCTION public.cleanup_dashboard_login_attempts()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM public.dashboard_login_attempts
  WHERE updated_at < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

COMMENT ON TABLE public.dashboard_login_attempts IS
  'Rate limiting server-side para logins no Public Dashboard. Gerenciado pela Edge Function client-dashboard-auth.';
