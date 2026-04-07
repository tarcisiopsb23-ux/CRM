/**
 * Edge Function: ga4-metrics
 *
 * Fetches GA4 Data API metrics for a client.
 * Automatically refreshes the access token if expired.
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   SUPABASE_URL         (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-injected)
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

    // Get stored token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("oauth_tokens")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("provider", "google")
      .single();

    if (tokenErr || !tokenRow) throw new Error("Google not connected");
    if (!tokenRow.ga4_property_id) throw new Error("GA4 Property ID not configured");

    // Refresh token if expired
    let accessToken = tokenRow.access_token;
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      if (!tokenRow.refresh_token) throw new Error("Token expired and no refresh token");
      accessToken = await refreshGoogleToken(tokenRow.refresh_token);
      await supabase.from("oauth_tokens").update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }).eq("id", tokenRow.id);
    }

    const propertyId = tokenRow.ga4_property_id;

    // Call GA4 Data API
    const body = {
      dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
        { name: "conversions" },
      ],
      dimensions: [],
    };

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const row = data.rows?.[0]?.metricValues ?? [];
    const v = (i: number) => parseFloat(row[i]?.value ?? "0");

    // By source
    const sourceRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
          metrics: [{ name: "sessions" }, { name: "conversions" }],
          dimensions: [{ name: "sessionSource" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 10,
        }),
      }
    );
    const sourceData = await sourceRes.json();
    const bySource = (sourceData.rows ?? []).map((r: any) => ({
      source: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value),
      conversions: parseInt(r.metricValues[1].value),
    }));

    // By campaign
    const campRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
          metrics: [{ name: "sessions" }, { name: "conversions" }],
          dimensions: [{ name: "sessionCampaignName" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 10,
        }),
      }
    );
    const campData = await campRes.json();
    const byCampaign = (campData.rows ?? []).map((r: any) => ({
      campaign: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value),
      conversions: parseInt(r.metricValues[1].value),
    }));

    // By day
    const dayRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
          metrics: [{ name: "sessions" }, { name: "conversions" }],
          dimensions: [{ name: "date" }],
          orderBys: [{ dimension: { dimensionName: "date" } }],
        }),
      }
    );
    const dayData = await dayRes.json();
    const byDay = (dayData.rows ?? []).map((r: any) => {
      const d = r.dimensionValues[0].value; // YYYYMMDD
      return {
        date: `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,
        sessions: parseInt(r.metricValues[0].value),
        conversions: parseInt(r.metricValues[1].value),
      };
    });

    const result = {
      sessions: v(0),
      users: v(1),
      newUsers: v(2),
      pageviews: v(3),
      bounceRate: v(4) * 100,
      avgSessionDuration: v(5),
      conversions: v(6),
      bySource,
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
