-- Migration 147: Completa o suporte a merge de contatos
-- Adiciona merged_into_id em client_channel_contacts,
-- move histórico de conversas no merge,
-- e corrige merge_omni_contacts para mover conversas também.

-- ── 1. Adicionar campos de merge em client_channel_contacts ───────────────────

ALTER TABLE public.client_channel_contacts
  ADD COLUMN IF NOT EXISTS merged_into_id UUID
    REFERENCES public.client_channel_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ccc_merged
  ON public.client_channel_contacts(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

-- ── 2. RPC merge_client_contacts ─────────────────────────────────────────────
-- Merge manual de contatos de clientes C8 Control.
-- Move identidades de canal, conversas e histórico do perdedor para o vencedor.
-- NUNCA automático — sempre disparado pelo usuário.

CREATE OR REPLACE FUNCTION public.merge_client_contacts(
  p_winner_id   UUID,
  p_loser_id    UUID,
  p_merged_by   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_identities_moved INTEGER := 0;
  v_conversations_moved INTEGER := 0;
BEGIN
  -- Validação: não pode mergear com si mesmo
  IF p_winner_id = p_loser_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_merge_with_self');
  END IF;

  -- Validação: perdedor não pode já ter sido mergeado em outro
  IF EXISTS (
    SELECT 1 FROM public.client_channel_contacts
    WHERE id = p_loser_id AND merged_into_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'loser_already_merged');
  END IF;

  -- 1. Mover identidades de canal do perdedor para o vencedor
  UPDATE public.client_contact_identities
  SET contact_id = p_winner_id
  WHERE contact_id = p_loser_id;

  GET DIAGNOSTICS v_identities_moved = ROW_COUNT;

  -- 2. Mover conversas do perdedor para o vencedor
  UPDATE public.client_channel_conversations
  SET contact_id = p_winner_id, updated_at = now()
  WHERE contact_id = p_loser_id;

  GET DIAGNOSTICS v_conversations_moved = ROW_COUNT;

  -- 3. Mover mensagens órfãs (se existir contact_id em client_channel_messages)
  -- (a tabela client_channel_messages não tem contact_id direto — linked via conversation)

  -- 4. Marcar perdedor como merged
  UPDATE public.client_channel_contacts
  SET
    merged_into_id = p_winner_id,
    merged_at      = now(),
    updated_at     = now()
  WHERE id = p_loser_id;

  RETURN jsonb_build_object(
    'success',             true,
    'winner_id',           p_winner_id,
    'loser_id',            p_loser_id,
    'identities_moved',    v_identities_moved,
    'conversations_moved', v_conversations_moved,
    'merged_by',           p_merged_by,
    'merged_at',           now()
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.merge_client_contacts(UUID, UUID, UUID)
  TO authenticated, anon, service_role;

-- ── 3. Corrigir merge_omni_contacts para mover conversas ─────────────────────
-- A versão anterior (migration 141) só movia identidades.
-- Agora também move conversas e mensagens.

CREATE OR REPLACE FUNCTION public.merge_omni_contacts(
  p_winner_id   UUID,
  p_loser_id    UUID,
  p_merged_by   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_identities_moved    INTEGER := 0;
  v_conversations_moved INTEGER := 0;
BEGIN
  -- Validação: não pode mergear com si mesmo
  IF p_winner_id = p_loser_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_merge_with_self');
  END IF;

  -- Validação: perdedor não pode já ter sido mergeado
  IF EXISTS (
    SELECT 1 FROM public.omni_contacts
    WHERE id = p_loser_id AND merged_into_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'loser_already_merged');
  END IF;

  -- 1. Mover identidades de canal do perdedor para o vencedor
  UPDATE public.omni_contact_identities
  SET contact_id = p_winner_id
  WHERE contact_id = p_loser_id;

  GET DIAGNOSTICS v_identities_moved = ROW_COUNT;

  -- 2. Mover conversas via omni_contact_id (campo novo, migration 143)
  UPDATE public.omni_conversations
  SET omni_contact_id = p_winner_id, updated_at = now()
  WHERE omni_contact_id = p_loser_id;

  GET DIAGNOSTICS v_conversations_moved = ROW_COUNT;

  -- 3. Mover conversas via contact_id legado (whatsapp_contacts.id)
  -- omni_contacts.id = whatsapp_contacts.id (migrados com mesmo UUID na migration 142)
  UPDATE public.omni_conversations
  SET contact_id = p_winner_id, updated_at = now()
  WHERE contact_id = p_loser_id;

  -- 4. Marcar perdedor como merged
  UPDATE public.omni_contacts
  SET
    merged_into_id = p_winner_id,
    merged_at      = now(),
    updated_at     = now()
  WHERE id = p_loser_id;

  RETURN jsonb_build_object(
    'success',             true,
    'winner_id',           p_winner_id,
    'loser_id',            p_loser_id,
    'identities_moved',    v_identities_moved,
    'conversations_moved', v_conversations_moved,
    'merged_by',           p_merged_by,
    'merged_at',           now()
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.merge_omni_contacts(UUID, UUID, UUID)
  TO authenticated, anon, service_role;

-- ── 4. RPC para buscar histórico unificado de um contato ─────────────────────
-- Retorna todas as conversas de um contato (mesmo após merge)
-- seguindo a cadeia merged_into_id para incluir contatos mergeados.

-- Para clientes C8 Control
CREATE OR REPLACE FUNCTION public.get_client_contact_history(
  p_contact_id UUID,
  p_limit      INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact_ids UUID[];
  v_conversations JSONB;
BEGIN
  -- Coleta o contato atual + todos que foram mergeados nele
  SELECT ARRAY_AGG(id) INTO v_contact_ids
  FROM public.client_channel_contacts
  WHERE id = p_contact_id
     OR merged_into_id = p_contact_id;

  -- Busca conversas de todos esses contact_ids
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',              c.id,
      'channel_type',    c.channel_type,
      'status',          c.status,
      'bot_active',      c.bot_active,
      'last_message_at', c.last_message_at,
      'created_at',      c.created_at,
      'resolved_at',     c.resolved_at,
      'assigned_agent_id', c.assigned_agent_id
    )
    ORDER BY c.last_message_at DESC NULLS LAST
  )
  INTO v_conversations
  FROM public.client_channel_conversations c
  WHERE c.contact_id = ANY(v_contact_ids)
  LIMIT p_limit;

  RETURN jsonb_build_object(
    'contact_id',    p_contact_id,
    'contact_ids',   v_contact_ids,
    'conversations', COALESCE(v_conversations, '[]')
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_client_contact_history(UUID, INTEGER)
  TO authenticated, anon, service_role;

-- Para agência
CREATE OR REPLACE FUNCTION public.get_omni_contact_history(
  p_contact_id UUID,
  p_limit      INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contact_ids UUID[];
  v_conversations JSONB;
BEGIN
  -- Coleta o contato atual + todos que foram mergeados nele
  SELECT ARRAY_AGG(id) INTO v_contact_ids
  FROM public.omni_contacts
  WHERE id = p_contact_id
     OR merged_into_id = p_contact_id;

  -- Busca conversas via omni_contact_id (novo) ou contact_id (legado)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',              c.id,
      'channel_type',    c.channel_type,
      'omni_status',     c.omni_status,
      'last_message_at', c.last_message_at,
      'created_at',      c.created_at,
      'resolved_at',     c.resolved_at,
      'assigned_agent_id', c.assigned_agent_id
    )
    ORDER BY c.last_message_at DESC NULLS LAST
  )
  INTO v_conversations
  FROM public.omni_conversations c
  WHERE c.omni_contact_id = ANY(v_contact_ids)
     OR c.contact_id      = ANY(v_contact_ids)
  LIMIT p_limit;

  RETURN jsonb_build_object(
    'contact_id',    p_contact_id,
    'contact_ids',   v_contact_ids,
    'conversations', COALESCE(v_conversations, '[]')
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_omni_contact_history(UUID, INTEGER)
  TO authenticated, anon, service_role;

-- ── Versão ────────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('147_contact_merge_complete')
ON CONFLICT (version) DO NOTHING;
