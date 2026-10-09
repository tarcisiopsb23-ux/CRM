-- =============================================================================
-- Migration 122: Content Operations — RPCs
-- Banco A — Idempotente
--
-- RPCs do módulo de Gestão de Conteúdo:
--   • get_content_calendar         — calendário editorial (individual ou multi-cliente)
--   • get_content_items_for_client — itens visíveis no C8 Control
--   • get_content_items_for_partner — itens atribuídos ao parceiro
--   • send_content_item_for_approval — envia para aprovação (cria versão + notificação)
--   • approve_content_item         — registra aprovação/reprovação do cliente/parceiro
--   • mark_content_item_published  — finaliza item como publicado
--   • get_content_dashboard_summary — totais por status para o dashboard
--
-- Dependências: migrations 118–121
-- =============================================================================

-- ─── 1. get_content_calendar ──────────────────────────────────────────────────
-- Retorna itens de conteúdo em um período para o calendário editorial.
-- client_id NULL → retorna todos os clientes da organização (visão multi-cliente).

CREATE OR REPLACE FUNCTION public.get_content_calendar(
  p_organization_id UUID,
  p_start           DATE,
  p_end             DATE,
  p_client_id       UUID DEFAULT NULL
)
RETURNS TABLE (
  id                   UUID,
  client_id            UUID,
  client_name          TEXT,
  campaign_id          UUID,
  campaign_title       TEXT,
  title                TEXT,
  content_type         TEXT,
  platform             TEXT,
  status               TEXT,
  priority             TEXT,
  approval_status      TEXT,
  is_visible_to_client BOOLEAN,
  scheduled_date       DATE,
  scheduled_time       TIME,
  published_at         TIMESTAMPTZ,
  production_deadline  DATE,
  assigned_to          UUID,
  assigned_to_type     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id,
    ci.client_id,
    c.name              AS client_name,
    ci.campaign_id,
    camp.title          AS campaign_title,
    ci.title,
    ci.content_type,
    ci.platform,
    ci.status,
    ci.priority,
    ci.approval_status,
    ci.is_visible_to_client,
    ci.scheduled_date,
    ci.scheduled_time,
    ci.published_at,
    ci.production_deadline,
    ci.assigned_to,
    ci.assigned_to_type
  FROM public.content_items ci
  JOIN public.clients c ON c.id = ci.client_id
  LEFT JOIN public.content_campaigns camp ON camp.id = ci.campaign_id
  WHERE ci.organization_id = p_organization_id
    AND (p_client_id IS NULL OR ci.client_id = p_client_id)
    AND ci.status != 'arquivado'
    AND (
      -- Item tem data agendada no período
      (ci.scheduled_date >= p_start AND ci.scheduled_date <= p_end)
      OR
      -- Item tem prazo de produção no período
      (ci.production_deadline >= p_start AND ci.production_deadline <= p_end)
      OR
      -- Item foi publicado no período
      (ci.published_at::DATE >= p_start AND ci.published_at::DATE <= p_end)
    )
  ORDER BY
    COALESCE(ci.scheduled_date, ci.production_deadline) ASC,
    ci.scheduled_time ASC NULLS LAST,
    ci.priority DESC;
END;
$$;

COMMENT ON FUNCTION public.get_content_calendar IS
  'Retorna itens de conteúdo num período para o calendário editorial.
   p_client_id NULL → visão multi-cliente (todos os clientes da organização).';

-- ─── 2. get_content_items_for_client ─────────────────────────────────────────
-- Usada pelo C8 Control para buscar itens visíveis de um cliente.
-- Aplica filtro is_visible_to_client = true automaticamente.

CREATE OR REPLACE FUNCTION public.get_content_items_for_client(
  p_client_id    UUID,
  p_status       TEXT DEFAULT NULL,
  p_campaign_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  id                   UUID,
  campaign_id          UUID,
  campaign_title       TEXT,
  title                TEXT,
  content_type         TEXT,
  platform             TEXT,
  format               TEXT,
  copy_text            TEXT,
  hashtags             TEXT[],
  status               TEXT,
  approval_status      TEXT,
  approval_notes       TEXT,
  version              INTEGER,
  scheduled_date       DATE,
  scheduled_time       TIME,
  published_at         TIMESTAMPTZ,
  publication_url      TEXT,
  asset_count          BIGINT,
  comment_count        BIGINT,
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id,
    ci.campaign_id,
    camp.title           AS campaign_title,
    ci.title,
    ci.content_type,
    ci.platform,
    ci.format,
    ci.copy_text,
    ci.hashtags,
    ci.status,
    ci.approval_status,
    ci.approval_notes,
    ci.version,
    ci.scheduled_date,
    ci.scheduled_time,
    ci.published_at,
    ci.publication_url,
    (SELECT COUNT(*) FROM public.content_assets a
     WHERE a.content_item_id = ci.id AND a.status = 'ready')  AS asset_count,
    (SELECT COUNT(*) FROM public.content_comments co
     WHERE co.content_item_id = ci.id AND co.is_internal = false) AS comment_count,
    ci.created_at,
    ci.updated_at
  FROM public.content_items ci
  LEFT JOIN public.content_campaigns camp ON camp.id = ci.campaign_id
  WHERE ci.client_id           = p_client_id
    AND ci.is_visible_to_client = true
    AND ci.status              != 'arquivado'
    AND (p_status     IS NULL OR ci.status      = p_status)
    AND (p_campaign_id IS NULL OR ci.campaign_id = p_campaign_id)
  ORDER BY
    CASE ci.approval_status
      WHEN 'alteracao_solicitada' THEN 1
      WHEN 'pendente'             THEN 2
      WHEN 'aprovado'             THEN 3
      ELSE 4
    END,
    COALESCE(ci.scheduled_date, ci.production_deadline) ASC NULLS LAST,
    ci.updated_at DESC;
END;
$$;

-- ─── 3. get_content_items_for_partner ─────────────────────────────────────────
-- Usada pelo Portal Parceiro para buscar itens atribuídos ao parceiro.

CREATE OR REPLACE FUNCTION public.get_content_items_for_partner(
  p_partner_user_id UUID
)
RETURNS TABLE (
  id                  UUID,
  client_id           UUID,
  campaign_id         UUID,
  campaign_title      TEXT,
  title               TEXT,
  content_type        TEXT,
  platform            TEXT,
  copy_text           TEXT,
  description         TEXT,
  hashtags            TEXT[],
  status              TEXT,
  priority            TEXT,
  production_deadline DATE,
  scheduled_date      DATE,
  asset_count         BIGINT,
  comment_count       BIGINT,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id,
    ci.client_id,
    ci.campaign_id,
    camp.title           AS campaign_title,
    ci.title,
    ci.content_type,
    ci.platform,
    ci.copy_text,
    ci.description,
    ci.hashtags,
    ci.status,
    ci.priority,
    ci.production_deadline,
    ci.scheduled_date,
    (SELECT COUNT(*) FROM public.content_assets a
     WHERE a.content_item_id = ci.id AND a.status = 'ready')  AS asset_count,
    (SELECT COUNT(*) FROM public.content_comments co
     WHERE co.content_item_id = ci.id AND co.is_internal = false) AS comment_count,
    ci.created_at,
    ci.updated_at
  FROM public.content_items ci
  LEFT JOIN public.content_campaigns camp ON camp.id = ci.campaign_id
  WHERE ci.assigned_to      = p_partner_user_id
    AND ci.assigned_to_type = 'partner'
    AND ci.status           != 'arquivado'
  ORDER BY
    CASE ci.priority
      WHEN 'urgente' THEN 1
      WHEN 'alta'    THEN 2
      WHEN 'media'   THEN 3
      ELSE 4
    END,
    COALESCE(ci.production_deadline, ci.scheduled_date) ASC NULLS LAST;
END;
$$;

-- ─── 4. send_content_item_for_approval ────────────────────────────────────────
-- Envia item para aprovação do cliente:
--   1. Cria snapshot da versão atual em content_item_versions
--   2. Atualiza content_item: status = 'aguardando_aprovacao', is_visible_to_client = true
--   3. Insere em content_approval_history
--   4. Cria notificação para o cliente

CREATE OR REPLACE FUNCTION public.send_content_item_for_approval(
  p_item_id   UUID,
  p_sender_id UUID  -- profiles.id de quem está enviando
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          public.content_items%ROWTYPE;
  v_version       INTEGER;
  v_sender_name   TEXT;
  v_client_name   TEXT;
BEGIN
  -- Busca o item
  SELECT * INTO v_item FROM public.content_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item não encontrado');
  END IF;

  -- Valida status: só pode enviar de estados de produção
  IF v_item.status NOT IN ('briefing','producao','revisao_interna','reprovado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Item com status "%s" não pode ser enviado para aprovação', v_item.status)
    );
  END IF;

  -- Incrementa versão
  v_version := v_item.version + 1;

  -- Busca nome do sender
  SELECT full_name INTO v_sender_name FROM public.profiles WHERE id = p_sender_id;

  -- Busca nome do cliente para a notificação
  SELECT name INTO v_client_name FROM public.clients WHERE id = v_item.client_id;

  -- 1. Cria snapshot da versão
  INSERT INTO public.content_item_versions (
    content_item_id,
    version_number,
    copy_text,
    hashtags,
    description,
    snapshot_data,
    created_by,
    created_at
  ) VALUES (
    p_item_id,
    v_version,
    v_item.copy_text,
    v_item.hashtags,
    v_item.description,
    to_jsonb(v_item),
    p_sender_id,
    now()
  );

  -- 2. Atualiza o item
  UPDATE public.content_items
  SET
    status               = 'aguardando_aprovacao',
    approval_status      = 'pendente',
    is_visible_to_client = true,
    version              = v_version,
    updated_at           = now()
  WHERE id = p_item_id;

  -- 3. Registra no histórico
  INSERT INTO public.content_approval_history (
    organization_id,
    content_item_id,
    decision,
    decided_by,
    decider_type,
    decider_name,
    notes,
    version_number,
    created_at
  ) VALUES (
    v_item.organization_id,
    p_item_id,
    'enviado_para_aprovacao',
    p_sender_id,
    'agency',
    COALESCE(v_sender_name, 'Agência'),
    format('Versão %s enviada para aprovação', v_version),
    v_version,
    now()
  );

  -- 4. Cria notificação para o cliente (tipo novo adicionado na migration 123)
  INSERT INTO public.notifications (
    organization_id,
    type,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    v_item.organization_id,
    'content_item_sent_for_approval',
    'Conteúdo aguardando aprovação',
    format('"%s" foi enviado para sua aprovação.', v_item.title),
    format('/conteudo/aprovacoes/%s', p_item_id),
    jsonb_build_object(
      'content_item_id', p_item_id,
      'client_id',       v_item.client_id,
      'version',         v_version
    )
  );

  RETURN jsonb_build_object('success', true, 'version', v_version);
END;
$$;

COMMENT ON FUNCTION public.send_content_item_for_approval IS
  'Envia um item de conteúdo para aprovação do cliente.
   Cria snapshot da versão, atualiza status, registra histórico e cria notificação.
   Só pode ser chamada para itens em: briefing, producao, revisao_interna ou reprovado.';

-- ─── 5. approve_content_item ─────────────────────────────────────────────────
-- Registra a decisão de aprovação/reprovação pelo cliente ou parceiro.
-- Chamada pela Edge Function content-approve (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.approve_content_item(
  p_item_id      UUID,
  p_decision     TEXT,   -- 'aprovado' | 'reprovado' | 'alteracao_solicitada'
  p_decider_id   UUID,
  p_decider_type TEXT,   -- 'client' | 'partner'
  p_decider_name TEXT,
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item         public.content_items%ROWTYPE;
  v_new_status   TEXT;
  v_notif_type   TEXT;
  v_notif_title  TEXT;
  v_notif_body   TEXT;
BEGIN
  -- Valida decisão
  IF p_decision NOT IN ('aprovado','reprovado','alteracao_solicitada') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decisão inválida');
  END IF;

  -- Busca o item
  SELECT * INTO v_item FROM public.content_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item não encontrado');
  END IF;

  -- Item precisa estar em aguardando_aprovacao
  IF v_item.status != 'aguardando_aprovacao' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Item com status "%s" não pode ser aprovado/reprovado', v_item.status)
    );
  END IF;

  -- Determina novo status do item
  v_new_status := CASE p_decision
    WHEN 'aprovado'              THEN 'aprovado'
    WHEN 'reprovado'             THEN 'reprovado'
    WHEN 'alteracao_solicitada'  THEN 'reprovado'
  END;

  -- Determina tipo de notificação
  v_notif_type := CASE p_decision
    WHEN 'aprovado'              THEN 'content_item_approved'
    WHEN 'reprovado'             THEN 'content_item_rejected'
    WHEN 'alteracao_solicitada'  THEN 'content_item_rejected'
  END;

  v_notif_title := CASE p_decision
    WHEN 'aprovado'              THEN 'Conteúdo aprovado!'
    WHEN 'reprovado'             THEN 'Conteúdo reprovado'
    WHEN 'alteracao_solicitada'  THEN 'Alteração solicitada'
  END;

  v_notif_body := CASE p_decision
    WHEN 'aprovado'
      THEN format('"%s" foi aprovado por %s.', v_item.title, p_decider_name)
    WHEN 'reprovado'
      THEN format('"%s" foi reprovado por %s.', v_item.title, p_decider_name)
    WHEN 'alteracao_solicitada'
      THEN format('%s solicitou alterações em "%s".', p_decider_name, v_item.title)
  END;

  -- Atualiza o item
  UPDATE public.content_items
  SET
    status          = v_new_status,
    approval_status = p_decision,
    approved_by     = CASE WHEN p_decider_type = 'client' THEN p_decider_id ELSE approved_by END,
    approved_at     = CASE WHEN p_decision = 'aprovado' THEN now() ELSE NULL END,
    approval_notes  = p_notes,
    updated_at      = now()
  WHERE id = p_item_id;

  -- Registra no histórico
  INSERT INTO public.content_approval_history (
    organization_id,
    content_item_id,
    decision,
    decided_by,
    decider_type,
    decider_name,
    notes,
    version_number,
    created_at
  ) VALUES (
    v_item.organization_id,
    p_item_id,
    p_decision,
    p_decider_id,
    p_decider_type,
    p_decider_name,
    p_notes,
    v_item.version,
    now()
  );

  -- Cria notificação para a agência
  INSERT INTO public.notifications (
    organization_id,
    type,
    title,
    body,
    action_url,
    metadata
  ) VALUES (
    v_item.organization_id,
    v_notif_type,
    v_notif_title,
    v_notif_body,
    format('/content/itens/%s', p_item_id),
    jsonb_build_object(
      'content_item_id', p_item_id,
      'client_id',       v_item.client_id,
      'decision',        p_decision,
      'decider_type',    p_decider_type
    )
  );

  RETURN jsonb_build_object('success', true, 'new_status', v_new_status);
END;
$$;

COMMENT ON FUNCTION public.approve_content_item IS
  'Registra aprovação, reprovação ou solicitação de alteração de um item.
   Chamada pela Edge Function content-approve (que valida o JWT do cliente/parceiro).
   Atualiza content_items, insere em content_approval_history e cria notificação.';

-- ─── 6. mark_content_item_published ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_content_item_published(
  p_item_id       UUID,
  p_publisher_id  UUID,   -- profiles.id
  p_url           TEXT    DEFAULT NULL,
  p_published_at  TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item       public.content_items%ROWTYPE;
  v_pub_name   TEXT;
BEGIN
  SELECT * INTO v_item FROM public.content_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item não encontrado');
  END IF;

  IF v_item.status NOT IN ('aprovado','aguardando_aprovacao') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Item com status "%s" não pode ser marcado como publicado', v_item.status)
    );
  END IF;

  SELECT full_name INTO v_pub_name FROM public.profiles WHERE id = p_publisher_id;

  UPDATE public.content_items
  SET
    status            = 'publicado',
    approval_status   = 'aprovado',
    publication_url   = COALESCE(p_url, publication_url),
    published_at      = p_published_at,
    updated_at        = now()
  WHERE id = p_item_id;

  INSERT INTO public.content_approval_history (
    organization_id,
    content_item_id,
    decision,
    decided_by,
    decider_type,
    decider_name,
    notes,
    version_number,
    created_at
  ) VALUES (
    v_item.organization_id,
    p_item_id,
    'publicado',
    p_publisher_id,
    'agency',
    COALESCE(v_pub_name, 'Agência'),
    COALESCE(p_url, 'Publicado sem URL registrada'),
    v_item.version,
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 7. get_content_dashboard_summary ────────────────────────────────────────
-- Totais por status para o dashboard de conteúdo.
-- client_id NULL → totais de todos os clientes da organização.

CREATE OR REPLACE FUNCTION public.get_content_dashboard_summary(
  p_organization_id UUID,
  p_client_id       UUID DEFAULT NULL
)
RETURNS TABLE (
  total_items              BIGINT,
  in_briefing              BIGINT,
  in_production            BIGINT,
  in_internal_review       BIGINT,
  awaiting_approval        BIGINT,
  approved                 BIGINT,
  rejected                 BIGINT,
  published                BIGINT,
  overdue_production       BIGINT,
  overdue_scheduled        BIGINT,
  published_this_month     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)                                          AS total_items,
    COUNT(*) FILTER (WHERE status = 'briefing')      AS in_briefing,
    COUNT(*) FILTER (WHERE status = 'producao')      AS in_production,
    COUNT(*) FILTER (WHERE status = 'revisao_interna') AS in_internal_review,
    COUNT(*) FILTER (WHERE status = 'aguardando_aprovacao') AS awaiting_approval,
    COUNT(*) FILTER (WHERE status = 'aprovado')      AS approved,
    COUNT(*) FILTER (WHERE status = 'reprovado')     AS rejected,
    COUNT(*) FILTER (WHERE status = 'publicado')     AS published,
    -- Atrasados: prazo de produção vencido e não publicado/arquivado
    COUNT(*) FILTER (
      WHERE production_deadline < CURRENT_DATE
        AND status NOT IN ('publicado','arquivado')
    )                                                AS overdue_production,
    -- Atrasados: data agendada vencida e não publicado/arquivado
    COUNT(*) FILTER (
      WHERE scheduled_date < CURRENT_DATE
        AND status NOT IN ('publicado','arquivado')
    )                                                AS overdue_scheduled,
    -- Publicados no mês atual
    COUNT(*) FILTER (
      WHERE status = 'publicado'
        AND date_trunc('month', published_at) = date_trunc('month', now())
    )                                                AS published_this_month
  FROM public.content_items
  WHERE organization_id = p_organization_id
    AND status         != 'arquivado'
    AND (p_client_id IS NULL OR client_id = p_client_id);
END;
$$;

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('122_content_ops_rpcs')
ON CONFLICT (version) DO NOTHING;
