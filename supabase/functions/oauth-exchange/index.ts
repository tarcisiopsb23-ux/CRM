/**
 * Edge Function: oauth-exchange
 *
 * Exchanges an OAuth authorization code for access + refresh tokens.
 * Stores the tokens in the oauth_tokens table associated with the client_id.
 *
 * Required Supabase secrets:
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { code, provider, clientId, redirectUri } = await req.json();

    if (!code || !provider || !clientId || !redirectUri) {
      return jsonResponse({ error: "Missing required fields: code, provider, clientId, redirectUri" }, 400);
    }

    // Valida que o clientId existe na tabela clients (evita uso indevido)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();

    if (clientErr || !clientRow) {
      console.error("[oauth-exchange] cliente não encontrado:", clientId);
      return jsonResponse({ error: "Cliente não encontrado" }, 404);
    }

    let tokenData: any;

    if (provider === "google") {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
          client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
          redirect_uri:  redirectUri,
          grant_type:    "authorization_code",
        }),
      });
      tokenData = await res.json();
      if (tokenData.error) throw new Error(tokenData.error_description ?? tokenData.error);

    } else if (provider === "meta") {
      const callbackUrl = redirectUri;
      const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id",     Deno.env.get("META_APP_ID") ?? "");
      tokenUrl.searchParams.set("client_secret", Deno.env.get("META_APP_SECRET") ?? "");
      tokenUrl.searchParams.set("redirect_uri",  callbackUrl);
      tokenUrl.searchParams.set("code",          code);

      const res = await fetch(tokenUrl.toString());
      tokenData = await res.json();
      if (tokenData.error) throw new Error(tokenData.error.message ?? "Meta OAuth error");

      // Troca por token de longa duração (60 dias)
      const longRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
        `grant_type=fb_exchange_token&client_id=${Deno.env.get("META_APP_ID")}&` +
        `client_secret=${Deno.env.get("META_APP_SECRET")}&fb_exchange_token=${tokenData.access_token}`
      );
      const longToken = await longRes.json();
      if (!longToken.error) {
        tokenData.access_token = longToken.access_token;
        tokenData.expires_in   = longToken.expires_in;
      }

      // Busca o Facebook User ID para uso no webhook de deauth
      try {
        const meRes  = await fetch(`https://graph.facebook.com/v19.0/me?fields=id&access_token=${tokenData.access_token}`);
        const meData = await meRes.json() as Record<string, unknown>;
        if (meData.id) tokenData.meta_user_id = String(meData.id);
      } catch { /* silencioso */ }

    } else {
      return jsonResponse({ error: "Provider não suportado" }, 400);
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Resolve tenant_id: tenta crm_client_plans, senão usa client_id diretamente
    let tenantId: string = clientId;
    const { data: planRow } = await supabase
      .from("crm_client_plans")
      .select("tenant_id")
      .eq("client_id", clientId)
      .maybeSingle();
    if (planRow?.tenant_id) tenantId = planRow.tenant_id;

    const { error: dbError } = await supabase
      .from("oauth_tokens")
      .upsert({
        tenant_id:     tenantId,
        provider,
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        expires_at:    expiresAt,
        scope:         tokenData.scope ?? null,
        ...(tokenData.meta_user_id ? { meta_user_id: tokenData.meta_user_id } : {}),
        updated_at:    new Date().toISOString(),
      }, { onConflict: "tenant_id,provider" });

    if (dbError) {
      console.error("[oauth-exchange] upsert error:", dbError.message);
      throw new Error("Erro ao salvar token");
    }

    return jsonResponse({ success: true });

  } catch (err: any) {
    console.error("[oauth-exchange]", err.message);
    return jsonResponse({ error: err.message ?? "Erro interno" }, 500);
  }
});
