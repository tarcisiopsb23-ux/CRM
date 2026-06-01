-- Migration 00192: Comentários do ClickUp para tarefas
-- Armazena comentários bidirecionais entre Maestr.IA e ClickUp

CREATE TABLE IF NOT EXISTS public.task_clickup_comments (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id           UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  -- ID do comentário no ClickUp (para evitar duplicatas no sync)
  clickup_comment_id TEXT UNIQUE,
  -- Origem: 'internal' = enviado pelo Maestr.IA, 'clickup' = recebido do ClickUp
  source            TEXT NOT NULL DEFAULT 'internal'
                      CHECK (source IN ('internal', 'clickup')),
  -- Autor
  author_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name       TEXT NOT NULL,
  author_email      TEXT,
  -- Conteúdo
  content           TEXT NOT NULL,
  -- Controle de leitura (para badge de não lidos)
  is_read           BOOLEAN NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  -- Timestamps
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_clickup_comments_task_id    ON public.task_clickup_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_clickup_comments_unread     ON public.task_clickup_comments(task_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_task_clickup_comments_source     ON public.task_clickup_comments(task_id, source);

ALTER TABLE public.task_clickup_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_clickup_comments_org_access" ON public.task_clickup_comments
  FOR ALL
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Habilita Realtime para notificações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_clickup_comments;

-- RPC para marcar comentários como lidos (chamada pelo frontend ao abrir a seção)
CREATE OR REPLACE FUNCTION public.mark_clickup_comments_read(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_clickup_comments
  SET is_read  = true,
      read_at  = now(),
      updated_at = now()
  WHERE task_id = p_task_id
    AND is_read = false
    AND source  = 'clickup';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_clickup_comments_read(UUID) TO authenticated, service_role;

-- RPC para inserir comentário vindo do ClickUp (chamada pelo n8n via service_role)
CREATE OR REPLACE FUNCTION public.insert_clickup_comment(
  p_organization_id   UUID,
  p_task_id           UUID,
  p_clickup_comment_id TEXT,
  p_author_name       TEXT,
  p_author_email      TEXT DEFAULT NULL,
  p_content           TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Ignora duplicatas (mesmo clickup_comment_id)
  IF EXISTS (SELECT 1 FROM public.task_clickup_comments WHERE clickup_comment_id = p_clickup_comment_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.task_clickup_comments (
    organization_id, task_id, clickup_comment_id,
    source, author_name, author_email, content, is_read
  ) VALUES (
    p_organization_id, p_task_id, p_clickup_comment_id,
    'clickup', p_author_name, p_author_email, p_content, false
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_clickup_comment(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
