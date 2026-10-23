-- Migration 142: migrar dados de whatsapp_contacts → omni_contacts + omni_contact_identities
-- Preserva IDs existentes para manter FKs válidas.

-- ── 1. Copiar whatsapp_contacts → omni_contacts ───────────────────────────────
-- Usa o mesmo id para manter compatibilidade com FKs existentes em
-- whatsapp_conversations.contact_id.
INSERT INTO public.omni_contacts (
  id,
  organization_id,
  client_id,
  lead_id,
  display_name,
  phone,
  metadata,
  created_at,
  updated_at
)
SELECT
  wc.id,
  wc.organization_id,
  wc.client_id,
  wc.lead_id,
  COALESCE(NULLIF(TRIM(wc.name), ''), 'Contato'),
  wc.phone,
  COALESCE(wc.metadata, '{}'),
  COALESCE(wc.created_at, now()),
  COALESCE(wc.updated_at, now())
FROM public.whatsapp_contacts wc
ON CONFLICT DO NOTHING;

-- ── 2. Criar identidades WhatsApp para contatos com phone ─────────────────────
INSERT INTO public.omni_contact_identities (
  organization_id,
  contact_id,
  channel_type,
  external_user_id,
  display_name,
  created_at
)
SELECT
  oc.organization_id,
  oc.id,
  'whatsapp',
  oc.phone,
  oc.display_name,
  oc.created_at
FROM public.omni_contacts oc
WHERE oc.phone IS NOT NULL
  AND oc.phone <> ''
  -- Garante que o contato veio do whatsapp_contacts original
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_contacts wc
    WHERE wc.id = oc.id
  )
ON CONFLICT (organization_id, channel_type, external_user_id) DO NOTHING;

-- ── Schema migration marker ───────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
  VALUES ('142_migrate_whatsapp_contacts')
  ON CONFLICT (version) DO NOTHING;
