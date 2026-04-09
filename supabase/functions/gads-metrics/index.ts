/**
 * Edge Function: gads-metrics
 *
 * Fetches Google Ads campaign metrics via Google Ads API.
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_ADS_DEVELOPER_TOKEN
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      .select("access_token, refresh_token, expires_at, gads_customer_id, id")
      .eq("tenant_id", tenantId)
      .eq("provider", "google")
      .single();

    if (tokenErr || !tokenRow) return jsonResponse({ error: "Google not connected" }, 404);
    if (!tokenRow.gads_customer_id) return jsonResponse({ error: "Google Ads Customer ID not configured" }, 400);

    let accessToken = tokenRow.access_token;
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      if (!tokenRow.refresh_token) return jsonResponse({ error: "Token expired and no refresh token" }, 400);
      accessToken = await refreshGoogleToken(tokenRow.refresh_token);
      await supabase.from("oauth_tokens").update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }).eq("id", tokenRow.id);
    }

    const customerId = tokenRow.gads_customer_id.replace(/-/g, "");
    const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";

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

    const totals = byCampaign.reduce(
      (acc: any, c: any) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        conversions: acc.conversions + c.conversions,
        revenue: acc.revenue + c.roas * c.spend,
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
    );

    // Daily breakdown
    const dayQuery = `
      SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions
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

    const dayMap = new Map<string, { spend: number; clicks: number; conversions: number }>();
    for (const r of dayData.results ?? []) {
      const d = r.segments.date;
      const existing = dayMap.get(d) ?? { spend: 0, clicks: 0, conversions: 0 };
      dayMap.set(d, {
        spend: existing.spend + (r.metrics.costMicros ?? 0) / 1_000_000,
        clicks: existing.clicks + (r.metrics.clicks ?? 0),
        conversions: existing.conversions + (r.metrics.conversions ?? 0),
      });
    }
    const byDay = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));

    return jsonResponse({
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
    });

  } catch (err: any) {
    console.error("[gads-metrics]", err.message);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
