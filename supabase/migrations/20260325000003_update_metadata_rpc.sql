-- Migration: RPC de Atualizacao de Metadata de Integracoes
CREATE OR REPLACE FUNCTION update_client_integrations(
  p_client_id            UUID,
  p_gtm_id               TEXT,
  p_meta_pixel_id        TEXT,
  p_n8n_api_key          TEXT,
  p_whatsapp_webhook_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_gtm_id IS NOT NULL AND p_gtm_id <> '' THEN
    IF p_gtm_id !~ '^GTM-[A-Z0-9]+$' THEN
      RAISE EXCEPTION 'Formato de GTM ID invalido: %. Esperado GTM-[A-Z0-9]+.', p_gtm_id;
    END IF;
  END IF;

  IF p_meta_pixel_id IS NOT NULL AND p_meta_pixel_id <> '' THEN
    IF p_meta_pixel_id !~ '^\d{15,16}$' THEN
      RAISE EXCEPTION 'Formato de Meta Pixel ID invalido: %. Deve ser numerico com 15 ou 16 digitos.', p_meta_pixel_id;
    END IF;
  END IF;

  UPDATE clients
  SET metadata = metadata || jsonb_build_object(
    'gtm_id',               COALESCE(p_gtm_id, ''),
    'meta_pixel_id',        COALESCE(p_meta_pixel_id, ''),
    'n8n_api_key',          COALESCE(p_n8n_api_key, ''),
    'whatsapp_webhook_url', COALESCE(p_whatsapp_webhook_url, '')
  )
  WHERE id = p_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_client_integrations TO authenticated;
