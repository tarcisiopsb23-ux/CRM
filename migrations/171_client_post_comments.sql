-- ── Migration 171: table client_post_comments and RPC get_contact_comments ───
-- Banco A only. Stores Instagram/Facebook post comments linked to contacts.
-- Used to display a dedicate "Comments" tab in the contact sheet, showing
-- every public comment the contact left on a post, with a direct link to
-- the originating post.
--
-- Columns:
--   id                  — PK UUID
--   client_id           — tenant isolation (required)
--   contact_id          — FK → client_channel_contacts (nullable; set to NULL
--                         if the contact record is deleted)
--   meta_connection_id  — FK → meta_connections (nullable; set to NULL if the
--                         connection is deleted)
--   channel             — 'instagram' | 'facebook'
--   external_comment_id — ID do comentário na API da Meta (usado como chave
--                         de deduplicação junto com client_id)
--   post_id             — ID do post/mídia na Meta
--   post_url            — link direto ao post (para abrir no browser/app)
--   comment_text        — texto do comentário
--   sender_id           — ID do usuário que comentou (Meta user ID)
--   sender_username     — username do usuário que comentou
--   commented_at        — timestamp do comentário (UTC)
--   metadata            — JSONB livre para campos extras do webhook
--   created_at          — quando o registro foi inserido no banco
--
-- Sem impacto no Banco B.

CREATE TABLE IF NOT EXISTS public.client_post_comments (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
  client_id           UUID        NOT NULL,
  contact_id          UUID        REFERENCES public.client_channel_contacts(id) ON DELETE SET NULL,
  meta_connection_id  UUID        REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  channel             TEXT        NOT NULL CHECK (channel IN ('instagram', 'facebook')),
  external_comment_id TEXT        NOT NULL,
  post_id             TEXT        NOT NULL,
  post_url            TEXT,
  comment_text        TEXT,
  sender_id           TEXT,
  sender_username     TEXT,
  commented_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT client_post_comments_pkey PRIMARY KEY (id)
);

-- Deduplication: a single comment from the Meta API should only be stored
-- once per client (same client_id + external_comment_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_post_comments_external
  ON public.client_post_comments (client_id, external_comment_id);

-- For fetching all comments of a specific contact, sorted by most recent first.
CREATE INDEX IF NOT EXISTS idx_client_post_comments_contact
  ON public.client_post_comments (contact_id, commented_at DESC);

-- For fetching all comments within a client tenant, sorted by most recent first.
CREATE INDEX IF NOT EXISTS idx_client_post_comments_client_created
  ON public.client_post_comments (client_id, commented_at DESC);

-- ── RPC: get_contact_comments ────────────────────────────────────────────────
-- Returns comments for a given contact, paginated.
-- Parameters:
--   p_contact_id — the contact's UUID
--   p_client_id  — tenant UUID (security boundary)
--   p_limit      — max rows to return (default 50)
--   p_offset     — pagination offset (default 0)
CREATE OR REPLACE FUNCTION public.get_contact_comments(
  p_contact_id UUID,
  p_client_id  UUID,
  p_limit      INT DEFAULT 50,
  p_offset     INT DEFAULT 0
)
RETURNS SETOF public.client_post_comments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM public.client_post_comments
    WHERE contact_id = p_contact_id
      AND client_id  = p_client_id
    ORDER BY commented_at DESC
    LIMIT  p_limit
    OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_comments(UUID, UUID, INT, INT)
  TO authenticated, anon, service_role;

-- ── Version marker ────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('171_client_post_comments')
ON CONFLICT (version) DO NOTHING;
