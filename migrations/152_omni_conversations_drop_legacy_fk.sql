-- ── Migration 152: Remove FK legada contact_id → whatsapp_contacts ────────────
-- omni_conversations.contact_id aponta para whatsapp_contacts (tabela legada).
-- Novos contatos são criados em omni_contacts e vinculados via omni_contact_id.
-- A FK legada bloqueia a criação de conversas para contatos novos.
-- Solução: dropar a FK e tornar contact_id nullable (campo mantido por compat.).

ALTER TABLE public.omni_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_contact_id_fkey;

ALTER TABLE public.omni_conversations
  ALTER COLUMN contact_id DROP NOT NULL;

INSERT INTO public.schema_migrations (version)
VALUES ('bank_b_full_schema_v152_drop_legacy_fk')
ON CONFLICT (version) DO NOTHING;
