/**
 * Edge Function: gads-metrics
 *
 * Fetches Google Ads campaign metrics via Google Ads API.
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_ADS_DEVELOPER_TOKEN   (from your MCC account)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);
  return data.access_token;
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
      .eq("provider", "google")
      .single();

    if (tokenErr || !tokenRow) throw new Error("Google not connected");
    if (!tokenRow.gads_customer_id) throw new Error("Google Ads Customer ID not configured");

    let accessToken = tokenRow.access_token;
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      if (!tokenRow.refresh_token) throw new Error("Token expired and no refresh token");
      accessToken = await refreshGoogleToken(tokenRow.refresh_token);
      await supabase.from("oauth_tokens").update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }).eq("id", tokenRow.id);
    }

    // Normalize customer ID (remove dashes)
    const customerId = tokenRow.gads_customer_id.replace(/-/g, "");
    const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";

    const fromDate = dateRange.from.replace(/-/g, "");
    const toDate = dateRange.to.replace(/-/g, "");

    // Query campaign metrics
    const query = `
      SELECT
        campaign.name,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${dateRange.from}' AND '${dateRange.to}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 20
    `;

    const res = await fetch(
      `https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));

    const rows = data.results ?? [];

    const byCampaign = rows.map((r: any) => {
      const spend = (r.metrics.costMicros ?? 0) / 1_000_000;
      const revenue = r.metrics.conversionsValue ?? 0;
      return {
        campaign: r.campaign.name,
        spend,
        impressions: r.metrics.impressions ?? 0,
        clicks: r.metrics.clicks ?? 0,
        conversions: r.metrics.conversions ?? 0,
        roas: spend > 0 ? revenue / spend : 0,
      };
    });

    const totals = byCampaign.reduce((acc: any, c: any) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
      revenue: acc.revenue + (c.roas * c.spend),
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });

    // Daily breakdown
    const dayQuery = `
      SELECT
        segments.date,
        metrics.cost_micros,
        metrics.clicks,
        metrics.conversions
      FROM campaign
      WHERE segments.date BETWEEN '${dateRange.from}' AND '${dateRange.to}'
      ORDER BY segments.date ASC
    `;
    const dayRes = await fetch(
      `https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: dayQuery }),
      }
    );
    const dayData = await dayRes.json();

    // Aggregate by day
    const dayMap = new Map<string, { spend: number; clicks: number; conversions: number }>();
    for (const r of (dayData.results ?? [])) {
      const d = r.segments.date;
      const existing = dayMap.get(d) ?? { spend: 0, clicks: 0, conversions: 0 };
      dayMap.set(d, {
        spend: existing.spend + (r.metrics.costMicros ?? 0) / 1_000_000,
        clicks: existing.clicks + (r.metrics.clicks ?? 0),
        conversions: existing.conversions + (r.metrics.conversions ?? 0),
      });
    }
    const byDay = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));

    const result = {
      spend: totals.spend,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      conversions: totals.conversions,
      cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
      roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
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
