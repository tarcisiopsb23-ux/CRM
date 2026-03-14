-- Migração para criar função RPC de solicitação de horas extras com validação de segurança
-- Esta função substitui o upsert direto no frontend para garantir que:
-- 1. O usuário só solicite horas para si mesmo (via auth.uid())
-- 2. O status inicial seja sempre 'pendente'
-- 3. A organização do usuário seja validada

CREATE OR REPLACE FUNCTION public.rep_p_request_overtime(
  p_work_date DATE,
  p_minutes INTEGER,
  p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_result JSONB;
BEGIN
  -- 1. Obter o ID do usuário autenticado do Supabase
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- 2. Obter a organização do perfil do usuário
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem organização vinculada';
  END IF;

  -- 3. Realizar o upsert na tabela de autorizações
  -- O uso de SECURITY DEFINER garante que a função tenha permissão para escrever na tabela
  INSERT INTO public.rep_p_overtime_authorizations (
    organization_id,
    user_id,
    work_date,
    minutes_requested,
    justification,
    status,
    updated_at
  )
  VALUES (
    v_org_id,
    v_user_id,
    p_work_date,
    p_minutes,
    p_justification,
    'pendente',
    NOW()
  )
  ON CONFLICT (user_id, work_date)
  DO UPDATE SET
    minutes_requested = EXCLUDED.minutes_requested,
    justification = EXCLUDED.justification,
    status = 'pendente', -- Reseta para pendente se for atualizado
    updated_at = NOW()
  RETURNING to_jsonb(rep_p_overtime_authorizations.*) INTO v_result;

  RETURN v_result;
END;
$$;

-- Garantir permissões de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.rep_p_request_overtime(DATE, INTEGER, TEXT) TO authenticated;
