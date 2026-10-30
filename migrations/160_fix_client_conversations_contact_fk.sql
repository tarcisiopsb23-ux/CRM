-- Migration 160: Corrige FK omni_contact_id em client_channel_conversations
--
-- O campo omni_contact_id foi criado na migration 144 apontando para omni_contacts (agência).
-- Para o lado cliente, o contato fica em client_channel_contacts.
-- Renomeia a coluna para deixar claro a distinção e recria a FK correta.

-- 1. Remove FK antiga (aponta para omni_contacts)
ALTER TABLE public.client_channel_conversations
  DROP CONSTRAINT IF EXISTS client_channel_conversations_omni_contact_id_fkey;

-- 2. Remove índice antigo
DROP INDEX IF EXISTS idx_ccc_omni_contact;

-- 3. Recria a FK apontando para client_channel_contacts
ALTER TABLE public.client_channel_conversations
  ADD CONSTRAINT client_channel_conversations_omni_contact_id_fkey
  FOREIGN KEY (omni_contact_id)
  REFERENCES public.client_channel_contacts(id)
  ON DELETE SET NULL;

-- 4. Recria índice
CREATE INDEX IF NOT EXISTS idx_cconv_omni_contact
  ON public.client_channel_conversations(omni_contact_id)
  WHERE omni_contact_id IS NOT NULL;

-- 5. Versão
INSERT INTO public.schema_migrations (version)
VALUES ('160_fix_client_conversations_contact_fk')
ON CONFLICT (version) DO NOTHING;
