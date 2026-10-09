-- Migration: RPC para recebimento de webhook n8n (integração WhatsApp)
-- Implementa upsert_lead_from_whatsapp com SECURITY DEFINER
-- Requirements: 5.1, 5.2
--
-- Nota: o banco é single-tenant (um banco por parceiro), portanto p_client_id
-- é recebido como parâmetro para identificar o parceiro na chamada RPC,
-- mas crm_leads não possui coluna client_id — o isolamento é garantido
-- pelo próprio banco dedicado.

CREATE OR REPLACE FUNCTION upsert_lead_from_whatsapp(
  p_client_id       UUID,
  p_name            TEXT,
  p_phone           TEXT,
  p_whatsapp_link   TEXT,
  p_last_contact_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id UUID;
BEGIN
  -- Tenta encontrar lead existente com mesmo phone
  SELECT id INTO v_lead_id
  FROM crm_leads
  WHERE phone = p_phone
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    -- Atualiza lead existente: whatsapp_link e last_contact_at
    UPDATE crm_leads
    SET
      whatsapp_link   = p_whatsapp_link,
      last_contact_at = p_last_contact_at,
      updated_at      = now()
    WHERE id = v_lead_id;
  ELSE
    -- Insere novo lead com origin = 'whatsapp'
    INSERT INTO crm_leads (
      name,
      phone,
      whatsapp_link,
      last_contact_at,
      origin,
      status
    ) VALUES (
      p_name,
      p_phone,
      p_whatsapp_link,
      p_last_contact_at,
      'whatsapp',
      'novo'
    )
    RETURNING id INTO v_lead_id;
  END IF;

  RETURN v_lead_id;
END;
$$;
