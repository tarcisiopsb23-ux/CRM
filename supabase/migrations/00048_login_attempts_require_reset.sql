ALTER TABLE public.login_attempts
ADD COLUMN IF NOT EXISTS require_reset BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS login_attempts_require_reset_idx ON public.login_attempts (require_reset);

