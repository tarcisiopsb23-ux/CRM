-- =============================================================================
-- MAESTR.IA - Integração WhatsApp via n8n
-- =============================================================================
-- Estrutura para: nova conversa → verificar telefone → criar lead se novo →
-- criar conversa → salvar mensagens
-- =============================================================================

-- 1. Adicionar lead_id em whatsapp_contacts (vincula contato ao lead)
ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_lead_id ON whatsapp_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone_org ON whatsapp_contacts(organization_id, phone);

-- 2. Garantir external_id em whatsapp_messages (deduplicação)
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_external_id
  ON whatsapp_messages(conversation_id, external_id) WHERE external_id IS NOT NULL;

-- 3. Garantir media_type em whatsapp_messages
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50);

-- 4. Função RPC para n8n processar mensagem inbound
-- Chamada: SELECT * FROM process_incoming_whatsapp_message(
--   p_organization_id, p_phone, p_contact_name, p_message_content,
--   p_message_external_id, p_direction
-- );
CREATE OR REPLACE FUNCTION process_incoming_whatsapp_message(
  p_organization_id UUID,
  p_phone VARCHAR(50),
  p_contact_name VARCHAR(255) DEFAULT NULL,
  p_message_content TEXT DEFAULT NULL,
  p_message_external_id VARCHAR(255) DEFAULT NULL,
  p_direction VARCHAR(10) DEFAULT 'inbound'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
  v_lead_id UUID;
  v_conversation_id UUID;
  v_message_id UUID;
  v_is_new_contact BOOLEAN := FALSE;
  v_is_new_conversation BOOLEAN := FALSE;
  v_phone_clean VARCHAR(50);
BEGIN
  -- Normalizar telefone (remover espaços)
  v_phone_clean := TRIM(REGEXP_REPLACE(p_phone, '\s', '', 'g'));

  IF v_phone_clean = '' OR p_organization_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone and organization_id required');
  END IF;

  -- 1) Verificar se telefone já existe
  SELECT id, lead_id INTO v_contact_id, v_lead_id
  FROM whatsapp_contacts
  WHERE organization_id = p_organization_id
    AND (phone = v_phone_clean OR phone = p_phone)
  LIMIT 1;

  -- 2) Se não existir → criar lead + contato
  IF v_contact_id IS NULL THEN
    v_is_new_contact := TRUE;

    -- Criar lead (etapa_kanban = leads_recebidos)
    INSERT INTO leads (
      organization_id, name, phone, stage_id, etapa_kanban, source, value
    ) VALUES (
      p_organization_id,
      COALESCE(NULLIF(TRIM(p_contact_name), ''), v_phone_clean),
      v_phone_clean,
      'leads_recebidos',
      'leads_recebidos',
      'WhatsApp',
      0
    )
    RETURNING id INTO v_lead_id;

    -- Criar contato vinculado ao lead
    INSERT INTO whatsapp_contacts (organization_id, phone, name, lead_id)
    VALUES (p_organization_id, v_phone_clean, p_contact_name, v_lead_id)
    RETURNING id INTO v_contact_id;
  END IF;

  -- 3) Obter ou criar conversa
  SELECT id INTO v_conversation_id
  FROM whatsapp_conversations
  WHERE contact_id = v_contact_id
  ORDER BY last_message_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    v_is_new_conversation := TRUE;
    INSERT INTO whatsapp_conversations (organization_id, contact_id, status, last_message_at)
    VALUES (p_organization_id, v_contact_id, 'aberta', NOW())
    RETURNING id INTO v_conversation_id;
  ELSE
    -- Atualizar last_message_at da conversa existente
    UPDATE whatsapp_conversations
    SET last_message_at = NOW(), updated_at = NOW()
    WHERE id = v_conversation_id;
  END IF;

  -- 4) Salvar mensagem (evitar duplicata por external_id quando informado)
  IF p_message_content IS NOT NULL OR p_message_external_id IS NOT NULL THEN
    INSERT INTO whatsapp_messages (
      organization_id, conversation_id, direction, content, external_id
    )
    SELECT
      p_organization_id, v_conversation_id,
      COALESCE(p_direction, 'inbound'),
      p_message_content,
      p_message_external_id
    WHERE (
      p_message_external_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM whatsapp_messages m
        WHERE m.conversation_id = v_conversation_id
          AND m.external_id = p_message_external_id
      )
    )
    RETURNING id INTO v_message_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', v_contact_id,
    'lead_id', v_lead_id,
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'is_new_contact', v_is_new_contact,
    'is_new_conversation', v_is_new_conversation
  );
END;
$$;

-- Comentário para documentação
COMMENT ON FUNCTION process_incoming_whatsapp_message IS 'n8n: processar mensagem WhatsApp. 1) Busca/cria contato 2) Se novo, cria lead 3) Cria/atualiza conversa 4) Salva mensagem';
