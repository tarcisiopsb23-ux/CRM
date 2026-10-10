-- =============================================================================
-- Migration 119: Content Operations — Briefings e Comentários
-- Banco A — Idempotente
--
-- Cria:
--   • content_briefs    — briefings estruturados criados pela agência
--   • content_comments  — comentários threaded com Realtime (agência/cliente/parceiro)
--
-- Dependências: migration 118 (content_items, content_campaigns)
-- =============================================================================

-- ─── 1. content_briefs ────────────────────────────────────────────────────────
-- Criados exclusivamente pela agência. Cliente tem acesso de leitura.

CREATE TABLE IF NOT EXISTS public.content_briefs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
  campaign_id     UUID        REFERENCES public.content_campaigns(id)      ON DELETE SET NULL,
  content_item_id UUID        REFERENCES public.content_items(id)          ON DELETE SET NULL,

  title           TEXT        NOT NULL,
  objective       TEXT,
  target_audience TEXT,
  key_messages    TEXT[]      NOT NULL DEFAULT '{}',
  tone_of_voice   TEXT,       -- formal / casual / técnico / divertido / inspirador
  references      TEXT[]      NOT NULL DEFAULT '{}',  -- URLs de referência
  restrictions    TEXT,
  deadline        DATE,
  notes           TEXT,

  status          TEXT        NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','enviado','aceito','revisao')),

  -- Checklist de tarefas para o cliente
  -- Formato: [{"id": "uuid", "task": "texto", "status": "pendente|concluido", "due_date": "YYYY-MM-DD"}]
  client_tasks    JSONB       NOT NULL DEFAULT '[]',

  created_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_briefs_org_id
  ON public.content_briefs(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_briefs_client_id
  ON public.content_briefs(client_id);
CREATE INDEX IF NOT EXISTS idx_content_briefs_campaign_id
  ON public.content_briefs(campaign_id)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_briefs_content_item_id
  ON public.content_briefs(content_item_id)
  WHERE content_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_briefs_status
  ON public.content_briefs(status);

ALTER TABLE public.content_briefs ENABLE ROW LEVEL SECURITY;

-- Agência: acesso total
DROP POLICY IF EXISTS "content_briefs_agency_access" ON public.content_briefs;
CREATE POLICY "content_briefs_agency_access"
  ON public.content_briefs FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Cliente: leitura de briefings enviados (status != rascunho)
DROP POLICY IF EXISTS "content_briefs_client_read" ON public.content_briefs;
CREATE POLICY "content_briefs_client_read"
  ON public.content_briefs FOR SELECT TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')::UUID
    AND status != 'rascunho'
    AND (auth.jwt() ->> 'user_type') = 'client'
  );

-- Cliente: pode atualizar client_tasks (checklist de tarefas) em briefings enviados
-- UPDATE restrito apenas ao campo client_tasks via trigger (ver abaixo)
DROP POLICY IF EXISTS "content_briefs_client_update_tasks" ON public.content_briefs;
CREATE POLICY "content_briefs_client_update_tasks"
  ON public.content_briefs FOR UPDATE TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')::UUID
    AND status != 'rascunho'
    AND (auth.jwt() ->> 'user_type') = 'client'
  )
  WITH CHECK (
    client_id = (auth.jwt() ->> 'client_id')::UUID
    AND (auth.jwt() ->> 'user_type') = 'client'
  );

CREATE OR REPLACE TRIGGER trg_content_briefs_updated_at
  BEFORE UPDATE ON public.content_briefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.content_briefs IS
  'Briefings estruturados criados pela agência para orientar a produção de conteúdo.
   status=rascunho: visível apenas para a agência.
   status=enviado: liberado para leitura do cliente no C8 Control.
   client_tasks: checklist de tarefas que o cliente precisa completar (ex: enviar fotos).';

-- ─── 2. content_comments ──────────────────────────────────────────────────────
-- Comentários threaded em itens de conteúdo.
-- Suporta Realtime via Supabase channel postgres_changes.
-- is_internal = true: visível apenas para a agência (notas internas).

CREATE TABLE IF NOT EXISTS public.content_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content_item_id UUID        NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,

  -- Thread: parent_id nulo = comentário raiz; preenchido = reply
  parent_id       UUID        REFERENCES public.content_comments(id) ON DELETE CASCADE,

  body            TEXT        NOT NULL CHECK (char_length(body) > 0),

  -- Autor polimórfico: pode ser agência, cliente ou parceiro
  author_id       UUID        NOT NULL,
  author_type     TEXT        NOT NULL CHECK (author_type IN ('agency','client','partner')),
  author_name     TEXT,       -- snapshot do nome no momento do comentário

  -- is_internal = true → visível apenas para a agência
  is_internal     BOOLEAN     NOT NULL DEFAULT false,

  -- Resolução de feedback
  resolved        BOOLEAN     NOT NULL DEFAULT false,
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_comments_item_id
  ON public.content_comments(content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_comments_org_id
  ON public.content_comments(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_comments_parent_id
  ON public.content_comments(parent_id)
  WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_comments_author
  ON public.content_comments(author_id, author_type);
-- Índice para Realtime: busca de comentários não resolvidos
CREATE INDEX IF NOT EXISTS idx_content_comments_unresolved
  ON public.content_comments(content_item_id, resolved)
  WHERE resolved = false;

ALTER TABLE public.content_comments ENABLE ROW LEVEL SECURITY;

-- Agência: acesso total a todos os comentários da organização
DROP POLICY IF EXISTS "content_comments_agency_access" ON public.content_comments;
CREATE POLICY "content_comments_agency_access"
  ON public.content_comments FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Cliente: leitura de comentários não-internos de seus itens
DROP POLICY IF EXISTS "content_comments_client_read" ON public.content_comments;
CREATE POLICY "content_comments_client_read"
  ON public.content_comments FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'client'
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.client_id = (auth.jwt() ->> 'client_id')::UUID
        AND ci.is_visible_to_client = true
    )
  );

-- Cliente: pode inserir comentários em seus itens visíveis
DROP POLICY IF EXISTS "content_comments_client_insert" ON public.content_comments;
CREATE POLICY "content_comments_client_insert"
  ON public.content_comments FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_type') = 'client'
    AND author_type = 'client'
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.client_id = (auth.jwt() ->> 'client_id')::UUID
        AND ci.is_visible_to_client = true
    )
  );

-- Cliente: pode editar/deletar apenas seus próprios comentários
DROP POLICY IF EXISTS "content_comments_client_own" ON public.content_comments;
CREATE POLICY "content_comments_client_own"
  ON public.content_comments FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'client'
    AND author_id = (auth.jwt() ->> 'client_user_id')::UUID
    AND author_type = 'client'
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_type') = 'client'
    AND author_id = (auth.jwt() ->> 'client_user_id')::UUID
  );

CREATE OR REPLACE TRIGGER trg_content_comments_updated_at
  BEFORE UPDATE ON public.content_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.content_comments IS
  'Comentários threaded em itens de conteúdo com suporte a Realtime.
   is_internal=true: visível apenas para a agência (notas internas de revisão).
   parent_id: permite replies encadeados.
   O canal Realtime deve ser configurado no frontend para postgres_changes
   na tabela content_comments filtrado por content_item_id.';

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('119_content_ops_briefs')
ON CONFLICT (version) DO NOTHING;
