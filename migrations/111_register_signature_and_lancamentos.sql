-- Migration 111: Assinatura com quatro olhos + lançamentos previsto→pendente
--
-- FLUXO COM QUATRO OLHOS:
--   Passo 1 — Qualquer usuário autenticado:
--     "Registrar Assinatura" → salva signed_date + signed_contract_number
--     Status permanece "emitido" — aguarda confirmação de segundo usuário
--
--   Passo 2 — Usuário diferente de quem emitiu, role >= manager:
--     "Confirmar Assinatura" → confirm_contract_signature → status = assinado
--     Ativa lançamentos (previsto → pendente)
--
--   ISENÇÃO: role = owner pode confirmar sua própria emissão (sem four-eyes)
--
-- MUDANÇAS:
--   1. Colunas signed_contract_number + signed_date em contracts_v2
--   2. RPC register_contract_signature — apenas salva dados, NÃO muda status
--   3. Coluna status em contract_payment_schedule (previsto/pendente/pago/cancelado)
--   4. confirm_contract_signature atualizada para ativar lançamentos

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colunas em contracts_v2
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS signed_contract_number TEXT,
  ADD COLUMN IF NOT EXISTS signed_date             DATE;

COMMENT ON COLUMN public.contracts_v2.signed_contract_number IS
  'Número do contrato físico assinado (pode diferir do contract_number interno).';
COMMENT ON COLUMN public.contracts_v2.signed_date IS
  'Data em que o contrato foi assinado pelas partes (informada por quem registra no passo 1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC register_contract_signature — Passo 1: salva dados, aguarda confirmação
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_contract_signature(
  p_contract_id            UUID,
  p_signed_date            DATE DEFAULT CURRENT_DATE,
  p_signed_contract_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  RECORD;
  v_contract RECORD;
BEGIN
  SELECT p.id, p.full_name, p.role, p.organization_id
  INTO   v_profile
  FROM   public.profiles p
  WHERE  p.id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  SELECT * INTO v_contract
  FROM   public.contracts_v2
  WHERE  id = p_contract_id
  AND    organization_id = v_profile.organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato não encontrado.');
  END IF;

  IF v_contract.status != 'emitido' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Apenas contratos emitidos podem ter assinatura registrada. Status atual: %s', v_contract.status));
  END IF;

  -- Salva dados da assinatura — status permanece "emitido"
  UPDATE public.contracts_v2 SET
    signed_date            = p_signed_date,
    signed_contract_number = COALESCE(p_signed_contract_number, contract_number),
    signed_at              = p_signed_date::TIMESTAMPTZ
  WHERE id = p_contract_id;

  INSERT INTO public.contract_audit_log (
    organization_id, contract_id, contract_number,
    user_id, user_name, user_role, action, action_label, metadata
  ) VALUES (
    v_profile.organization_id, p_contract_id,
    COALESCE(p_signed_contract_number, v_contract.contract_number),
    v_profile.id, v_profile.full_name, v_profile.role,
    'assinatura_registrada_pendente',
    format('Assinatura registrada por %s em %s — aguarda confirmação (quatro olhos)',
           v_profile.full_name, p_signed_date),
    jsonb_build_object(
      'signed_date',            p_signed_date,
      'signed_contract_number', COALESCE(p_signed_contract_number, v_contract.contract_number),
      'registered_by',          v_profile.id,
      'awaiting_confirmation',  true
    )
  );

  RETURN jsonb_build_object(
    'success',               true,
    'awaiting_confirmation', true,
    'message',               'Dados registrados. Solicite a confirmação de um segundo usuário (manager, admin ou owner) para concluir a assinatura.',
    'signed_date',           p_signed_date,
    'signed_contract_number', COALESCE(p_signed_contract_number, v_contract.contract_number)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_contract_signature(UUID, DATE, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Coluna status em contract_payment_schedule
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contract_payment_schedule
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'previsto'
  CHECK (status IN ('previsto', 'pendente', 'pago', 'cancelado'));

COMMENT ON COLUMN public.contract_payment_schedule.status IS
  'previsto  = contrato não assinado ou aguardando confirmação de assinatura
   pendente  = assinatura confirmada (quatro olhos), aguarda pagamento
   pago      = pagamento confirmado
   cancelado = cancelado';

-- Lançamentos de contratos já assinados ficam como pendente
UPDATE public.contract_payment_schedule cps
SET status = 'pendente'
FROM public.contracts_v2 c
WHERE cps.contract_id = c.id
  AND c.status = 'assinado'
  AND (cps.status = 'previsto' OR cps.status IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. confirm_contract_signature — Passo 2: quatro olhos + ativa lançamentos
--    Substitui a versão da migration 092 adicionando:
--      - Isenção explícita de quatro olhos para owner
--      - UPDATE em contract_payment_schedule após confirmação
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_contract_signature(
  p_contract_id UUID,
  p_signed_at   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   RECORD;
  v_contract  RECORD;
  v_signed_ts TIMESTAMPTZ;
  v_err       TEXT;
BEGIN
  SELECT p.id, p.full_name, p.role, p.organization_id
  INTO   v_profile
  FROM   public.profiles p
  WHERE  p.id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  SELECT * INTO v_contract
  FROM   public.contracts_v2
  WHERE  id = p_contract_id
  AND    organization_id = v_profile.organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato não encontrado.');
  END IF;

  IF v_contract.status != 'emitido' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Contrato deve estar "emitido" para confirmar assinatura. Status atual: %s', v_contract.status));
  END IF;

  -- Role mínimo: manager
  IF v_profile.role NOT IN ('manager', 'admin', 'owner') THEN
    v_err := 'Somente gestores, administradores e proprietários podem confirmar assinaturas de contratos.';
    INSERT INTO public.contract_audit_log (
      organization_id, contract_id, contract_number,
      user_id, user_name, user_role, action, action_label, metadata
    ) VALUES (
      v_profile.organization_id, p_contract_id, v_contract.contract_number,
      v_profile.id, v_profile.full_name, v_profile.role,
      'tentativa_confirmacao_negada', 'Negado — role insuficiente',
      jsonb_build_object('motivo', v_err)
    );
    RETURN jsonb_build_object('success', false, 'error', v_err);
  END IF;

  -- Quatro olhos: quem emitiu ≠ quem confirma.
  -- ISENÇÃO: role = owner pode confirmar sua própria emissão.
  IF v_contract.emitted_by IS NOT NULL
     AND v_contract.emitted_by = v_profile.id
     AND v_profile.role != 'owner' THEN
    v_err := 'Quatro olhos: o usuário que emitiu o contrato não pode confirmar a assinatura. '
             'Solicite a confirmação a outro gestor, administrador ou proprietário. '
             'Apenas o proprietário (owner) está isento desta regra.';
    INSERT INTO public.contract_audit_log (
      organization_id, contract_id, contract_number,
      user_id, user_name, user_role, action, action_label, metadata
    ) VALUES (
      v_profile.organization_id, p_contract_id, v_contract.contract_number,
      v_profile.id, v_profile.full_name, v_profile.role,
      'tentativa_confirmacao_negada', 'Negado — regra dos quatro olhos',
      jsonb_build_object('motivo', v_err, 'emitted_by', v_contract.emitted_by)
    );
    RETURN jsonb_build_object('success', false, 'error', v_err);
  END IF;

  -- Usa signed_date já registrado, ou p_signed_at, ou agora
  v_signed_ts := COALESCE(
    p_signed_at::TIMESTAMPTZ,
    v_contract.signed_date::TIMESTAMPTZ,
    v_contract.signed_at,
    now()
  );

  -- Confirma → assinado
  UPDATE public.contracts_v2 SET
    status              = 'assinado',
    signed_at           = v_signed_ts,
    signed_confirmed_by = v_profile.id,
    signed_confirmed_at = now()
  WHERE id = p_contract_id;

  -- Ativa lançamentos: previsto → pendente
  UPDATE public.contract_payment_schedule
  SET    status = 'pendente'
  WHERE  contract_id = p_contract_id
  AND    (status = 'previsto' OR status IS NULL);

  INSERT INTO public.contract_audit_log (
    organization_id, contract_id, contract_number,
    user_id, user_name, user_role, action, action_label, metadata
  ) VALUES (
    v_profile.organization_id, p_contract_id,
    COALESCE(v_contract.signed_contract_number, v_contract.contract_number),
    v_profile.id, v_profile.full_name, v_profile.role,
    'assinatura_confirmada',
    format('Assinatura confirmada por %s — lançamentos ativados', v_profile.full_name),
    jsonb_build_object(
      'signed_at',       v_signed_ts,
      'emitted_by',      v_contract.emitted_by,
      'confirmed_by',    v_profile.id,
      'four_eyes_check', (v_contract.emitted_by IS NOT NULL AND v_contract.emitted_by != v_profile.id),
      'owner_bypass',    (v_profile.role = 'owner' AND v_contract.emitted_by = v_profile.id)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Assinatura confirmada. Lançamentos ativados.',
    'signed_at', v_signed_ts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_contract_signature(UUID, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Versão
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('111_register_signature_v1')
ON CONFLICT (version) DO NOTHING;
