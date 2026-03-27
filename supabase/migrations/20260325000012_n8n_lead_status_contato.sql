-- Migration: Leads vindos do n8n/WhatsApp devem entrar com status 'contato'
-- Rationale: status 'contato' indica que o contato já foi iniciado,
-- alimentando corretamente o card "Conversas" do dashboard de atendimento.

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
  SELECT id INTO v_lead_id
  FROM crm_leads
  WHERE phone = p_phone
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    UPDATE crm_leads
    SET
      whatsapp_link   = p_whatsapp_link,
      last_contact_at = p_last_contact_at,
      updated_at      = now()
    WHERE id = v_lead_id;
  ELSE
    -- Leads do WhatsApp/n8n entram diretamente em 'contato'
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
      'contato'
    )
    RETURNING id INTO v_lead_id;
  END IF;

  RETURN v_lead_id;
END;
$$;
