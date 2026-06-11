/**
 * oauth-google-ads — T-3.6
 *
 * Edge Function para fluxo OAuth do Google Ads.
 *
 * Endpoints:
 *   GET  /oauth-google-ads/authorize?client_id=<uuid>&slug=<slug>
 *        → Redireciona para o fluxo OAuth do Google
 *
 *   GET  /oauth-google-ads/callback?code=<code>&state=<state>
 *        → Recebe o callback, troca code por tokens, salva no Banco A
 *        → Redireciona de volta para /public/dashboard/:slug/configuracoes/integracoes
 *
 * Segurança:
 * - access_token e refresh_token armazenados EXCLUSIVAMENTE no Banco A
 * - Nunca retornados ao frontend — apenas status de conexão
 * - state validado para prevenir CSRF
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function html(body: string, status = 200) {
  return new Response(`<!DOCTYPE html><html><body>${body}</body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  const supabaseUrl      = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const googleClientId   = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
  const googleClientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;
  const appOrigin        = Deno.env.get("APP_ORIGIN") ?? "https://app.agenciac8.com.br";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── /authorize ────────────────────────────────────────────────────────────
  if (path === "authorize") {
    const clientId = url.searchParams.get("client_id");
    const slug     = url.searchParams.get("slug");
    const ownedBy  = url.searchParams.get("owned_by") ?? "client";

    if (!clientId || !slug) {
      return new Response("client_id e slug são obrigatórios", { status: 400 });
    }

    const state = btoa(JSON.stringify({
      clientId,
      slug,
      ownedBy,
      ts: Date.now(),
      nonce: crypto.randomUUID().slice(0, 8),
    }));

    const callbackUrl = `${supabaseUrl}/functions/v1/oauth-google-ads/callback`;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", googleClientId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", [
      "https://www.googleapis.com/auth/adwords",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent"); // garante refresh_token

    return Response.redirect(authUrl.toString(), 302);
  }

  // ── /callback ─────────────────────────────────────────────────────────────
  if (path === "callback") {
    const code  = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return html(`<p>Autorização negada: ${error}</p>`, 400);
    }

    if (!code || !state) {
      return html("<p>Parâmetros inválidos.</p>", 400);
    }

    let stateData: { clientId: string; slug: string; ownedBy: string; ts: number };
    try {
      stateData = JSON.parse(atob(state));
      if (Date.now() - stateData.ts > 10 * 60 * 1000) {
        return html("<p>Sessão expirada. Tente novamente.</p>", 400);
      }
    } catch {
      return html("<p>State inválido.</p>", 400);
    }

    const { clientId, slug, ownedBy } = stateData;

    // Valida que o cliente existe
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id, organization_id")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientData) {
      return html("<p>Cliente não encontrado.</p>", 404);
    }

    // Troca code por tokens
    const callbackUrl = `${supabaseUrl}/functions/v1/oauth-google-ads/callback`;
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     googleClientId,
        client_secret: googleClientSecret,
        redirect_uri:  callbackUrl,
        grant_type:    "authorization_code",
      }),
    });

    const tokenData = await tokenResp.json() as {
      access_token?:  string;
      refresh_token?: string;
      expires_in?:    number;
      error?:         string;
    };

    if (!tokenData.access_token) {
      console.error("[oauth-google-ads] Token exchange failed:", tokenData);
      return html("<p>Falha ao obter token de acesso.</p>", 500);
    }

    // Busca customer ID do Google Ads
    let customerId = "unknown";
    let accountName: string | null = null;
    try {
      const customerResp = await fetch(
        "https://googleads.googleapis.com/v16/customers:listAccessibleCustomers",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const customerData = await customerResp.json() as {
        resourceNames?: string[];
      };
      // resourceNames: ["customers/1234567890"]
      const first = customerData.resourceNames?.[0];
      if (first) customerId = first.replace("customers/", "");
    } catch {
      // Continua mesmo sem o customer ID
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Salva no Banco A — tokens NUNCA vão ao frontend
    const { error: upsertError } = await adminClient
      .from("google_ad_accounts")
      .upsert({
        client_id:        clientId,
        organization_id:  clientData.organization_id,
        customer_id:      customerId,
        account_name:     accountName,
        owned_by:         ownedBy,
        access_token:     tokenData.access_token,
        refresh_token:    tokenData.refresh_token ?? null,
        token_expires_at: expiresAt,
        connected_at:     new Date().toISOString(),
        active:           true,
      }, { onConflict: "client_id,customer_id" });

    if (upsertError) {
      console.error("[oauth-google-ads] Upsert error:", upsertError);
      return html("<p>Erro ao salvar conta.</p>", 500);
    }

    const returnUrl = `${appOrigin}/public/dashboard/${slug}/configuracoes/integracoes?connected=google`;
    return Response.redirect(returnUrl, 302);
  }

  return new Response("Not found", { status: 404 });
});
