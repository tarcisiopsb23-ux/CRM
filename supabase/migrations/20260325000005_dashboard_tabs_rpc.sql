-- Migration: RPC para habilitar/desabilitar abas do dashboard
-- Permite que o parceiro configure quais abas ficam visíveis no dashboard.

CREATE OR REPLACE FUNCTION update_dashboard_tabs(
  p_client_id           UUID,
  p_dashboard_performance BOOLEAN,
  p_dashboard_atendimento BOOLEAN,
  p_dashboard_crm         BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET metadata = metadata || jsonb_build_object(
    'dashboard_performance', p_dashboard_performance,
    'dashboard_atendimento',  p_dashboard_atendimento,
    'dashboard_crm',          p_dashboard_crm
  )
  WHERE id = p_client_id;
END;
$$;
