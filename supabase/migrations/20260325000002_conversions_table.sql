-- Migration: Tabela de Conversões e Trigger Automático
-- Cria crm_conversions, função record_lead_conversion() e trigger trg_lead_conversion.
-- Requisitos: 9.1, 9.5
-- Pré-requisito: Migrations 20260324000000 a 20260324000003 devem ter sido executadas.

-- Tabela: crm_conversions
CREATE TABLE IF NOT EXISTS crm_conversions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  lead_id      UUID        NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  campaign_id  UUID        REFERENCES campaign_data(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_conversions_client_id    ON crm_conversions (client_id);
CREATE INDEX IF NOT EXISTS idx_crm_conversions_lead_id      ON crm_conversions (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_conversions_campaign_id  ON crm_conversions (campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_conversions_converted_at ON crm_conversions (converted_at DESC);

-- Função: record_lead_conversion()
-- Disparada pelo trigger trg_lead_conversion quando um lead é marcado como 'fechado'.
-- Insere um registro em crm_conversions com os dados do lead convertido.
-- SECURITY DEFINER garante execução com permissões do owner da função,
-- independentemente do papel do usuário que disparou a atualização (Requisito 12.6).
--
-- Resolução do client_id (sistema single-tenant — um parceiro por banco):
--   1. Tenta via campaign_data (quando o lead tem campaign_id).
--   2. Tenta via contracts (quando o lead tem contract_id).
--   3. Fallback: primeiro registro de clients (único parceiro no banco).
CREATE OR REPLACE FUNCTION record_lead_conversion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  -- 1. Tenta obter client_id via campaign_data
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT cd.client_id
      INTO v_client_id
      FROM campaign_data cd
     WHERE cd.id = NEW.campaign_id
     LIMIT 1;
  END IF;

  -- 2. Tenta obter client_id via contracts (se ainda não resolvido)
  IF v_client_id IS NULL AND NEW.contract_id IS NOT NULL THEN
    SELECT c.client_id
      INTO v_client_id
      FROM contracts c
     WHERE c.id = NEW.contract_id
     LIMIT 1;
  END IF;

  -- 3. Fallback: único parceiro no banco (modelo single-tenant)
  IF v_client_id IS NULL THEN
    SELECT id
      INTO v_client_id
      FROM clients
     ORDER BY created_at
     LIMIT 1;
  END IF;

  -- Insere o registro de conversão
  INSERT INTO crm_conversions (client_id, lead_id, campaign_id, converted_at)
  VALUES (v_client_id, NEW.id, NEW.campaign_id, now());

  RETURN NEW;
END;
$$;

-- Trigger: trg_lead_conversion
-- Dispara AFTER UPDATE em crm_leads quando o status muda para 'fechado'.
-- Condição: NEW.status = 'fechado' AND OLD.status != 'fechado'
-- Garante que a conversão seja registrada apenas uma vez por lead (Requisito 9.1).
DROP TRIGGER IF EXISTS trg_lead_conversion ON crm_leads;
CREATE TRIGGER trg_lead_conversion
  AFTER UPDATE ON crm_leads
  FOR EACH ROW
  WHEN (NEW.status = 'fechado' AND OLD.status IS DISTINCT FROM 'fechado')
  EXECUTE FUNCTION record_lead_conversion();
