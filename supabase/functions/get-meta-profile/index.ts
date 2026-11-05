/**
 * get-meta-profile
 *
 * Fetches Instagram or Facebook user profile from Meta Graph API v19.0.
 * Called by n8n after receiving a DM event to enrich the contact record.
 *
 * POST /functions/v1/get-meta-profile
 * Authorization: Bearer <service_role_key>
 *
 * Body: {
 *   connection_id:   string,   // meta_connections.id
 *   organization_id: string,   // org UUID
 *   channel:         "instagram" | "facebook",
 *   user_id:         string,   // IGSID for Instagram, PSID for Facebook
 * }
 *
 * Success (200):
 *   Instagram: { channel, user_id, name, username, profile_pic, follower_count, is_user_follow_business, is_business_follow_user }
 *   Facebook:  { channel, user_id, first_name, last_name, name, profile_pic }
 *              (name = first_name + " " + last_name, composed here for n8n convenience)
 *
 * Soft failure (200 with error field):
 *   { error: "consent_required"|"not_found"|"token_resolution_failed"|"graph_fetch_failed", message, channel, user_id }
 *
 * Hard failures: 400 (missing/invalid body), 401 (unauthorized), 405 (wrong method)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v19.0";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Resolve token via meta-credential-provider ────────────────────────────────

async function resolveToken(
  connectionId: string,
  orgId: string,
  supabaseUrl: string,
): Promise<string> {
  const internalSecret = Deno.env.get("INTERNAL_SECRET");
  if (!internalSecret) throw new Error("INTERNAL_SECRET not configured");

  const res = await fetch(`${supabaseUrl}/functions/v1/meta-credential-provider`, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "X-Internal-Secret": internalSecret,
    },
    body: JSON.stringify({
      connection_id:   connectionId,
      organization_id: orgId,
      action:          "get_token",
    }),
  });

  if (!res.ok) {
    const err = await res.json() as Record<string, unknown>;
    throw new Error((err.error as string) ?? "credential_provider_error");
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const apiKeyHeader = req.headers.get("apikey") ?? "";
  const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader || apiKeyHeader;

  if (!userToken) return json({ error: "Não autorizado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Valida token
  let authorized = false;
  try {
    const parts = userToken.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.role === "service_role" || payload.role === "anon") {
        authorized = true;
      }
    }
  } catch { /* não é JWT estático */ }

  if (!authorized) {
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (user) authorized = true;
  }

  if (!authorized) return json({ error: "Não autorizado" }, 401);

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const { connection_id, organization_id, channel, user_id } = body;

  if (!connection_id || !organization_id || !channel || !user_id) {
    return json({
      error: "connection_id, organization_id, channel e user_id são obrigatórios",
    }, 400);
  }

  if (channel !== "instagram" && channel !== "facebook") {
    return json({
      error:   "channel_not_supported",
      message: `Channel '${channel}' is not supported. Use 'instagram' or 'facebook'.`,
      channel,
      user_id,
    }, 400);
  }

  // Resolve access token
  let accessToken: string;
  try {
    accessToken = await resolveToken(connection_id, organization_id, supabaseUrl);
  } catch (e: unknown) {
    const message = (e as Error).message;
    console.warn("[get-meta-profile] token_resolution_failed:", message);
    return json({ error: "token_resolution_failed", message, channel, user_id });
  }

  // ── Build Graph URL ───────────────────────────────────────────────────────
  let graphUrl: URL;
  if (channel === "instagram") {
    graphUrl = new URL(`${GRAPH}/${user_id}`);
    graphUrl.searchParams.set(
      "fields",
      "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user",
    );
    graphUrl.searchParams.set("access_token", accessToken);
  } else {
    // facebook
    graphUrl = new URL(`${GRAPH}/${user_id}`);
    graphUrl.searchParams.set("fields", "first_name,last_name,profile_pic");
    graphUrl.searchParams.set("access_token", accessToken);
  }

  // ── Fetch from Graph API ──────────────────────────────────────────────────
  let graphData: Record<string, unknown>;
  try {
    const res = await fetch(graphUrl.toString());
    graphData = await res.json() as Record<string, unknown>;

    // Check for error in response body
    if (graphData.error) {
      const graphError = graphData.error as Record<string, unknown>;
      const errMessage = (graphError.message as string) ?? "Unknown Graph API error";
      const errType    = (graphError.type as string)   ?? "";
      const errCode    = (graphError.code as number)   ?? 0;

      // Consent / permission errors
      if (
        errType === "OAuthException" ||
        errCode === 10 ||
        errMessage.toLowerCase().includes("permission")
      ) {
        console.warn("[get-meta-profile] consent_required:", errMessage, { channel, user_id });
        return json({ error: "consent_required", message: errMessage, channel, user_id });
      }

      // Not found
      if (errCode === 803 || res.status === 404) {
        console.warn("[get-meta-profile] not_found:", errMessage, { channel, user_id });
        return json({ error: "not_found", message: errMessage, channel, user_id });
      }

      // Other graph errors
      console.error("[get-meta-profile] graph_fetch_failed:", errMessage, { channel, user_id, errCode, errType });
      return json({ error: "graph_fetch_failed", message: errMessage, channel, user_id });
    }

    // HTTP-level 404 without error body
    if (res.status === 404) {
      console.warn("[get-meta-profile] not_found (HTTP 404):", { channel, user_id });
      return json({ error: "not_found", message: "User not found", channel, user_id });
    }
  } catch (e: unknown) {
    const message = (e as Error).message;
    console.error("[get-meta-profile] graph_fetch_failed (network):", message, { channel, user_id });
    return json({ error: "graph_fetch_failed", message, channel, user_id });
  }

  // ── Build success response ────────────────────────────────────────────────
  if (channel === "instagram") {
    return json({
      channel:                  "instagram",
      user_id,
      name:                     graphData.name                     ?? null,
      username:                 graphData.username                 ?? null,
      profile_pic:              graphData.profile_pic              ?? null,
      follower_count:           graphData.follower_count           ?? null,
      is_user_follow_business:  graphData.is_user_follow_business  ?? null,
      is_business_follow_user:  graphData.is_business_follow_user  ?? null,
    });
  } else {
    // facebook
    const firstName = (graphData.first_name as string) ?? "";
    const lastName  = (graphData.last_name  as string) ?? "";
    return json({
      channel:     "facebook",
      user_id,
      first_name:  firstName,
      last_name:   lastName,
      name:        `${firstName} ${lastName}`.trim(),
      profile_pic: graphData.profile_pic ?? null,
    });
  }
});
