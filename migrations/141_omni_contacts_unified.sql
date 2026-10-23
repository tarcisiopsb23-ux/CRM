-- Migration 141: omni_contacts + omni_contact_identities + campos em clients
-- Cria a infraestrutura unificada de contatos omnichannel para a agência Maestria.

-- ── 1. Tabela omni_contacts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.omni_contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id             UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  display_name        TEXT NOT NULL DEFAULT 'Contato',
  phone               TEXT,
  email               TEXT,
  tags                TEXT[] DEFAULT '{}',
  notes               TEXT,
  metadata            JSONB DEFAULT '{}',
  is_blocked          BOOLEAN NOT NULL DEFAULT false,
  merged_into_id      UUID REFERENCES public.omni_contacts(id) ON DELETE SET NULL,
  merged_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE em (organization_id, phone) apenas onde phone não é nulo
CREATE UNIQUE INDEX IF NOT EXISTS omni_contacts_org_phone_uq
  ON public.omni_contacts (organization_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omni_contacts_org
  ON public.omni_contacts (organization_id);
CREATE INDEX IF NOT EXISTS idx_omni_contacts_client
  ON public.omni_contacts (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_omni_contacts_lead
  ON public.omni_contacts (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_omni_contacts_merged
  ON public.omni_contacts (merged_into_id) WHERE merged_into_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_omni_contacts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_omni_contacts_updated_at'
      AND tgrelid = 'public.omni_contacts'::regclass
  ) THEN
    CREATE TRIGGER trg_omni_contacts_updated_at
    BEFORE UPDATE ON public.omni_contacts
    FOR EACH ROW EXECUTE FUNCTION public.set_omni_contacts_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE public.omni_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omni_contacts_auth" ON public.omni_contacts;
CREATE POLICY "omni_contacts_auth" ON public.omni_contacts
  FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_contacts TO authenticated;
GRANT ALL ON public.omni_contacts TO service_role;

-- ── 2. Tabela omni_contact_identities ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.omni_contact_identities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES public.omni_contacts(id) ON DELETE CASCADE,
  channel_type        TEXT NOT NULL CHECK (channel_type IN (
                        'whatsapp','instagram_dm','facebook_dm',
                        'instagram_comment','facebook_comment'
                      )),
  external_user_id    TEXT NOT NULL,
  display_name        TEXT,
  username            TEXT,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel_type, external_user_id)
);

CREATE INDEX IF NOT EXISTS idx_omni_identities_contact
  ON public.omni_contact_identities (contact_id);
CREATE INDEX IF NOT EXISTS idx_omni_identities_org_channel
  ON public.omni_contact_identities (organization_id, channel_type);

-- RLS
ALTER TABLE public.omni_contact_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omni_contact_identities_auth" ON public.omni_contact_identities;
CREATE POLICY "omni_contact_identities_auth" ON public.omni_contact_identities
  FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_contact_identities TO authenticated;
GRANT ALL ON public.omni_contact_identities TO service_role;

-- ── 3. Novos campos em clients ────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_phone    TEXT,
  ADD COLUMN IF NOT EXISTS instagram_handle  TEXT,
  ADD COLUMN IF NOT EXISTS instagram_psid    TEXT,
  ADD COLUMN IF NOT EXISTS facebook_psid     TEXT;

-- ── 4. RPC: upsert_omni_contact_identity ─────────────────────────────────────
-- Busca identidade existente ou cria novo contato + identidade.
-- Retorna o contact_id.
CREATE OR REPLACE FUNCTION public.upsert_omni_contact_identity(
  p_organization_id  UUID,
  p_channel_type     TEXT,
  p_external_user_id TEXT,
  p_display_name     TEXT DEFAULT NULL,
  p_username         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact_id UUID;
  v_identity_id UUID;
BEGIN
  -- Verifica se já existe identidade
  SELECT contact_id INTO v_contact_id
  FROM public.omni_contact_identities
  WHERE organization_id  = p_organization_id
    AND channel_type     = p_channel_type
    AND external_user_id = p_external_user_id;

  IF v_contact_id IS NULL THEN
    -- Cria novo contato
    INSERT INTO public.omni_contacts (organization_id, display_name, phone)
    VALUES (
      p_organization_id,
      COALESCE(p_display_name, 'Contato'),
      CASE WHEN p_channel_type = 'whatsapp' THEN p_external_user_id ELSE NULL END
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_contact_id;

    -- Se houve conflito (phone já existia para whatsapp), busca o existente
    IF v_contact_id IS NULL AND p_channel_type = 'whatsapp' THEN
      SELECT id INTO v_contact_id
      FROM public.omni_contacts
      WHERE organization_id = p_organization_id
        AND phone = p_external_user_id;
    END IF;

    -- Último fallback: insere sem phone
    IF v_contact_id IS NULL THEN
      INSERT INTO public.omni_contacts (organization_id, display_name)
      VALUES (p_organization_id, COALESCE(p_display_name, 'Contato'))
      RETURNING id INTO v_contact_id;
    END IF;
  END IF;

  -- Upsert da identidade
  INSERT INTO public.omni_contact_identities
    (organization_id, contact_id, channel_type, external_user_id, display_name, username)
  VALUES
    (p_organization_id, v_contact_id, p_channel_type, p_external_user_id,
     p_display_name, p_username)
  ON CONFLICT (organization_id, channel_type, external_user_id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, omni_contact_identities.display_name),
    username     = COALESCE(EXCLUDED.username, omni_contact_identities.username)
  RETURNING id INTO v_identity_id;

  RETURN v_contact_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_omni_contact_identity(UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, anon, service_role;

-- ── 5. RPC: merge_omni_contacts ───────────────────────────────────────────────
-- Move identidades do perdedor para vencedor e marca merged_into_id.
CREATE OR REPLACE FUNCTION public.merge_omni_contacts(
  p_winner_id   UUID,
  p_loser_id    UUID,
  p_merged_by   UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Valida que os dois contatos existem e pertencem à mesma organização
  SELECT organization_id INTO v_org_id
  FROM public.omni_contacts WHERE id = p_winner_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.omni_contacts
    WHERE id = p_loser_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Contacts must belong to the same organization';
  END IF;

  IF p_winner_id = p_loser_id THEN
    RAISE EXCEPTION 'Winner and loser must be different contacts';
  END IF;

  -- Move identidades do perdedor para vencedor (ignora conflitos)
  UPDATE public.omni_contact_identities
  SET contact_id = p_winner_id
  WHERE contact_id = p_loser_id
    AND NOT EXISTS (
      SELECT 1 FROM public.omni_contact_identities i2
      WHERE i2.contact_id          = p_winner_id
        AND i2.channel_type        = omni_contact_identities.channel_type
        AND i2.external_user_id    = omni_contact_identities.external_user_id
    );

  -- Redireciona conversas para o vencedor (se a coluna omni_contact_id já existir)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'omni_conversations'
      AND column_name  = 'omni_contact_id'
  ) THEN
    UPDATE public.omni_conversations
    SET omni_contact_id = p_winner_id
    WHERE omni_contact_id = p_loser_id;
  END IF;

  -- Vincula conversas antigas (via contact_id legado) se omni_conversations já existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'omni_conversations'
      AND column_name  = 'contact_id'
  ) THEN
    UPDATE public.omni_conversations
    SET contact_id = p_winner_id
    WHERE contact_id = p_loser_id;
  END IF;

  -- Marca perdedor como fundido
  UPDATE public.omni_contacts
  SET merged_into_id = p_winner_id,
      merged_at      = now(),
      updated_at     = now()
  WHERE id = p_loser_id;

END; $$;

GRANT EXECUTE ON FUNCTION public.merge_omni_contacts(UUID, UUID, UUID)
  TO authenticated, anon, service_role;

-- ── 6. RPC: get_omni_contact_with_identities ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_omni_contact_with_identities(
  p_contact_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'contact',    row_to_json(c.*),
    'identities', COALESCE(
      (SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.created_at)
       FROM public.omni_contact_identities i
       WHERE i.contact_id = c.id),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM public.omni_contacts c
  WHERE c.id = p_contact_id
    AND c.organization_id = get_user_organization_id();

  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_omni_contact_with_identities(UUID)
  TO authenticated, anon, service_role;

-- ── Schema migration marker ───────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
  VALUES ('141_omni_contacts_unified')
  ON CONFLICT (version) DO NOTHING;
