-- Migration: 00053_integration_settings.sql
-- Description: Add a settings JSONB field to client_integrations for extra IDs like Pixel/Tag.

ALTER TABLE public.client_integrations
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::JSONB;

-- Example: 
-- Meta: { "pixel_id": "..." }
-- Google: { "tag_id": "G-XXXXX", "conversion_id": "..." }
