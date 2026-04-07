/**
 * Edge Function: meta-ads-metrics
 *
 * Fetches Meta Ads Insights via Marketing API.
 *
 * Required Supabase secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v19.0";

function getTenantIdFromJwt(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tenant_id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const tenantId = getTenantIdFromJwt(req);
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id não encontrado no token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dateRange } = await req.json();
    if (!dateRange) throw new Error("Missing dateRange");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: tokenRow, error: tokenErr } = await supabase
      .from("oauth_tokens")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("provider", "meta")
      .single();

    if (tokenErr || !tokenRow) throw new Error("Meta not connected");
    if (!tokenRow.meta_ad_account_id) throw new Error("Meta Ad Account ID not configured");

    const token = tokenRow.access_token;
    const adAccountId = tokenRow.meta_ad_account_id; // e.g. "act_123456789"

    const timeRange = JSON.stringify({ since: dateRange.from, until: dateRange.to });

    // Account-level totals
    const totalsRes = await fetch(
      `${META_API}/${adAccountId}/insights?` +
      `fields=spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values&` +
      `time_range=${encodeURIComponent(timeRange)}&` +
      `access_token=${token}`
    );
    const totalsData = await totalsRes.json();
    if (totalsData.error) throw new Error(totalsData.error.message);

    const t = totalsData.data?.[0] ?? {};
    const getAction = (actions: any[], type: string) =>
      parseFloat(actions?.find((a: any) => a.action_type === type)?.value ?? "0");
    const getActionValue = (values: any[], type: string) =>
      parseFloat(values?.find((a: any) => a.action_type === type)?.value ?? "0");

    const leads = getAction(t.actions, "lead") + getAction(t.actions, "onsite_conversion.lead_grouped");
    const purchases = getAction(t.actions, "purchase");
    const purchaseValue = getActionValue(t.action_values, "purchase");
    const spend = parseFloat(t.spend ?? "0");

    // Campaign breakdown
    const campRes = await fetch(
      `${META_API}/${adAccountId}/insights?` +
      `fields=campaign_id,campaign_name,spend,impressions,clicks,actions,action_values&` +
      `level=campaign&` +
      `time_range=${encodeURIComponent(timeRange)}&` +
      `sort=spend_descending&` +
      `limit=20&` +
      `access_token=${token}`
    );
    const campData = await campRes.json();
    if (campData.error) throw new Error(campData.error.message);

    const byCampaign = (campData.data ?? []).map((c: any) => {
      const cSpend = parseFloat(c.spend ?? "0");
      const cLeads = getAction(c.actions, "lead") + getAction(c.actions, "onsite_conversion.lead_grouped");
      const cPurchases = getAction(c.actions, "purchase");
      const cRevenue = getActionValue(c.action_values, "purchase");
      return {
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        spend: cSpend,
        impressions: parseInt(c.impressions ?? "0"),
        clicks: parseInt(c.clicks ?? "0"),
        leads: cLeads,
        purchases: cPurchases,
        roas: cSpend > 0 ? cRevenue / cSpend : 0,
      };
    });

    // Daily breakdown
    const dayRes = await fetch(
      `${META_API}/${adAccountId}/insights?` +
      `fields=spend,impressions,clicks,actions&` +
      `time_increment=1&` +
      `time_range=${encodeURIComponent(timeRange)}&` +
      `access_token=${token}`
    );
    const dayData = await dayRes.json();
    if (dayData.error) throw new Error(dayData.error.message);

    const byDay = (dayData.data ?? []).map((d: any) => ({
      date: d.date_start,
      spend: parseFloat(d.spend ?? "0"),
      impressions: parseInt(d.impressions ?? "0"),
      clicks: parseInt(d.clicks ?? "0"),
      leads: getAction(d.actions, "lead") + getAction(d.actions, "onsite_conversion.lead_grouped"),
    }));

    const result = {
      spend,
      impressions: parseInt(t.impressions ?? "0"),
      clicks: parseInt(t.clicks ?? "0"),
      ctr: parseFloat(t.ctr ?? "0"),
      cpc: parseFloat(t.cpc ?? "0"),
      cpm: parseFloat(t.cpm ?? "0"),
      reach: parseInt(t.reach ?? "0"),
      leads,
      cpl: leads > 0 ? spend / leads : 0,
      purchases,
      roas: spend > 0 ? purchaseValue / spend : 0,
      byCampaign,
      byDay,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
