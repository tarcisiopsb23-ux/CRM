ALTER TABLE public.job_title_catalog
ADD COLUMN role public.user_role NOT NULL DEFAULT 'member';

COMMENT ON COLUMN public.job_title_catalog.role IS 'Permissão de acesso concedida por este cargo.';
