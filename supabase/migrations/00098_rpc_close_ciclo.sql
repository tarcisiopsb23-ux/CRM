-- Migration 00098: RPC close_ciclo
-- Requirements: 1.3, 1.4, 3.6, 5.2, 6.2, 10.1

CREATE OR REPLACE FUNCTION close_ciclo(p_ciclo_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ciclo ciclos_avaliacao%ROWTYPE;
  v_caller_org UUID;
  v_caller_role TEXT;
BEGIN
  -- Verificar permissão do chamador
  SELECT organization_id, role INTO v_caller_org, v_caller_role
  FROM profiles WHERE id = auth.uid();

  SELECT * INTO v_ciclo FROM ciclos_avaliacao WHERE id = p_ciclo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Ciclo não encontrado');
  END IF;

  IF v_ciclo.organization_id != v_caller_org THEN
    RETURN jsonb_build_object('error', 'Acesso negado');
  END IF;

  IF v_caller_role NOT IN ('admin','owner') THEN
    RETURN jsonb_build_object('error', 'Apenas admin ou owner podem encerrar ciclos');
  END IF;

  IF v_ciclo.status = 'encerrado' THEN
    RETURN jsonb_build_object('error', 'Ciclo já está encerrado');
  END IF;

  -- Atualizar status para encerrado
  UPDATE ciclos_avaliacao
  SET status = 'encerrado', updated_at = now()
  WHERE id = p_ciclo_id;

  -- Registrar log de auditoria
  INSERT INTO audit_log_360 (organization_id, user_id, action, entity_type, entity_id, previous_data, new_data)
  VALUES (
    v_ciclo.organization_id,
    auth.uid(),
    'close_ciclo',
    'ciclo_avaliacao',
    p_ciclo_id,
    jsonb_build_object('status', 'ativo'),
    jsonb_build_object('status', 'encerrado', 'closed_at', now())
  );

  -- Retornar sucesso — a Edge Function consolidate-360 deve ser invocada pelo frontend
  RETURN jsonb_build_object('success', true, 'ciclo_id', p_ciclo_id);
END;
$$;
