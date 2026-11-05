-- Migration 162: Add profile_pic_url to Banco A channel contact tables
-- Banco A only. No Banco B changes (bank-b-schema-sync rule: NOT triggered).

ALTER TABLE public.client_channel_contacts
  ADD COLUMN IF NOT EXISTS profile_pic_url TEXT;

ALTER TABLE public.omni_contacts
  ADD COLUMN IF NOT EXISTS profile_pic_url TEXT;

INSERT INTO public.schema_migrations (version)
VALUES ('162_contact_profile_pic')
ON CONFLICT (version) DO NOTHING;
