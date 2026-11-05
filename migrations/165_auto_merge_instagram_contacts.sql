-- Migration 165: Auto-merge Instagram contacts by normalized username
-- Banco A only. No Banco B changes.
--
-- Two functions:
--   • auto_merge_instagram_contacts        — for omni_contacts (Maestria/agência)
--   • auto_merge_instagram_client_contacts — for client_channel_contacts (C8 Control tenants)
--
-- Called automatically from upsert_omni_contact_identity /
-- upsert_client_contact_identity (migration 164) when channel = instagram
-- and a username is present.
--
-- Survivor rule:
--   1. Contact with profile_pic_url wins; tie → earlier created_at wins.
--
-- merge_omni_contacts / merge_client_contacts are defined in migrations 141/147.

-- ── 1. auto_merge_instagram_contacts (Maestria / omni_contacts) ───────────────

CREATE OR REPLACE FUNCTION public.auto_merge_instagram_contacts(
  p_contact_id      UUID,
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm_username  TEXT;
  v_other_id       UUID;
  v_winner_id      UUID;
  v_loser_id       UUID;
  v_winner_pic     TEXT;
  v_other_pic      TEXT;
  v_winner_created TIMESTAMPTZ;
  v_other_created  TIMESTAMPTZ;
BEGIN
  -- 1. Get normalized username of this contact's instagram identity
  SELECT LOWER(TRIM(LEADING '@' FROM COALESCE(i.username, '')))
  INTO v_norm_username
  FROM public.omni_contact_identities i
  WHERE i.contact_id      = p_contact_id
    AND i.organization_id = p_organization_id
    AND i.channel_type    = 'instagram'
    AND i.username IS NOT NULL
    AND i.username <> ''
  LIMIT 1;

  IF v_norm_username IS NULL OR v_norm_username = '' THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'no_username');
  END IF;

  -- 2. Find another instagram identity with same normalized username, not yet merged
  SELECT i.contact_id INTO v_other_id
  FROM public.omni_contact_identities i
  JOIN public.omni_contacts c ON c.id = i.contact_id
  WHERE i.organization_id = p_organization_id
    AND i.channel_type    = 'instagram'
    AND LOWER(TRIM(LEADING '@' FROM COALESCE(i.username, ''))) = v_norm_username
    AND i.contact_id     <> p_contact_id
    AND c.merged_into_id IS NULL
  LIMIT 1;

  IF v_other_id IS NULL THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'no_match');
  END IF;

  -- 3. Survivor rule: profile_pic_url wins; tie → earlier created_at wins
  SELECT c1.profile_pic_url, c1.created_at,
         c2.profile_pic_url, c2.created_at
  INTO v_winner_pic, v_winner_created, v_other_pic, v_other_created
  FROM public.omni_contacts c1
  CROSS JOIN public.omni_contacts c2
  WHERE c1.id = p_contact_id AND c2.id = v_other_id;

  IF v_winner_pic IS NOT NULL AND v_other_pic IS NULL THEN
    v_winner_id := p_contact_id; v_loser_id := v_other_id;
  ELSIF v_other_pic IS NOT NULL AND v_winner_pic IS NULL THEN
    v_winner_id := v_other_id;   v_loser_id := p_contact_id;
  ELSIF v_winner_created <= v_other_created THEN
    v_winner_id := p_contact_id; v_loser_id := v_other_id;
  ELSE
    v_winner_id := v_other_id;   v_loser_id := p_contact_id;
  END IF;

  -- 4. Execute merge (defined in migration 147 — signature: winner, loser, merged_by)
  PERFORM public.merge_omni_contacts(v_winner_id, v_loser_id, NULL);

  RETURN jsonb_build_object(
    'merged',    true,
    'winner_id', v_winner_id,
    'loser_id',  v_loser_id,
    'username',  v_norm_username
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.auto_merge_instagram_contacts(UUID, UUID)
  TO authenticated, anon, service_role;

-- ── 2. auto_merge_instagram_client_contacts (C8 Control / client_channel_contacts) ──

CREATE OR REPLACE FUNCTION public.auto_merge_instagram_client_contacts(
  p_contact_id      UUID,
  p_client_id       UUID,
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm_username  TEXT;
  v_other_id       UUID;
  v_winner_id      UUID;
  v_loser_id       UUID;
  v_winner_pic     TEXT;
  v_other_pic      TEXT;
  v_winner_created TIMESTAMPTZ;
  v_other_created  TIMESTAMPTZ;
BEGIN
  -- 1. Get normalized username of this contact's instagram identity
  SELECT LOWER(TRIM(LEADING '@' FROM COALESCE(i.username, '')))
  INTO v_norm_username
  FROM public.client_contact_identities i
  WHERE i.contact_id  = p_contact_id
    AND i.client_id   = p_client_id
    AND i.channel_type = 'instagram'
    AND i.username IS NOT NULL
    AND i.username <> ''
  LIMIT 1;

  IF v_norm_username IS NULL OR v_norm_username = '' THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'no_username');
  END IF;

  -- 2. Find another instagram identity with same normalized username, not yet merged
  SELECT i.contact_id INTO v_other_id
  FROM public.client_contact_identities i
  JOIN public.client_channel_contacts c ON c.id = i.contact_id
  WHERE i.client_id   = p_client_id
    AND i.channel_type = 'instagram'
    AND LOWER(TRIM(LEADING '@' FROM COALESCE(i.username, ''))) = v_norm_username
    AND i.contact_id <> p_contact_id
    AND c.merged_into_id IS NULL
  LIMIT 1;

  IF v_other_id IS NULL THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'no_match');
  END IF;

  -- 3. Survivor rule: profile_pic_url wins; tie → earlier created_at wins
  SELECT c1.profile_pic_url, c1.created_at,
         c2.profile_pic_url, c2.created_at
  INTO v_winner_pic, v_winner_created, v_other_pic, v_other_created
  FROM public.client_channel_contacts c1
  CROSS JOIN public.client_channel_contacts c2
  WHERE c1.id = p_contact_id AND c2.id = v_other_id;

  IF v_winner_pic IS NOT NULL AND v_other_pic IS NULL THEN
    v_winner_id := p_contact_id; v_loser_id := v_other_id;
  ELSIF v_other_pic IS NOT NULL AND v_winner_pic IS NULL THEN
    v_winner_id := v_other_id;   v_loser_id := p_contact_id;
  ELSIF v_winner_created <= v_other_created THEN
    v_winner_id := p_contact_id; v_loser_id := v_other_id;
  ELSE
    v_winner_id := v_other_id;   v_loser_id := p_contact_id;
  END IF;

  -- 4. Execute merge (defined in migration 147 — signature: winner, loser, merged_by DEFAULT NULL)
  PERFORM public.merge_client_contacts(v_winner_id, v_loser_id, NULL);

  RETURN jsonb_build_object(
    'merged',    true,
    'winner_id', v_winner_id,
    'loser_id',  v_loser_id,
    'username',  v_norm_username
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.auto_merge_instagram_client_contacts(UUID, UUID, UUID)
  TO authenticated, anon, service_role;

-- ── Version marker ────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('165_auto_merge_instagram_contacts')
ON CONFLICT (version) DO NOTHING;
