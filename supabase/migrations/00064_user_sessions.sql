-- Tracks the single active session per user.
-- When a new login occurs, force_logout_at is updated, causing any
-- previously active session to detect the change and sign itself out.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,          -- random token written at login time
  force_logout_at TIMESTAMPTZ,          -- bumped on every new login
  logged_in_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the service role can write; authenticated users can only read their own row.
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sessions_select_own"
  ON public.user_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for regular users — only service role (edge function) writes.

-- Realtime: allow authenticated users to subscribe to their own row changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
