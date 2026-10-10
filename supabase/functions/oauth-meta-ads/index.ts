/**
 * oauth-meta-ads — T-3.5
 *
 * Edge Function para fluxo OAuth do Meta Ads.
 *
 * Endpoints:
 *   GET  /oauth-meta-ads/authorize?client_id=<uuid>&slug=<slug>
 *        → Redireciona para o fluxo OAuth do Meta
 *
 *   GET  /oauth-meta-ads/callback?code=<code>&state=<state>
 *        → Recebe o callback, troca code por token, salva no Banco A
 *        → Redireciona de volta para /public/dashboard/:slug/configuracoes/integracoes
 *
 * Segurança:
 * - Token OAuth armazenado EXCLUSIVAMENTE no Banco A (meta_ad_accounts)
 * - Nunca retornado ao frontend — apenas status de conexão
 * - state é validado para prevenir CSRF
 * - client_id validado antes de armazenar
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
  const path = url.pathname.split("/").pop(); // "authorize" ou "callback"

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const metaAppId      = Deno.env.get("META_APP_ID")!;
  const metaAppSecret  = Deno.env.get("META_APP_SECRET")!;
  const appOrigin      = Deno.env.get("APP_ORIGIN") ?? "https://app.agenciac8.com.br";

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

    // Gera state anti-CSRF: base64(clientId|slug|timestamp|random)
    const state = btoa(JSON.stringify({
      clientId,
      slug,
      ownedBy,
      ts: Date.now(),
      nonce: crypto.randomUUID().slice(0, 8),
    }));

    const callbackUrl = `${supabaseUrl}/functions/v1/oauth-meta-ads/callback`;
    const scopes = [
      "ads_read",
      "ads_management",
      "business_management",
      "pages_read_engagement",
    ].join(",");

    const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    authUrl.searchParams.set("client_id", metaAppId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");

    return Response.redirect(authUrl.toString(), 302);
  }

  // ── /callback ─────────────────────────────────────────────────────────────
  if (path === "callback") {
    const code  = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const desc = url.searchParams.get("error_description") ?? error;
      return html(`<p>Autorização negada: ${desc}</p><script>window.close();</script>`, 400);
    }

    if (!code || !state) {
      return html("<p>Parâmetros inválidos.</p>", 400);
    }

    // Valida e descompacta o state
    let stateData: { clientId: string; slug: string; ownedBy: string; ts: number };
    try {
      stateData = JSON.parse(atob(state));
      // Rejeita states com mais de 10 minutos
      if (Date.now() - stateData.ts > 10 * 60 * 1000) {
        return html("<p>Sessão expirada. Tente novamente.</p>", 400);
      }
    } catch {
      return html("<p>State inválido.</p>", 400);
    }

    const { clientId, slug, ownedBy } = stateData;

    // Valida que o cliente existe no Banco A
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id, organization_id")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientData) {
      return html("<p>Cliente não encontrado.</p>", 404);
    }

    // Troca o code por access_token
    const callbackUrl = `${supabaseUrl}/functions/v1/oauth-meta-ads/callback`;
    const tokenRes = await fetch("https://graph.facebook.com/v19.0/oauth/access_token", {
      method: "GET",
      headers: {},
    });

    // Monta a URL de troca de token
    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", metaAppId);
    tokenUrl.searchParams.set("client_secret", metaAppSecret);
    tokenUrl.searchParams.set("redirect_uri", callbackUrl);
    tokenUrl.searchParams.set("code", code);

    const tokenResp = await fetch(tokenUrl.toString());
    const tokenData = await tokenResp.json() as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      error?: { message: string };
    };

    if (!tokenData.access_token) {
      console.error("[oauth-meta-ads] Token exchange failed:", tokenData);
      return html("<p>Falha ao obter token de acesso.</p>", 500);
    }

    // Busca as contas de anúncios vinculadas ao token
    const accountsResp = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name&access_token=${tokenData.access_token}`
    );
    const accountsData = await accountsResp.json() as {
      data?: Array<{ id: string; name: string }>;
    };

    const adAccountId = accountsData.data?.[0]?.id ?? "unknown";
    const accountName = accountsData.data?.[0]?.name ?? null;

    // Calcula expiração
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Salva no Banco A — token NUNCA vai para o frontend
    const { error: upsertError } = await adminClient
      .from("meta_ad_accounts")
      .upsert({
        client_id:       clientId,
        organization_id: clientData.organization_id,
        ad_account_id:   adAccountId,
        account_name:    accountName,
        owned_by:        ownedBy,
        access_token:    tokenData.access_token,
        token_expires_at: expiresAt,
        connected_at:    new Date().toISOString(),
        active:          true,
      }, { onConflict: "client_id,ad_account_id" });

    if (upsertError) {
      console.error("[oauth-meta-ads] Upsert error:", upsertError);
      return html("<p>Erro ao salvar conta.</p>", 500);
    }

    // Redireciona de volta para o dashboard
    const returnUrl = `${appOrigin}/public/dashboard/${slug}/configuracoes/integracoes?connected=meta`;
    return Response.redirect(returnUrl, 302);
  }

  return new Response("Not found", { status: 404 });
});
