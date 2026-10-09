-- Migration: Tabela para captura de cliques de anúncios (Google Ads / Facebook Ads)
-- Permite atribuição de campanha a leads vindos via link de WhatsApp,
-- usando uma landing page intermediária que captura UTMs antes do redirect.

CREATE TABLE IF NOT EXISTS ad_click_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  utm_source   TEXT,                                        -- 'google' | 'facebook' | etc
  utm_medium   TEXT,                                        -- 'cpc' | 'paid' | etc
  utm_campaign TEXT,                                        -- nome da campanha
  utm_content  TEXT,                                        -- variação do anúncio
  utm_term     TEXT,                                        -- palavra-chave (Google)
  whatsapp_number TEXT,                                     -- número destino do wa.me
  clicked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id      UUID        REFERENCES crm_leads(id) ON DELETE SET NULL,
  matched_at   TIMESTAMPTZ                                  -- preenchido ao associar lead
);

CREATE INDEX IF NOT EXISTS idx_ad_click_sessions_client_id  ON ad_click_sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_ad_click_sessions_clicked_at ON ad_click_sessions (clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_click_sessions_lead_id    ON ad_click_sessions (lead_id);

-- RLS: acesso total via anon key (banco single-tenant)
ALTER TABLE ad_click_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_ad_click_sessions" ON ad_click_sessions;
CREATE POLICY "anon_all_ad_click_sessions" ON ad_click_sessions
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
