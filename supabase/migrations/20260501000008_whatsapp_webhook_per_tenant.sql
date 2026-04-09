-- Migration: 20260501000008_whatsapp_webhook_per_tenant.sql
--
-- Garante que a URL do webhook WhatsApp fique armazenada em clients.metadata
-- por tenant, e não mais em localStorage/client_auth (modelo legado).
--
-- A coluna metadata já existe em clients (JSONB).
-- A chave whatsapp_webhook_url dentro do JSONB é lida pelo frontend via:
--   supabaseCrm.from("clients").select("metadata").eq("tenant_id", tenantId)
--
-- Nenhuma alteração estrutural necessária — apenas documentação e RPC de atualização.

-- ============================================================
-- RPC: update_whatsapp_webhook_url
-- Permite que o tenant atualize sua própria URL de webhook WhatsApp.
-- SECURITY INVOKER: respeita RLS — só atualiza o próprio tenant.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_whatsapp_webhook_url(
  p_tenant_id UUID,
  p_url       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET metadata = metadata || jsonb_build_object('whatsapp_webhook_url', p_url)
  WHERE tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_whatsapp_webhook_url TO authenticated;
