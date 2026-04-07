/**
 * Edge Function: oauth-exchange
 *
 * Exchanges an OAuth authorization code for access + refresh tokens.
 * Stores the tokens in the oauth_tokens table.
 *
 * Required Supabase secrets (set via: supabase secrets set KEY=value):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   META_APP_ID
 *   META_APP_SECRET
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const tenantId = getTenantIdFromJwt(req);
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id não encontrado no token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, provider, redirectUri } = await req.json();

    if (!code || !provider || !redirectUri) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Unknown provider" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate expiry
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Store in Supabase
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

    if (dbError) throw dbError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
