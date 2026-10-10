-- Migration 00190: Tabela de participantes ClickUp (projetos e tarefas)
-- Armazena o status do convite para exibição na UI

CREATE TABLE IF NOT EXISTS public.clickup_participants (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- task_id é opcional: NULL = participante do projeto, preenchido = participante da tarefa
  task_id         UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  -- clickup_id: list_id (projeto) ou task_id (tarefa) no ClickUp
  clickup_id      TEXT NOT NULL,
  clickup_type    TEXT NOT NULL CHECK (clickup_type IN ('project', 'task')),
  -- Dados do participante
  profile_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  external        BOOLEAN NOT NULL DEFAULT false,
  -- Status do convite
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'active', 'error')),
  error_message   TEXT,
  -- Metadados
  invited_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clickup_participants_project ON public.clickup_participants(project_id);
CREATE INDEX IF NOT EXISTS idx_clickup_participants_task    ON public.clickup_participants(task_id);
CREATE INDEX IF NOT EXISTS idx_clickup_participants_email   ON public.clickup_participants(email);

ALTER TABLE public.clickup_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clickup_participants_org_access" ON public.clickup_participants
  FOR ALL
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- RPC para atualizar status (chamada pelo n8n após processar o convite)
CREATE OR REPLACE FUNCTION public.update_clickup_participant_status(
  p_id            UUID,
  p_status        TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clickup_participants
  SET status        = p_status,
      error_message = p_error_message,
      updated_at    = now()
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_clickup_participant_status(UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
