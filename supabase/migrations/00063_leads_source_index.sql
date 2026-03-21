-- Index to speed up lead source/origin queries used by the dashboard widget
CREATE INDEX IF NOT EXISTS idx_leads_org_created_source
  ON public.leads (organization_id, created_at, source, contact_origin);
