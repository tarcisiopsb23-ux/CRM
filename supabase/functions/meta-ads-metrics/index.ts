/**
 * Edge Function: meta-ads-metrics
 *
 * Fetches Meta Ads Insights via Marketing API.
 *
 * Required Supabase secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SAAS_JWT_SECRET
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyJwt } from "../_shared/jwt.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v19.0";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verificar JWT com assinatura
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return jsonResponse({ error: "Não autorizado" }, 401);

    const jwtSecret = Deno.env.get("SAAS_JWT_SECRET") ?? "";
    let payload: { tenant_id?: string | null; role?: string };
    try {
      payload = await verifyJwt(token, jwtSecret);
    } catch {
      return jsonResponse({ error: "Token inválido ou expirado" }, 401);
    }

    const tenantId = payload.tenant_id ?? null;
    if (!tenantId) return jsonResponse({ error: "tenant_id não encontrado no token" }, 401);

    const { dateRange } = await req.json();
    if (!dateRange) throw new Error("Missing dateRange");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: tokenRow, error: tokenErr } = await supabase
      .from("oauth_tokens")
      .select("access_token, meta_ad_account_id")
      .eq("tenant_id", tenantId)
      .eq("provider", "meta")
      .single();

    if (tokenErr || !tokenRow) return jsonResponse({ error: "Meta not connected" }, 404);
    if (!tokenRow.meta_ad_account_id) return jsonResponse({ error: "Meta Ad Account ID not configured" }, 400);

    const accessToken = tokenRow.access_token;
    const adAccountId = tokenRow.meta_ad_account_id;
    const timeRange = JSON.stringify({ since: dateRange.from, until: dateRange.to });

    // Account-level totals
    const totalsRes = await fetch(
      `${META_API}/${adAccountId}/insights?` +
      `fields=spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values&` +
      `time_range=${encodeURIComponent(timeRange)}&` +
      `access_token=${accessToken}`
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
      `level=campaign&time_range=${encodeURIComponent(timeRange)}&` +
      `sort=spend_descending&limit=20&access_token=${accessToken}`
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
      `fields=spend,impressions,clicks,actions&time_increment=1&` +
      `time_range=${encodeURIComponent(timeRange)}&access_token=${accessToken}`
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

    return jsonResponse({
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
    });

  } catch (err: any) {
    console.error("[meta-ads-metrics]", err.message);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
