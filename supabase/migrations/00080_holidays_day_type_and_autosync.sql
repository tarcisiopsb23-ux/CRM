-- =============================================================================
-- Migration 00080: Adiciona day_type em rep_p_holidays + auto-sync 01/01
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Coluna day_type: 'feriado' (bloqueia ponto) | 'ponto_facultativo' (aviso)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE rep_p_holidays
  ADD COLUMN IF NOT EXISTS day_type TEXT NOT NULL DEFAULT 'feriado'
  CHECK (day_type IN ('feriado', 'ponto_facultativo'));

-- Feriados nacionais já existentes são todos 'feriado'
UPDATE rep_p_holidays SET day_type = 'feriado' WHERE day_type IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Função de sincronização automática via http extension (pg_net)
--    Chama a BrasilAPI para o ano corrente e faz upsert dos feriados nacionais.
--    Requer a extensão pg_net habilitada no Supabase.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rep_p_sync_national_holidays_current_year()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year INT := EXTRACT(YEAR FROM now())::INT;
  api_url      TEXT := 'https://brasilapi.com.br/api/feriados/v1/' || current_year;
BEGIN
  -- Dispara requisição HTTP assíncrona via pg_net.
  -- O resultado é processado pelo webhook handler (ver nota abaixo).
  -- Se pg_net não estiver disponível, esta função é um no-op seguro.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM net.http_get(url := api_url);
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Função de upsert direto (usada pelo Edge Function ou chamada manual)
--    Recebe o JSON da BrasilAPI e faz DELETE + INSERT dos nacionais do ano.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rep_p_upsert_national_holidays(
  p_year  INT,
  p_rows  JSONB   -- array de {date, name}
)
RETURNS INT   -- quantidade de feriados inseridos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted INT := 0;
  rec      JSONB;
BEGIN
  -- Remove nacionais do ano para re-inserir (NULL não funciona em UNIQUE)
  DELETE FROM rep_p_holidays
  WHERE is_national = true
    AND holiday_date >= (p_year || '-01-01')::DATE
    AND holiday_date <= (p_year || '-12-31')::DATE;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO rep_p_holidays (holiday_date, description, is_national, day_type, organization_id)
    VALUES (
      (rec->>'date')::DATE,
      rec->>'name',
      true,
      'feriado',
      NULL
    );
    inserted := inserted + 1;
  END LOOP;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION rep_p_upsert_national_holidays(INT, JSONB) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. pg_cron: agenda sincronização todo dia 01/01 às 03:00 UTC
--    Requer extensão pg_cron habilitada (disponível no Supabase Pro+).
--    Se não estiver disponível, o bloco é ignorado com segurança.
-- ─────────────────────────────────────────────────────────────────────────────
DO $cron_setup$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove job anterior se existir
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rep_p_sync_holidays_new_year') THEN
      PERFORM cron.unschedule('rep_p_sync_holidays_new_year');
    END IF;

    PERFORM cron.schedule(
      'rep_p_sync_holidays_new_year',
      '0 3 1 1 *',
      'SELECT rep_p_sync_national_holidays_current_year()'
    );
  END IF;
END;
$cron_setup$;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTA: Arquitetura do auto-sync
-- ─────────────────────────────────────────────────────────────────────────────
-- O pg_cron dispara rep_p_sync_national_holidays_current_year() em 01/01.
-- Essa função usa pg_net para chamar a BrasilAPI de forma assíncrona.
-- 
-- Para processar a resposta, crie um Supabase Edge Function chamada
-- "sync-holidays" que:
--   1. Recebe o callback do pg_net (ou é chamada diretamente pelo cron via HTTP)
--   2. Chama a BrasilAPI
--   3. Chama rep_p_upsert_national_holidays(year, rows) via supabase.rpc()
--
-- Alternativa simples: configurar um n8n workflow agendado para 01/01 que
-- chame a BrasilAPI e depois chame rep_p_upsert_national_holidays via RPC.
-- ─────────────────────────────────────────────────────────────────────────────
