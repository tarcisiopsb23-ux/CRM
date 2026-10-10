/**
 * google-calendar-oauth
 *
 * Edge Function para o fluxo OAuth2 do Google Calendar.
 * Usada quando o cliente clica em "Conectar com Google" no dashboard
 * (ConfigIntegracoesPage → useGoogleCalendar → connect()).
 *
 * Endpoints:
 *   GET /google-calendar-oauth/authorize?client_id=<uuid>&slug=<slug>
 *       → Redireciona para o consent screen do Google
 *
 *   GET /google-calendar-oauth/callback?code=<code>&state=<state>
 *       → Troca code por tokens, salva no Banco A via RPC save_google_calendar_tokens
 *       → Registra watch channel para notificações push
 *       → Fecha o popup e notifica a janela pai (postMessage)
 *
 * Variáveis de ambiente necessárias (Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_CALENDAR_CLIENT_ID      → OAuth Client ID do Google Cloud Console
 *   GOOGLE_CALENDAR_CLIENT_SECRET  → OAuth Client Secret
 *   APP_ORIGIN                     → ex: http://localhost:8080 ou https://app.dominio.com
 *   N8N_GOOGLE_CALENDAR_WEBHOOK_URL → URL do workflow agenda-google-webhook no n8n
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

function buildCallbackRedirect(appOrigin: string, success: boolean, message: string, clientId?: string): Response {
  const url = new URL(`${appOrigin}/public/dashboard/google-calendar-callback`);
  url.searchParams.set("success",  String(success));
  url.searchParams.set("message",  message);
  if (clientId) url.searchParams.set("client_id", clientId);
  return Response.redirect(url.toString(), 302);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const url        = new URL(req.url);
  const pathParts  = url.pathname.split("/").filter(Boolean);
  const endpoint   = pathParts[pathParts.length - 1]; // "authorize" ou "callback"

  const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const googleClientId     = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!;
  const googleClientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!;
  const appOrigin          = Deno.env.get("APP_ORIGIN") ?? "https://app.agenciac8.com.br";
  const redirectUri        = `${supabaseUrl}/functions/v1/google-calendar-oauth/callback`;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── /authorize ────────────────────────────────────────────────────────────
  if (endpoint === "authorize") {
    const clientId = url.searchParams.get("client_id");
    const slug     = url.searchParams.get("slug") ?? "";

    if (!clientId) {
      return new Response("client_id obrigatório", { status: 400 });
    }

    // Verifica que o cliente existe
    const { data: client } = await adminClient
      .from("clients")
      .select("id, name")
      .eq("id", clientId)
      .single();

    if (!client) {
      return new Response("Cliente não encontrado", { status: 404 });
    }

    // Gera state anti-CSRF: base64(clientId + slug + timestamp)
    const statePayload = JSON.stringify({ client_id: clientId, slug, ts: Date.now() });
    const state = btoa(statePayload);

    // Armazena state temporário na tabela de tokens (coluna metadata)
    // Usamos um registro temporário identificado pelo state
    await adminClient.from("client_google_calendar_tokens").upsert({
      client_id:    clientId,
      connected:    false,
      // Guarda o state no watch_channel_id temporariamente
      watch_channel_id: `oauth_state_${state.substring(0, 50)}`,
    }, { onConflict: "client_id" });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id",     googleClientId);
    authUrl.searchParams.set("redirect_uri",  redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope",         SCOPES);
    authUrl.searchParams.set("access_type",   "offline");
    authUrl.searchParams.set("prompt",        "consent");  // força refresh_token
    authUrl.searchParams.set("state",         state);

    return Response.redirect(authUrl.toString(), 302);
  }

  // ── /callback ─────────────────────────────────────────────────────────────
  if (endpoint === "callback") {
    const code  = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("[google-calendar-oauth] Erro do Google:", error);
      return buildCallbackRedirect(appOrigin, false, "Autorização negada: ${error}");
    }

    if (!code || !state) {
      return buildCallbackRedirect(appOrigin, false, "Parâmetros inválidos no callback.");
    }

    // Decodifica o state para obter client_id
    let clientId: string;
    let slug: string;
    try {
      const decoded = JSON.parse(atob(state));
      clientId = decoded.client_id;
      slug     = decoded.slug ?? "";

      // Valida que o state não é muito antigo (máx 10 minutos)
      if (Date.now() - decoded.ts > 10 * 60 * 1000) {
        return buildCallbackRedirect(appOrigin, false, "Sessão expirada. Tente novamente.");
      }
    } catch {
      return buildCallbackRedirect(appOrigin, false, "State inválido.");
    }

    // Troca o authorization code por tokens
    let accessToken: string;
    let refreshToken: string;
    let expiresIn: number;

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     googleClientId,
          client_secret: googleClientSecret,
          redirect_uri:  redirectUri,
          grant_type:    "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || tokenData.error) {
        console.error("[google-calendar-oauth] Erro ao trocar token:", tokenData);
        return buildCallbackRedirect(appOrigin, false, "Falha ao obter tokens do Google.");
      }

      accessToken  = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      expiresIn    = tokenData.expires_in ?? 3600;
    } catch (e) {
      console.error("[google-calendar-oauth] Exceção na troca de tokens:", e);
      return buildCallbackRedirect(appOrigin, false, "Erro interno ao conectar com o Google.");
    }

    // Busca informações do calendário principal
    let calendarId   = "primary";
    let calendarName = "Google Agenda";
    try {
      const calRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (calRes.ok) {
        const calData = await calRes.json();
        calendarId   = calData.id   ?? "primary";
        calendarName = calData.summary ?? "Google Agenda";
      }
    } catch {
      // Não crítico — usa "primary" como fallback
    }

    // Salva tokens no Banco A via RPC SECURITY DEFINER
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { error: saveError } = await adminClient.rpc("save_google_calendar_tokens", {
      p_client_id:     clientId,
      p_access_token:  accessToken,
      p_refresh_token: refreshToken,
      p_token_expiry:  tokenExpiry,
      p_calendar_id:   calendarId,
      p_calendar_name: calendarName,
      p_scope:         SCOPES,
    });

    if (saveError) {
      console.error("[google-calendar-oauth] Erro ao salvar tokens:", saveError);
      return buildCallbackRedirect(appOrigin, false, "Erro ao salvar credenciais. Tente novamente.");
    }

    // Registra watch channel para receber notificações push do Google Calendar
    try {
      const channelId  = crypto.randomUUID();
      const watchExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias
      const n8nWebhookUrl = Deno.env.get("N8N_GOOGLE_CALENDAR_WEBHOOK_URL");

      if (n8nWebhookUrl) {
        const watchRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
          {
            method: "POST",
            headers: {
              Authorization:  `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id:         channelId,
              type:       "web_hook",
              address:    n8nWebhookUrl,
              expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime(),
            }),
          }
        );

        if (watchRes.ok) {
          const watchData = await watchRes.json();
          await adminClient.rpc("save_google_watch_channel", {
            p_client_id:   clientId,
            p_channel_id:  channelId,
            p_resource_id: watchData.resourceId ?? "",
            p_expiry:      watchExpiry,
          });
        }
      }
    } catch (e) {
      // Watch não é crítico — agenda funciona sem push notifications
      console.warn("[google-calendar-oauth] Watch channel não configurado:", e);
    }

    console.log(`[google-calendar-oauth] Cliente ${clientId} conectado ao Google Calendar.`);
    return buildCallbackRedirect(appOrigin, true, "Google Agenda conectado com sucesso!", clientId);
  }

  // ── /renew ────────────────────────────────────────────────────────────────
  // Renova programaticamente o watch channel de um cliente.
  // Chamado pelo workflow agenda-renew-watch-scheduled ou manualmente.
  // Requer header Authorization com Bearer token do Supabase (service_role ou user).
  if (endpoint === "renew") {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization obrigatório" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    let clientId: string;
    try {
      const body = await req.json() as { client_id?: string };
      clientId = body.client_id ?? "";
      if (!clientId) throw new Error("client_id obrigatório");
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Busca tokens do cliente
    const { data: tokenRow, error: tokenErr } = await adminClient.rpc("get_google_calendar_tokens", {
      p_client_id: clientId,
    });

    if (tokenErr || !tokenRow?.found) {
      return new Response(JSON.stringify({ error: "Cliente sem Google Calendar conectado" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    // Renova o access_token se necessário
    let accessToken = tokenRow.access_token as string;
    const tokenExpiry = tokenRow.token_expiry ? new Date(tokenRow.token_expiry as string).getTime() : 0;
    const needsRefresh = tokenExpiry - Date.now() < 5 * 60 * 1000;

    if (needsRefresh && tokenRow.refresh_token) {
      try {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id:     googleClientId,
            client_secret: googleClientSecret,
            refresh_token: tokenRow.refresh_token as string,
            grant_type:    "refresh_token",
          }),
        });
        const refreshData = await refreshRes.json() as { access_token?: string; expires_in?: number };
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          // Persiste token renovado
          await adminClient.from("client_google_calendar_tokens").update({
            access_token: accessToken,
            token_expiry: new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString(),
          }).eq("client_id", clientId);
        }
      } catch (e) {
        console.warn("[google-calendar-oauth/renew] Falha ao renovar token:", e);
      }
    }

    // Registra novo watch channel
    const calendarId = (tokenRow.calendar_id as string) ?? "primary";
    const n8nWebhookUrl = Deno.env.get("N8N_GOOGLE_CALENDAR_WEBHOOK_URL");

    if (!n8nWebhookUrl) {
      return new Response(JSON.stringify({ error: "N8N_GOOGLE_CALENDAR_WEBHOOK_URL não configurado" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const channelId  = crypto.randomUUID();
      const watchExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const watchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            id:         channelId,
            type:       "web_hook",
            address:    n8nWebhookUrl,
            expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime(),
          }),
        }
      );

      if (!watchRes.ok) {
        const watchErr = await watchRes.json();
        console.error("[google-calendar-oauth/renew] Erro ao registrar watch:", watchErr);
        return new Response(JSON.stringify({ error: "Falha ao registrar watch channel" }), {
          status: 502, headers: { "Content-Type": "application/json" },
        });
      }

      const watchData = await watchRes.json() as { id: string; resourceId?: string };

      await adminClient.rpc("save_google_watch_channel", {
        p_client_id:   clientId,
        p_channel_id:  watchData.id,
        p_resource_id: watchData.resourceId ?? "",
        p_expiry:      watchExpiry,
      });

      console.log(`[google-calendar-oauth/renew] Watch renovado para ${clientId}: ${watchData.id}`);

      return new Response(JSON.stringify({
        success:    true,
        client_id:  clientId,
        channel_id: watchData.id,
        expires_at: watchExpiry,
      }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (e) {
      console.error("[google-calendar-oauth/renew] Erro:", e);
      return new Response(JSON.stringify({ error: "Erro interno ao renovar watch channel" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Endpoint não encontrado", { status: 404 });
});
