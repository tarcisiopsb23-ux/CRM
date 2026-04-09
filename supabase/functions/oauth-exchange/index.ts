/**
 * Edge Function: oauth-exchange
 *
 * Exchanges an OAuth authorization code for access + refresh tokens.
 * Stores the tokens in the oauth_tokens table associated with the caller's tenant_id.
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   META_APP_ID
 *   META_APP_SECRET
 *   SUPABASE_URL         (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-injected)
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

    const { code, provider, redirectUri } = await req.json();
    if (!code || !provider || !redirectUri) {
      return jsonResponse({ error: "Missing required fields: code, provider, redirectUri" }, 400);
    }

    let tokenData: any;

    if (provider === "google") {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
          client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      tokenData = await res.json();
      if (tokenData.error) throw new Error(tokenData.error_description ?? tokenData.error);

    } else if (provider === "meta") {
      const res = await fetch("https://graph.facebook.com/v19.0/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: Deno.env.get("META_APP_ID") ?? "",
          client_secret: Deno.env.get("META_APP_SECRET") ?? "",
          redirect_uri: redirectUri,
        }),
      });
      tokenData = await res.json();
      if (tokenData.error) throw new Error(tokenData.error.message ?? "Meta OAuth error");

      // Exchange short-lived token for long-lived token (60 days)
      const longRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
        `grant_type=fb_exchange_token&client_id=${Deno.env.get("META_APP_ID")}&` +
        `client_secret=${Deno.env.get("META_APP_SECRET")}&fb_exchange_token=${tokenData.access_token}`
      );
      const longToken = await longRes.json();
      if (!longToken.error) {
        tokenData.access_token = longToken.access_token;
        tokenData.expires_in = longToken.expires_in;
      }
    } else {
      return jsonResponse({ error: "Provider não suportado" }, 400);
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: dbError } = await supabase
      .from("oauth_tokens")
      .upsert({
        tenant_id: tenantId,
        provider,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        expires_at: expiresAt,
        scope: tokenData.scope ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,provider" });

    if (dbError) {
      console.error("[oauth-exchange] upsert error:", dbError.message);
      throw new Error("Erro ao salvar token");
    }

    return jsonResponse({ success: true });

  } catch (err: any) {
    console.error("[oauth-exchange]", err.message);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
