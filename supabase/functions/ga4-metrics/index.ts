/**
 * Edge Function: ga4-metrics
 *
 * Fetches GA4 Data API metrics for a client.
 * Automatically refreshes the access token if expired.
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
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
      .select("access_token, refresh_token, expires_at, ga4_property_id, id")
      .eq("tenant_id", tenantId)
      .eq("provider", "google")
      .single();

    if (tokenErr || !tokenRow) return jsonResponse({ error: "Google not connected" }, 404);
    if (!tokenRow.ga4_property_id) return jsonResponse({ error: "GA4 Property ID not configured" }, 400);

    let accessToken = tokenRow.access_token;
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      if (!tokenRow.refresh_token) return jsonResponse({ error: "Token expired and no refresh token" }, 400);
      accessToken = await refreshGoogleToken(tokenRow.refresh_token);
      await supabase.from("oauth_tokens").update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }).eq("id", tokenRow.id);
    }

    const propertyId = tokenRow.ga4_property_id;
    const gaFetch = (body: object) =>
      fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    // Totals
    const totalsRes = await gaFetch({
      dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
      metrics: [
        { name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" },
        { name: "screenPageViews" }, { name: "bounceRate" },
        { name: "averageSessionDuration" }, { name: "conversions" },
      ],
      dimensions: [],
    });
    const totalsData = await totalsRes.json();
    if (totalsData.error) throw new Error(totalsData.error.message);

    const row = totalsData.rows?.[0]?.metricValues ?? [];
    const v = (i: number) => parseFloat(row[i]?.value ?? "0");

    // By source
    const sourceRes = await gaFetch({
      dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      dimensions: [{ name: "sessionSource" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    });
    const sourceData = await sourceRes.json();
    const bySource = (sourceData.rows ?? []).map((r: any) => ({
      source: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value),
      conversions: parseInt(r.metricValues[1].value),
    }));

    // By campaign
    const campRes = await gaFetch({
      dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      dimensions: [{ name: "sessionCampaignName" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    });
    const campData = await campRes.json();
    const byCampaign = (campData.rows ?? []).map((r: any) => ({
      campaign: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value),
      conversions: parseInt(r.metricValues[1].value),
    }));

    // By day
    const dayRes = await gaFetch({
      dateRanges: [{ startDate: dateRange.from, endDate: dateRange.to }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      dimensions: [{ name: "date" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });
    const dayData = await dayRes.json();
    const byDay = (dayData.rows ?? []).map((r: any) => {
      const d = r.dimensionValues[0].value;
      return {
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        sessions: parseInt(r.metricValues[0].value),
        conversions: parseInt(r.metricValues[1].value),
      };
    });

    return jsonResponse({
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
    });

  } catch (err: any) {
    console.error("[ga4-metrics]", err.message);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
