-- Migration 144: adiciona omni_contact_id em client_channel_conversations
--
-- A migration 143 adicionou omni_contact_id em omni_conversations (agência),
-- mas client_channel_conversations (clientes C8 Control) não recebeu esse campo.
-- Sem ele, o ContactSheet no C8 Control não consegue identificar o contato omnichannel.

ALTER TABLE public.client_channel_conversations
  ADD COLUMN IF NOT EXISTS omni_contact_id UUID REFERENCES public.omni_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ccc_omni_contact
  ON public.client_channel_conversations(omni_contact_id)
  WHERE omni_contact_id IS NOT NULL;

-- RPC para vincular uma conversa a um omni_contact (chamada pelo meta-webhook-client ao criar contato)
CREATE OR REPLACE FUNCTION public.link_conversation_omni_contact(
  p_conversation_id UUID,
  p_omni_contact_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.client_channel_conversations
  SET omni_contact_id = p_omni_contact_id
  WHERE id = p_conversation_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.link_conversation_omni_contact(UUID, UUID) TO authenticated, anon, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('144_client_channel_omni_contact_id')
ON CONFLICT (version) DO NOTHING;
