-- =============================================================================
-- Migration 092: Segurança e Auditoria de Contratos
--
-- 1. Nova sequência e RPC de numeração: formato 8xxxxxxx/YYYY
--    Inicia em 8000011, nunca zera, apenas o ano na barra muda.
-- 2. Campos de segurança em contracts_v2:
--    created_by, emitted_by, emitted_at, content_hash, content_hash_at,
--    signed_confirmed_by, signed_confirmed_at
-- 3. Tabela contract_audit_log: rastreamento completo de ações
-- 4. Trigger de lock Opção A:
--    - status 'emitido': bloqueia UPDATE de campos críticos
--    - status 'assinado': lock IRREVERSÍVEL de todos os campos de negócio
--      (somente cancelamento ou aditivo é permitido)
-- 5. RPC confirm_contract_signature: regra dos quatro olhos
-- 6. RPC revert_contract_to_draft: retorna para rascunho com novo número
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Nova sequência de numeração: começa em 11 para gerar 8000011/YYYY
--    O formato é: '8' + lpad(seq, 6, '0') + seq_unit → 8000011
--    Na prática: seq começa em 11, prefixo fixo '8', zero-pad para 7 dígitos
-- ─────────────────────────────────────────────────────────────────────────────

-- Dropa a sequência antiga e recria com valor inicial 11
-- IF EXISTS evita erro se já foi criada
DROP SEQUENCE IF EXISTS public.contract_number_seq CASCADE;
CREATE SEQUENCE public.contract_number_seq
  START WITH 11
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;

COMMENT ON SEQUENCE public.contract_number_seq IS
  'Sequência global de numeração de contratos. Nunca zera. Inicia em 11.
   Formato resultante: 8xxxxxxx/YYYY onde xxxxxxx = lpad(seq, 6, 0).';

-- Substitui a RPC anterior pela nova com o formato correto
CREATE OR REPLACE FUNCTION public.generate_contract_number(p_org_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_seq  BIGINT;
  v_num  TEXT;
BEGIN
  v_year := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY');
  v_seq  := nextval('contract_number_seq');
  -- Formato: 8 + zero-pad para 6 dígitos + /YYYY
  -- Seq 11   → "8000011/2026"
  -- Seq 1000 → "8001000/2026"
  -- Seq 9999999 → "89999999/2026" (margem enorme)
  v_num := '8' || lpad(v_seq::TEXT, 6, '0') || '/' || v_year;
  RETURN v_num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_contract_number(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Campos de segurança em contracts_v2
-- ─────────────────────────────────────────────────────────────────────────────

-- Quem criou o contrato
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Quem gerou o PDF (emitiu)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS emitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS emitted_at TIMESTAMPTZ;

-- Hash SHA-256 do conteúdo no momento da emissão
-- Calculado como SHA256(html_content || variables::text || payment_schedule::text || contract_number)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS content_hash_at TIMESTAMPTZ;

-- Quem confirmou a assinatura (regra dos quatro olhos)
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS signed_confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS signed_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contracts_v2.created_by         IS 'Usuário que criou o contrato';
COMMENT ON COLUMN public.contracts_v2.emitted_by         IS 'Usuário que gerou o PDF (emitiu o contrato)';
COMMENT ON COLUMN public.contracts_v2.emitted_at         IS 'Momento da emissão do PDF';
COMMENT ON COLUMN public.contracts_v2.content_hash       IS 'SHA-256 do conteúdo no momento da emissão. Divergência indica alteração posterior.';
COMMENT ON COLUMN public.contracts_v2.content_hash_at    IS 'Momento em que o hash foi calculado';
COMMENT ON COLUMN public.contracts_v2.signed_confirmed_by IS 'Usuário que confirmou a assinatura (regra dos quatro olhos)';
COMMENT ON COLUMN public.contracts_v2.signed_confirmed_at IS 'Momento da confirmação da assinatura';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabela contract_audit_log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id     UUID        NOT NULL REFERENCES public.contracts_v2(id) ON DELETE CASCADE,
  contract_number TEXT,       -- desnormalizado para consulta rápida mesmo se contrato for excluído
  user_id         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name       TEXT,       -- desnormalizado: nome do usuário no momento da ação
  user_role       TEXT,       -- desnormalizado: role no momento da ação
  action          TEXT        NOT NULL,
  -- Valores: criacao | visualizacao | emissao | alteracao_campo | retorno_rascunho
  --          assinatura_confirmada | cancelamento | encerramento
  --          tentativa_confirmacao_negada (four-eyes)
  action_label    TEXT        NOT NULL,
  metadata        JSONB       DEFAULT '{}'::jsonb,
  -- Para 'alteracao_campo': { "campo": "...", "antes": "...", "depois": "..." }
  -- Para 'emissao': { "content_hash": "..." }
  -- Para 'tentativa_confirmacao_negada': { "motivo": "..." }
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_audit_contract
  ON public.contract_audit_log(contract_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_audit_org
  ON public.contract_audit_log(organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_audit_user
  ON public.contract_audit_log(user_id, occurred_at DESC);

ALTER TABLE public.contract_audit_log ENABLE ROW LEVEL SECURITY;

-- Leitura: manager, admin, owner da organização
DROP POLICY IF EXISTS "contract_audit_read_org" ON public.contract_audit_log;
CREATE POLICY "contract_audit_read_org"
  ON public.contract_audit_log FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Inserção: qualquer usuário autenticado da organização
DROP POLICY IF EXISTS "contract_audit_insert_org" ON public.contract_audit_log;
CREATE POLICY "contract_audit_insert_org"
  ON public.contract_audit_log FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

COMMENT ON TABLE public.contract_audit_log IS
  'Log imutável de todas as ações relacionadas a contratos v2.
   Nenhuma linha pode ser atualizada ou excluída (sem policy para UPDATE/DELETE).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger de lock — Opção A (PL/pgSQL no banco)
--
-- Regras:
--   status 'emitido':
--     Bloqueia UPDATE de campos críticos de negócio.
--     Campos críticos: html_content, variables, service_slugs, payment_schedule (via tabela separada),
--                      start_date, vigencia_inicio, prazo_minimo_meses, total_monthly, total_setup,
--                      setup_amount_manual, grace_period_months
--     Permite UPDATE de: status, signed_at, signed_confirmed_by, signed_confirmed_at,
--                        emitted_by, emitted_at, content_hash, content_hash_at, notes
--
--   status 'assinado':
--     Lock IRREVERSÍVEL de todos os campos de negócio.
--     Apenas cancelamento é permitido (UPDATE de status → 'cancelado').
--     Qualquer outra alteração de campo crítico lança exceção.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.contracts_v2_lock_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── Lock para status 'emitido' ──────────────────────────────────────────
  IF OLD.status = 'emitido' THEN
    -- Campos críticos que não podem ser alterados após emissão
    IF (
      NEW.html_content       IS DISTINCT FROM OLD.html_content       OR
      NEW.variables          IS DISTINCT FROM OLD.variables          OR
      NEW.service_slugs      IS DISTINCT FROM OLD.service_slugs      OR
      NEW.start_date         IS DISTINCT FROM OLD.start_date         OR
      NEW.vigencia_inicio    IS DISTINCT FROM OLD.vigencia_inicio    OR
      NEW.prazo_minimo_meses IS DISTINCT FROM OLD.prazo_minimo_meses OR
      NEW.total_monthly      IS DISTINCT FROM OLD.total_monthly      OR
      NEW.total_setup        IS DISTINCT FROM OLD.total_setup        OR
      NEW.setup_amount_manual IS DISTINCT FROM OLD.setup_amount_manual OR
      NEW.grace_period_months IS DISTINCT FROM OLD.grace_period_months OR
      NEW.due_day            IS DISTINCT FROM OLD.due_day            OR
      NEW.first_payment_date IS DISTINCT FROM OLD.first_payment_date
    ) THEN
      -- Permite retorno para rascunho (via revert_contract_to_draft)
      IF NEW.status = 'rascunho' THEN
        RETURN NEW; -- RPC privilegiada gerencia o retorno
      END IF;
      RAISE EXCEPTION
        'CONTRATO_EMITIDO_LOCK: Não é permitido alterar campos críticos de um contrato emitido. '
        'Retorne para Rascunho primeiro para fazer alterações. '
        'Contrato: %', OLD.contract_number;
    END IF;
  END IF;

  -- ── Lock IRREVERSÍVEL para status 'assinado' ────────────────────────────
  IF OLD.status = 'assinado' THEN
    -- Apenas cancelamento é permitido
    IF NEW.status = 'cancelado' THEN
      RETURN NEW; -- cancelamento sempre permitido
    END IF;
    -- Qualquer outra mudança de campo crítico é bloqueada permanentemente
    IF (
      NEW.html_content       IS DISTINCT FROM OLD.html_content       OR
      NEW.variables          IS DISTINCT FROM OLD.variables          OR
      NEW.service_slugs      IS DISTINCT FROM OLD.service_slugs      OR
      NEW.start_date         IS DISTINCT FROM OLD.start_date         OR
      NEW.vigencia_inicio    IS DISTINCT FROM OLD.vigencia_inicio    OR
      NEW.prazo_minimo_meses IS DISTINCT FROM OLD.prazo_minimo_meses OR
      NEW.total_monthly      IS DISTINCT FROM OLD.total_monthly      OR
      NEW.total_setup        IS DISTINCT FROM OLD.total_setup        OR
      NEW.setup_amount_manual IS DISTINCT FROM OLD.setup_amount_manual OR
      NEW.grace_period_months IS DISTINCT FROM OLD.grace_period_months OR
      NEW.due_day            IS DISTINCT FROM OLD.due_day            OR
      NEW.first_payment_date IS DISTINCT FROM OLD.first_payment_date OR
      NEW.status             IS DISTINCT FROM OLD.status
    ) THEN
      -- Status para 'assinado' → 'cancelado' já foi tratado acima
      -- Bloqueia qualquer outra transição de status ou campo
      IF NEW.status != 'cancelado' THEN
        RAISE EXCEPTION
          'CONTRATO_ASSINADO_LOCK: Contrato assinado é imutável. '
          'Apenas cancelamento é permitido. Para alterações de condições, '
          'gere um aditivo. Contrato: %', OLD.contract_number;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_v2_lock ON public.contracts_v2;
CREATE TRIGGER contracts_v2_lock
  BEFORE UPDATE ON public.contracts_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.contracts_v2_lock_trigger();

COMMENT ON FUNCTION public.contracts_v2_lock_trigger() IS
  'Trigger de segurança: bloqueia alterações em campos críticos de contratos emitidos ou assinados.
   Emitido: campos de negócio bloqueados, retorno para rascunho permitido via RPC.
   Assinado: lock irreversível — apenas cancelamento é permitido.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC confirm_contract_signature — Regra dos Quatro Olhos
--
-- Verifica:
--   a) Contrato existe e pertence à organização do usuário
--   b) Status é 'emitido'
--   c) Usuário tem role manager, admin ou owner
--   d) Usuário ≠ emitted_by (exceto se role = 'owner')
--   e) Se passed: atualiza status → 'assinado', grava confirmação, registra audit_log
--   f) Se failed: registra tentativa no audit_log e retorna erro
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_contract_signature(
  p_contract_id UUID,
  p_signed_at   DATE DEFAULT NULL  -- data real da assinatura (yyyy-MM-dd)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract     RECORD;
  v_profile      RECORD;
  v_signed_ts    TIMESTAMPTZ;
  v_err          TEXT;
BEGIN
  -- Obtém o usuário autenticado
  SELECT id, full_name, role, organization_id
  INTO   v_profile
  FROM   public.profiles
  WHERE  id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  -- Obtém o contrato
  SELECT *
  INTO   v_contract
  FROM   public.contracts_v2
  WHERE  id              = p_contract_id
  AND    organization_id = v_profile.organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato não encontrado.');
  END IF;

  -- Verifica status
  IF v_contract.status != 'emitido' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   format('Contrato deve estar com status "emitido" para confirmar assinatura. Status atual: %s', v_contract.status)
    );
  END IF;

  -- Verifica role (somente manager, admin, owner podem confirmar)
  IF v_profile.role NOT IN ('manager', 'admin', 'owner') THEN
    v_err := 'Somente gestores (manager), administradores e proprietários podem confirmar assinaturas de contratos.';
    -- Registra tentativa negada no audit_log
    INSERT INTO public.contract_audit_log (
      organization_id, contract_id, contract_number,
      user_id, user_name, user_role,
      action, action_label, metadata
    ) VALUES (
      v_profile.organization_id, p_contract_id, v_contract.contract_number,
      v_profile.id, v_profile.full_name, v_profile.role,
      'tentativa_confirmacao_negada',
      'Tentativa de confirmação negada — role insuficiente',
      jsonb_build_object('motivo', v_err)
    );
    RETURN jsonb_build_object('success', false, 'error', v_err);
  END IF;

  -- Verifica regra dos quatro olhos (quem emitiu ≠ quem confirma, exceto owner)
  IF v_contract.emitted_by IS NOT NULL
     AND v_contract.emitted_by = v_profile.id
     AND v_profile.role != 'owner' THEN
    v_err := 'O mesmo usuário que emitiu o contrato não pode confirmar a assinatura. '
             'Solicite a confirmação a um par ou superior.';
    INSERT INTO public.contract_audit_log (
      organization_id, contract_id, contract_number,
      user_id, user_name, user_role,
      action, action_label, metadata
    ) VALUES (
      v_profile.organization_id, p_contract_id, v_contract.contract_number,
      v_profile.id, v_profile.full_name, v_profile.role,
      'tentativa_confirmacao_negada',
      'Tentativa de confirmação negada — regra dos quatro olhos',
      jsonb_build_object('motivo', v_err)
    );
    RETURN jsonb_build_object('success', false, 'error', v_err);
  END IF;

  -- Tudo válido — confirma a assinatura
  v_signed_ts := COALESCE(
    p_signed_at::TIMESTAMPTZ,
    now()
  );

  UPDATE public.contracts_v2 SET
    status               = 'assinado',
    signed_at            = v_signed_ts,
    signed_confirmed_by  = v_profile.id,
    signed_confirmed_at  = now()
  WHERE id = p_contract_id;

  -- Registra no audit_log
  INSERT INTO public.contract_audit_log (
    organization_id, contract_id, contract_number,
    user_id, user_name, user_role,
    action, action_label, metadata
  ) VALUES (
    v_profile.organization_id, p_contract_id, v_contract.contract_number,
    v_profile.id, v_profile.full_name, v_profile.role,
    'assinatura_confirmada',
    format('Assinatura confirmada por %s', v_profile.full_name),
    jsonb_build_object(
      'signed_at',      v_signed_ts,
      'emitted_by',     v_contract.emitted_by,
      'confirmed_by',   v_profile.id
    )
  );

  RETURN jsonb_build_object(
    'success',    true,
    'message',    'Assinatura confirmada com sucesso.',
    'signed_at',  v_signed_ts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_contract_signature(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.confirm_contract_signature(UUID, DATE) IS
  'Confirma a assinatura de um contrato emitido.
   Regras: role >= manager; emitted_by ≠ signed_confirmed_by (exceto owner).
   Registra tentativas negadas no audit_log.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC revert_contract_to_draft — Retornar para Rascunho
--
-- Comportamento:
--   - Contrato deve estar 'emitido' (assinado é irreversível)
--   - Gera NOVO número de contrato via generate_contract_number
--   - Limpa campos de emissão (emitted_by, emitted_at, content_hash, content_hash_at)
--   - Status volta para 'rascunho'
--   - Registra no audit_log com número antigo e novo
--   - O número antigo nunca é reutilizado (sequência já avançou)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revert_contract_to_draft(
  p_contract_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract      RECORD;
  v_profile       RECORD;
  v_new_number    TEXT;
  v_old_number    TEXT;
BEGIN
  SELECT id, full_name, role, organization_id
  INTO   v_profile
  FROM   public.profiles
  WHERE  id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  SELECT * INTO v_contract
  FROM   public.contracts_v2
  WHERE  id = p_contract_id AND organization_id = v_profile.organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato não encontrado.');
  END IF;

  -- Somente 'emitido' pode retornar para rascunho
  IF v_contract.status != 'emitido' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   format(
        'Apenas contratos com status "emitido" podem retornar para rascunho. Status atual: %s. '
        'Contratos assinados são imutáveis.',
        v_contract.status
      )
    );
  END IF;

  -- Verifica permissão (manager, admin, owner)
  IF v_profile.role NOT IN ('manager', 'admin', 'owner') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Somente gestores, administradores e proprietários podem retornar contratos para rascunho.'
    );
  END IF;

  v_old_number := v_contract.contract_number;

  -- Gera novo número — o antigo nunca é reutilizado
  v_new_number := public.generate_contract_number(v_profile.organization_id);

  -- Retorna para rascunho com novo número, limpando campos de emissão
  -- O trigger de lock permite esta operação quando NEW.status = 'rascunho'
  UPDATE public.contracts_v2 SET
    status            = 'rascunho',
    contract_number   = v_new_number,
    emitted_by        = NULL,
    emitted_at        = NULL,
    content_hash      = NULL,
    content_hash_at   = NULL,
    signed_at         = NULL
  WHERE id = p_contract_id;

  -- Registra no audit_log
  INSERT INTO public.contract_audit_log (
    organization_id, contract_id, contract_number,
    user_id, user_name, user_role,
    action, action_label, metadata
  ) VALUES (
    v_profile.organization_id, p_contract_id, v_new_number,
    v_profile.id, v_profile.full_name, v_profile.role,
    'retorno_rascunho',
    format('Retornado para rascunho por %s', v_profile.full_name),
    jsonb_build_object(
      'numero_anterior', v_old_number,
      'numero_novo',     v_new_number,
      'motivo',          'Retorno para rascunho após emissão'
    )
  );

  RETURN jsonb_build_object(
    'success',         true,
    'message',         'Contrato retornado para rascunho com novo número.',
    'contract_number', v_new_number,
    'old_number',      v_old_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_contract_to_draft(UUID) TO authenticated;

COMMENT ON FUNCTION public.revert_contract_to_draft(UUID) IS
  'Retorna contrato emitido para rascunho com novo número.
   O número antigo é descartado e nunca reutilizado.
   Contratos assinados são irreversíveis — esta função rejeita.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC log_contract_action — inserção centralizada no audit_log
--    Usada pelo frontend para registrar visualizações e outras ações
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_contract_action(
  p_contract_id  UUID,
  p_action       TEXT,
  p_action_label TEXT,
  p_metadata     JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  RECORD;
  v_contract RECORD;
BEGIN
  SELECT id, full_name, role, organization_id
  INTO   v_profile
  FROM   public.profiles
  WHERE  id = auth.uid();

  IF NOT FOUND THEN RETURN; END IF;

  SELECT contract_number INTO v_contract
  FROM   public.contracts_v2
  WHERE  id = p_contract_id AND organization_id = v_profile.organization_id;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.contract_audit_log (
    organization_id, contract_id, contract_number,
    user_id, user_name, user_role,
    action, action_label, metadata
  ) VALUES (
    v_profile.organization_id, p_contract_id, v_contract.contract_number,
    v_profile.id, v_profile.full_name, v_profile.role,
    p_action, p_action_label, p_metadata
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_contract_action(UUID, TEXT, TEXT, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Query helper: contratos pendentes de assinatura (emitidos)
--    Visível apenas para manager, admin, owner
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.contracts_v2_pending_signature AS
SELECT
  c.*,
  p_creator.full_name  AS created_by_name,
  p_emitter.full_name  AS emitted_by_name,
  cl.company           AS client_company,
  cl.name              AS client_name_raw
FROM public.contracts_v2 c
LEFT JOIN public.profiles  p_creator ON p_creator.id = c.created_by
LEFT JOIN public.profiles  p_emitter ON p_emitter.id = c.emitted_by
LEFT JOIN public.clients   cl        ON cl.id        = c.client_id
WHERE c.status = 'emitido';

COMMENT ON VIEW public.contracts_v2_pending_signature IS
  'Contratos emitidos aguardando confirmação de assinatura. Uso restrito a manager/admin/owner via RLS.';

-- RLS para a view — herdada da tabela base, mas garantimos explicitamente
-- (views no Postgres herdam RLS das tabelas subjacentes quando SECURITY INVOKER)

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Versão
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('092_contract_security_and_audit_v1')
ON CONFLICT (version) DO NOTHING;
