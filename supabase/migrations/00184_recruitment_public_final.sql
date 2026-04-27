-- =============================================================================
-- Migration 00184: Acesso público vagas - padrão idêntico ao dashboard público
-- Execute no Supabase SQL Editor
-- =============================================================================

-- ── Remove versões anteriores com assinatura diferente ───────────────────────
DROP FUNCTION IF EXISTS public.get_public_job_openings();
DROP FUNCTION IF EXISTS public.get_public_job_opening(UUID);
DROP FUNCTION IF EXISTS public.get_public_job_form_questions(UUID);

-- ── RPC: lista todas as vagas abertas (sem parâmetros) ───────────────────────
CREATE OR REPLACE FUNCTION public.get_public_job_openings()
RETURNS SETOF public.job_openings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.job_openings
  WHERE status = 'aberta'
  ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_job_openings() TO anon, authenticated;

-- ── RPC: busca uma vaga específica ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_job_opening(p_job_opening_id UUID)
RETURNS SETOF public.job_openings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.job_openings
  WHERE id = p_job_opening_id
    AND status = 'aberta';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_job_opening(UUID) TO anon, authenticated;

-- ── RPC: perguntas do formulário de uma vaga ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_job_form_questions(p_job_opening_id UUID)
RETURNS SETOF public.job_form_questions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT q.*
  FROM public.job_form_questions q
  JOIN public.job_openings jo ON jo.id = q.job_opening_id
  WHERE q.job_opening_id = p_job_opening_id
    AND jo.status = 'aberta'
  ORDER BY q.sort_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_job_form_questions(UUID) TO anon, authenticated;

-- ── Notifica PostgREST para recarregar o schema ───────────────────────────────
NOTIFY pgrst, 'reload schema';
