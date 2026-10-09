-- Migration: RPC para atualizar display_name no metadata do cliente
CREATE OR REPLACE FUNCTION update_display_name(
  p_client_id  UUID,
  p_display_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clients
  SET metadata = metadata || jsonb_build_object('display_name', p_display_name)
  WHERE id = p_client_id;
END;
$$;
