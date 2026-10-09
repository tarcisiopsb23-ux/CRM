-- =============================================================================
-- Migration 118: Content Operations — Tabelas Core
-- Banco A — Idempotente
--
-- Cria as tabelas fundamentais do módulo de Gestão de Conteúdo:
--   • content_campaigns     — campanhas de conteúdo por cliente
--   • content_items         — unidade central (post, reels, story, roteiro, etc.)
--   • content_item_versions — snapshots imutáveis a cada envio para aprovação
--   • content_assets        — arquivos vinculados (Drive/Vimeo via n8n)
--   • content_approval_history — registro imutável de decisões de aprovação
--   • content_deliverables  — entregáveis formais ao final de um ciclo
--
-- RLS:
--   Agência: filtra por organization_id via get_user_organization_id()
--   Cliente C8 Control: filtra por client_id via JWT claim
--   Parceiro: filtra por assigned_to via JWT claim (adicionado na migration 120)
--
-- Dependências:
--   • organizations, clients, profiles, dashboard_users (já existem)
--   • tasks (já existe) — task_id é adicionado à content_items
-- =============================================================================

-- ─── 1. content_campaigns ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_campaigns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,

  title           TEXT        NOT NULL,
  description     TEXT,
  objective       TEXT        CHECK (objective IN (
                    'brand_awareness','lead_gen','engagement','retention','lancamento','outro'
                  )),
  status          TEXT        NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','ativa','concluida','arquivada')),

  start_date      DATE,
  end_date        DATE,
  metadata        JSONB       NOT NULL DEFAULT '{}',

  created_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_campaigns_org_id
  ON public.content_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_campaigns_client_id
  ON public.content_campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_content_campaigns_status
  ON public.content_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_content_campaigns_dates
  ON public.content_campaigns(start_date, end_date);

ALTER TABLE public.content_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_campaigns_agency_access" ON public.content_campaigns;
CREATE POLICY "content_campaigns_agency_access"
  ON public.content_campaigns FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Política de leitura para usuários do C8 Control (JWT com client_id claim)
-- O client_id vem do custom_access_token_hook como claim 'client_id'
DROP POLICY IF EXISTS "content_campaigns_client_read" ON public.content_campaigns;
CREATE POLICY "content_campaigns_client_read"
  ON public.content_campaigns FOR SELECT TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')::UUID
    AND (auth.jwt() ->> 'user_type') = 'client'
  );

COMMENT ON TABLE public.content_campaigns IS
  'Campanhas de conteúdo agrupando itens de um período/objetivo por cliente.';

-- ─── 2. content_items ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id            UUID        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
  campaign_id          UUID        REFERENCES public.content_campaigns(id)      ON DELETE SET NULL,

  -- Vínculo com módulo de Projetos/Tarefas (espelho de visibilidade)
  task_id              UUID        REFERENCES public.tasks(id)                  ON DELETE SET NULL,

  -- Classificação
  content_type         TEXT        CHECK (content_type IN (
                         'post','reels','story','carousel','email',
                         'roteiro','banner','video','outro'
                       )),
  platform             TEXT        CHECK (platform IN (
                         'instagram','facebook','linkedin','tiktok',
                         'youtube','google','email','outro'
                       )),
  format               TEXT,       -- feed / stories / reels / shorts / carrossel / single / video / texto

  -- Conteúdo
  title                TEXT        NOT NULL,
  copy_text            TEXT,
  hashtags             TEXT[]      NOT NULL DEFAULT '{}',
  description          TEXT,       -- notas internas / briefing resumido

  -- Workflow interno (agência)
  status               TEXT        NOT NULL DEFAULT 'briefing'
                       CHECK (status IN (
                         'briefing','producao','revisao_interna',
                         'aguardando_aprovacao','aprovado','reprovado',
                         'publicado','arquivado'
                       )),
  priority             TEXT        NOT NULL DEFAULT 'media'
                       CHECK (priority IN ('baixa','media','alta','urgente')),

  -- Responsável — pode ser profiles.id (agency) ou partner_users.id (partner)
  assigned_to          UUID,
  assigned_to_type     TEXT        NOT NULL DEFAULT 'agency'
                       CHECK (assigned_to_type IN ('agency','partner')),
  reviewer_id          UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Datas de produção e publicação
  production_deadline  DATE,
  scheduled_date       DATE,
  scheduled_time       TIME,
  published_at         TIMESTAMPTZ,

  -- Publicação
  publication_url      TEXT,
  publication_notes    TEXT,

  -- Aprovação do cliente
  approval_status      TEXT        NOT NULL DEFAULT 'pendente'
                       CHECK (approval_status IN (
                         'pendente','aprovado','reprovado','alteracao_solicitada'
                       )),
  approved_by          UUID        REFERENCES public.dashboard_users(id) ON DELETE SET NULL,
  approved_at          TIMESTAMPTZ,
  approval_notes       TEXT,

  -- Controle de versão
  version              INTEGER     NOT NULL DEFAULT 1,

  -- Visibilidade para o cliente
  is_visible_to_client BOOLEAN     NOT NULL DEFAULT false,

  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_by           UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_items_org_id
  ON public.content_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_items_client_id
  ON public.content_items(client_id);
CREATE INDEX IF NOT EXISTS idx_content_items_campaign_id
  ON public.content_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_items_status
  ON public.content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_items_approval_status
  ON public.content_items(approval_status);
CREATE INDEX IF NOT EXISTS idx_content_items_assigned_to
  ON public.content_items(assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_items_scheduled_date
  ON public.content_items(scheduled_date)
  WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_items_visible_client
  ON public.content_items(client_id, is_visible_to_client)
  WHERE is_visible_to_client = true;
CREATE INDEX IF NOT EXISTS idx_content_items_task_id
  ON public.content_items(task_id)
  WHERE task_id IS NOT NULL;

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

-- Agência: acesso total por organization_id
DROP POLICY IF EXISTS "content_items_agency_access" ON public.content_items;
CREATE POLICY "content_items_agency_access"
  ON public.content_items FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Cliente C8 Control: leitura apenas de itens visíveis
DROP POLICY IF EXISTS "content_items_client_read" ON public.content_items;
CREATE POLICY "content_items_client_read"
  ON public.content_items FOR SELECT TO authenticated
  USING (
    client_id       = (auth.jwt() ->> 'client_id')::UUID
    AND is_visible_to_client = true
    AND (auth.jwt() ->> 'user_type') = 'client'
  );

COMMENT ON TABLE public.content_items IS
  'Unidade central do módulo de conteúdo — post, reels, story, roteiro, banner, etc.
   assigned_to pode referenciar profiles (agency) ou partner_users (partner),
   diferenciado pelo campo assigned_to_type.
   is_visible_to_client controla o que o C8 Control consegue ver.';

-- ─── 3. content_item_versions ─────────────────────────────────────────────────
-- Snapshot imutável criado a cada envio para aprovação.
-- Sem UPDATE/DELETE — registro permanente de auditoria.

CREATE TABLE IF NOT EXISTS public.content_item_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID        NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  version_number  INTEGER     NOT NULL,
  copy_text       TEXT,
  hashtags        TEXT[]      NOT NULL DEFAULT '{}',
  description     TEXT,
  snapshot_data   JSONB       NOT NULL DEFAULT '{}',  -- snapshot completo do item
  created_by      UUID,       -- profiles.id ou partner_users.id
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- sem updated_at — registro imutável
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_item_versions_unique
  ON public.content_item_versions(content_item_id, version_number);
CREATE INDEX IF NOT EXISTS idx_content_item_versions_item_id
  ON public.content_item_versions(content_item_id);

ALTER TABLE public.content_item_versions ENABLE ROW LEVEL SECURITY;

-- Agência: leitura e criação (nunca delete/update)
DROP POLICY IF EXISTS "content_item_versions_agency" ON public.content_item_versions;
CREATE POLICY "content_item_versions_agency"
  ON public.content_item_versions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.organization_id = public.get_user_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.organization_id = public.get_user_organization_id()
    )
  );

-- Cliente: leitura de versões de itens visíveis
DROP POLICY IF EXISTS "content_item_versions_client_read" ON public.content_item_versions;
CREATE POLICY "content_item_versions_client_read"
  ON public.content_item_versions FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'client'
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.client_id = (auth.jwt() ->> 'client_id')::UUID
        AND ci.is_visible_to_client = true
    )
  );

COMMENT ON TABLE public.content_item_versions IS
  'Snapshots imutáveis de content_items a cada envio para aprovação.
   Nunca fazer UPDATE ou DELETE — registro de auditoria permanente.';

-- ─── 4. content_assets ────────────────────────────────────────────────────────
-- Arquivos vinculados a itens de conteúdo.
-- Processamento assíncrono via n8n: staging → Drive (imagem/doc) ou Vimeo (vídeo).

CREATE TABLE IF NOT EXISTS public.content_assets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content_item_id   UUID        NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,

  -- Metadados do arquivo
  file_name         TEXT        NOT NULL,
  file_type         TEXT        CHECK (file_type IN ('image','video','pdf','document','audio','outro')),
  mime_type         TEXT,
  file_size         BIGINT,     -- bytes
  is_final          BOOLEAN     NOT NULL DEFAULT false,
  version           INTEGER     NOT NULL DEFAULT 1,

  -- Provedor externo (resolvido pelo n8n após processamento)
  external_provider TEXT        CHECK (external_provider IN ('google_drive','vimeo','youtube')),
  external_id       TEXT,       -- drive_file_id ou vimeo_video_id
  embed_url         TEXT,       -- URL de embed (player Vimeo ou Google Docs Viewer)
  view_url          TEXT,       -- URL de visualização direta
  thumbnail_url     TEXT,

  -- Status do processamento assíncrono
  status            TEXT        NOT NULL DEFAULT 'staging'
                    CHECK (status IN ('staging','processing','ready','error')),
  error_message     TEXT,

  -- Quem fez upload
  uploaded_by       UUID,       -- profiles.id, dashboard_users.id ou partner_users.id
  uploader_type     TEXT        CHECK (uploader_type IN ('agency','client','partner')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_assets_item_id
  ON public.content_assets(content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_assets_org_id
  ON public.content_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_assets_status
  ON public.content_assets(status);
CREATE INDEX IF NOT EXISTS idx_content_assets_is_final
  ON public.content_assets(content_item_id, is_final);

ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_assets_agency_access" ON public.content_assets;
CREATE POLICY "content_assets_agency_access"
  ON public.content_assets FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Cliente: leitura de assets de itens visíveis
DROP POLICY IF EXISTS "content_assets_client_read" ON public.content_assets;
CREATE POLICY "content_assets_client_read"
  ON public.content_assets FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'client'
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.client_id = (auth.jwt() ->> 'client_id')::UUID
        AND ci.is_visible_to_client = true
    )
  );

COMMENT ON TABLE public.content_assets IS
  'Arquivos vinculados a itens de conteúdo.
   status=staging: arquivo no bucket temporário aguardando n8n.
   status=processing: n8n está fazendo upload para Drive ou Vimeo.
   status=ready: external_id e embed_url preenchidos, bucket staging limpo.
   status=error: falha no processamento; error_message descreve o problema.';

-- ─── 5. content_approval_history ─────────────────────────────────────────────
-- Registro IMUTÁVEL de todas as decisões de aprovação.
-- Nunca fazer UPDATE ou DELETE nesta tabela.

CREATE TABLE IF NOT EXISTS public.content_approval_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content_item_id UUID        NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,

  decision        TEXT        NOT NULL
                  CHECK (decision IN (
                    'enviado_para_aprovacao','aprovado','reprovado',
                    'alteracao_solicitada','publicado','arquivado'
                  )),
  decided_by      UUID        NOT NULL,
  decider_type    TEXT        NOT NULL CHECK (decider_type IN ('agency','client','partner')),
  decider_name    TEXT,       -- snapshot do nome no momento da decisão
  notes           TEXT,
  version_number  INTEGER,    -- versão do item no momento da decisão

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- sem updated_at — registro imutável
);

CREATE INDEX IF NOT EXISTS idx_content_approval_history_item_id
  ON public.content_approval_history(content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_approval_history_org_id
  ON public.content_approval_history(organization_id, created_at DESC);

ALTER TABLE public.content_approval_history ENABLE ROW LEVEL SECURITY;

-- Agência: acesso completo de leitura; inserção apenas (sem delete/update via RLS)
DROP POLICY IF EXISTS "content_approval_history_agency" ON public.content_approval_history;
CREATE POLICY "content_approval_history_agency"
  ON public.content_approval_history FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Cliente: leitura do histórico de seus itens
DROP POLICY IF EXISTS "content_approval_history_client_read" ON public.content_approval_history;
CREATE POLICY "content_approval_history_client_read"
  ON public.content_approval_history FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'user_type') = 'client'
    AND EXISTS (
      SELECT 1 FROM public.content_items ci
      WHERE ci.id = content_item_id
        AND ci.client_id = (auth.jwt() ->> 'client_id')::UUID
    )
  );

COMMENT ON TABLE public.content_approval_history IS
  'Registro imutável de todas as decisões de aprovação de itens de conteúdo.
   NUNCA fazer UPDATE ou DELETE — é o audit trail permanente de aprovações.
   Inserções devem ser feitas apenas via RPC approve_content_item ou
   send_content_item_for_approval (SECURITY DEFINER).';

-- ─── 6. content_deliverables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_deliverables (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id            UUID        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
  campaign_id          UUID        REFERENCES public.content_campaigns(id)      ON DELETE SET NULL,

  title                TEXT        NOT NULL,
  description          TEXT,
  period_start         DATE,
  period_end           DATE,
  items_count          INTEGER     DEFAULT 0,
  reach_total          BIGINT      DEFAULT 0,
  engagement_total     BIGINT      DEFAULT 0,
  summary_notes        TEXT,

  -- Visibilidade para o cliente
  is_visible_to_client BOOLEAN     NOT NULL DEFAULT true,

  created_by           UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_deliverables_org_id
  ON public.content_deliverables(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_deliverables_client_id
  ON public.content_deliverables(client_id);
CREATE INDEX IF NOT EXISTS idx_content_deliverables_campaign_id
  ON public.content_deliverables(campaign_id);

ALTER TABLE public.content_deliverables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_deliverables_agency_access" ON public.content_deliverables;
CREATE POLICY "content_deliverables_agency_access"
  ON public.content_deliverables FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS "content_deliverables_client_read" ON public.content_deliverables;
CREATE POLICY "content_deliverables_client_read"
  ON public.content_deliverables FOR SELECT TO authenticated
  USING (
    client_id = (auth.jwt() ->> 'client_id')::UUID
    AND is_visible_to_client = true
    AND (auth.jwt() ->> 'user_type') = 'client'
  );

COMMENT ON TABLE public.content_deliverables IS
  'Entregáveis formais ao final de um ciclo de conteúdo.
   O PDF é gerado no frontend via iframe + window.print() (padrão ContractViewer).';

-- ─── 7. Triggers updated_at ───────────────────────────────────────────────────

DO $trg$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'content_campaigns',
    'content_items',
    'content_assets',
    'content_deliverables'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $trg$;

-- content_item_versions e content_approval_history NÃO têm trigger updated_at
-- pois são registros imutáveis.

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('118_content_ops_core')
ON CONFLICT (version) DO NOTHING;
