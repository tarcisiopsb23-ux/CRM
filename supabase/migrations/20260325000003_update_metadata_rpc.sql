-- Migration: RPC de Atualização de Metadata de Integrações
-- Cria a função update_client_integrations para persistir configurações de integração
-- do parceiro (GTM, Meta Pixel, n8n, WhatsApp) no campo metadata da tabela clients.
-- Usa SECURITY DEFINER e merge parcial (||) para preservar campos existentes.
-- Idempotente: usa CREATE OR REPLACE FUNCTION.
--
-- Requisitos cobertos: 10.5, 13.2, 13.5

-- ============================================================
-- RPC: update_client_integrations
-- Atualiza os campos de integração no metadata do parceiro.
-- Usa merge parcial (||) para preservar campos existentes não modificados (req 13.2).
-- Valida formato GTM e Meta Pixel antes de persistir (req 13.5).
-- Retorna VOID; lança exceção com mensagem descritiva para formatos inválidos.
-- ============================================================
CREATE OR REPLACE FUNCTION update_client_integrations(
  p_client_id           UUID,
  p_gtm_id              TEXT,
  p_meta_pixel_id       TEXT,
  p_n8n_api_key         TEXT,
  p_whatsapp_webhook_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
BEGIN
  -- Valida formato GTM: deve ser NULL, vazio ou corresponder a GTM-[A-Z0-9]+ (req 7.5, 13.5)
  IF p_gtm_id IS NOT NULL AND p_gtm_id <> '' THEN
    IF p_gtm_id !~ '^GTM-[A-Z0-9]+$' THEN
      RAISE EXCEPTION 'Formato de GTM ID inválido: %. O formato esperado é GTM-[A-Z0-9]+.', p_gtm_id;
    END IF;
  END IF;

  -- Valida formato Meta Pixel: deve ser NULL, vazio ou numérico com 15-16 dígitos (req 8.5, 13.5)
  IF p_meta_pixel_id IS NOT NULL AND p_meta_pixel_id <> '' THEN
    IF p_meta_pixel_id !~ '^\d{15,16}$' THEN
      RAISE EXCEPTION 'Formato de Meta Pixel ID inválido: %. O valor deve ser numérico com 15 ou 16 dígitos.', p_meta_pixel_id;
    END IF;
  END IF;

  -- Persiste os valores via merge parcial, preservando campos existentes (req 13.2, 10.5)
  UPDATE clients
  SET metadata = metadata
    || jsonb_build_object(
         'gtm_id',               COALESCE(p_gtm_id, ''),
         'meta_pixel_id',        COALESCE(p_meta_pixel_id, ''),
         'n8n_api_key',          COALESCE(p_n8n_api_key, ''),
         'whatsapp_webhook_url', COALESCE(p_whatsapp_webhook_url, '')
       )
  WHERE id = p_client_id;
END;
$;
