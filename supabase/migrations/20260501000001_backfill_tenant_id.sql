-- Migration: Fase 2 — Backfill de tenant_id com o UUID do único cliente existente
-- Idempotente: todas as UPDATEs usam WHERE tenant_id IS NULL
-- Contexto: banco single-tenant atual — há exatamente um registro em clients.
-- Se não houver nenhum cliente, a migration encerra sem erro.

DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM clients LIMIT 1;

  -- Sem cliente cadastrado: nada a fazer
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Tabelas principais (sempre existem)
  UPDATE clients
    SET tenant_id = v_tenant_id
    WHERE tenant_id IS NULL;

  UPDATE campaign_data
    SET tenant_id = v_tenant_id
    WHERE tenant_id IS NULL;

  UPDATE daily_metrics
    SET tenant_id = v_tenant_id
    WHERE tenant_id IS NULL;

  UPDATE client_kpis
    SET tenant_id = v_tenant_id
    WHERE tenant_id IS NULL;

  UPDATE client_kpi_history
    SET tenant_id = v_tenant_id
    WHERE tenant_id IS NULL;

  -- crm_leads: preenche tenant_id e client_id (Requirement 8.3)
  UPDATE crm_leads
    SET tenant_id = v_tenant_id,
        client_id = v_tenant_id
    WHERE tenant_id IS NULL;

  UPDATE ad_click_sessions
    SET tenant_id = v_tenant_id
    WHERE tenant_id IS NULL;

  UPDATE client_conversation_kpis
    SET tenant_id = v_tenant_id
    WHERE tenant_id IS NULL;

  -- Tabelas opcionais: ignorar se não existirem
  BEGIN
    UPDATE oauth_tokens
      SET tenant_id = v_tenant_id
      WHERE tenant_id IS NULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    UPDATE contracts
      SET tenant_id = v_tenant_id
      WHERE tenant_id IS NULL;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

END $$;
