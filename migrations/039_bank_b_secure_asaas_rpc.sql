-- ============================================================
-- Migration 039: RPC segura para salvar chave Asaas no Banco B
-- Execute no Supabase de CADA CLIENTE (Banco B)
--
-- A chave de API do Asaas NUNCA é retornada ao frontend.
-- Esta RPC salva a chave e retorna apenas o boolean asaas_api_key_set.
-- A SELECT regular em ai_settings não expõe a chave porque ela está
-- filtrada na view ai_settings_safe (migration 038).
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_asaas_settings(
  p_asaas_api_key      TEXT DEFAULT NULL,
  p_pix_enabled        BOOLEAN DEFAULT true,
  p_boleto_enabled     BOOLEAN DEFAULT true,
  p_credit_card_enabled BOOLEAN DEFAULT false
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Busca registro existente
  SELECT id INTO v_id FROM public.ai_settings LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Atualiza — só inclui asaas_api_key no payload se foi fornecida
    IF p_asaas_api_key IS NOT NULL AND p_asaas_api_key <> '' THEN
      UPDATE public.ai_settings SET
        asaas_api_key      = p_asaas_api_key,
        asaas_api_key_set  = true,
        pix_enabled        = p_pix_enabled,
        boleto_enabled     = p_boleto_enabled,
        credit_card_enabled = p_credit_card_enabled,
        updated_at         = now()
      WHERE id = v_id;
    ELSE
      UPDATE public.ai_settings SET
        pix_enabled        = p_pix_enabled,
        boleto_enabled     = p_boleto_enabled,
        credit_card_enabled = p_credit_card_enabled,
        updated_at         = now()
      WHERE id = v_id;
    END IF;
  ELSE
    -- Insere novo registro
    INSERT INTO public.ai_settings (
      asaas_api_key, asaas_api_key_set,
      pix_enabled, boleto_enabled, credit_card_enabled
    ) VALUES (
      NULLIF(p_asaas_api_key, ''),
      (p_asaas_api_key IS NOT NULL AND p_asaas_api_key <> ''),
      p_pix_enabled, p_boleto_enabled, p_credit_card_enabled
    ) RETURNING id INTO v_id;
  END IF;

  -- Retorna apenas o status — nunca a chave
  RETURN jsonb_build_object(
    'success',          true,
    'asaas_api_key_set', (SELECT asaas_api_key_set FROM public.ai_settings WHERE id = v_id)
  );
END;
$$;

-- Registra versão
INSERT INTO public.schema_migrations (version) VALUES ('039')
ON CONFLICT (version) DO NOTHING;
