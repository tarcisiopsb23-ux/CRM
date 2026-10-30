/**
 * resolve-igsid
 *
 * Resolve o Instagram-Scoped User ID (IGSID) de um usuário a partir do
 * seu ID público (from.id) recebido no webhook de comentários.
 *
 * Estratégia:
 *   1. Busca o token da conexão via meta-credential-provider
 *   2. Tenta GET /{instagram_account_id}/conversations?user_id={from_id}&platform=instagram
 *      → se encontrar, retorna o IGSID da conversa existente
 *   3. Se não encontrar conversa, tenta GET /{from_id}?fields=id,username,name
 *      → em contas Business, o from.id do comentário já é o IGSID
 *   4. Retorna o IGSID resolvido ou o from_id original como fallback
 *
 * POST /functions/v1/resolve-igsid
 * Headers: Authorization: Bearer <service_role_key>
 *
 * Body: {
 *   connection_id:        string,  -- ID da meta_connection
 *   organization_id:      string,  -- para lookup de permissão
 *   from_id:              string,  -- ID do from.id do webhook de comentário
 *   instagram_account_id: string,  -- meu_id (ID da conta Instagram)
 * }
 *
 * Response: {
 *   igsid:    string,   -- IGSID resolvido (ou from_id se não resolvido)
 *   resolved: boolean,  -- true se encontrou via conversa existente
 *   source:   string,   -- "conversation" | "direct" | "fallback"
 * }
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

  const { connection_id, organization_id, from_id, instagram_account_id } = body;

  if (!connection_id || !organization_id || !from_id || !instagram_account_id) {
    return json({
      error: "connection_id, organization_id, from_id e instagram_account_id são obrigatórios"
    }, 400);
  }

  // Resolve access token
  let accessToken: string;
  try {
    accessToken = await resolveToken(connection_id, organization_id, supabaseUrl);
  } catch (e: unknown) {
    return json({ error: `token_resolution_failed: ${(e as Error).message}` }, 400);
  }

  // ── Estratégia 1: busca via conversa existente ────────────────────────────
  // GET /{instagram_account_id}/conversations?user_id={from_id}&platform=instagram
  try {
    const convUrl = new URL(`${GRAPH}/${instagram_account_id}/conversations`);
    convUrl.searchParams.set("user_id", from_id);
    convUrl.searchParams.set("platform", "instagram");
    convUrl.searchParams.set("fields", "participants");
    convUrl.searchParams.set("access_token", accessToken);

    const convRes  = await fetch(convUrl.toString());
    const convData = await convRes.json() as Record<string, unknown>;

    if (convRes.ok && convData.data) {
      const conversations = convData.data as Array<{
        participants?: { data?: Array<{ id: string; username?: string }> }
      }>;

      // Percorre participantes das conversas para encontrar o IGSID do usuário
      for (const conv of conversations) {
        const participants = conv.participants?.data ?? [];
        for (const p of participants) {
          // O IGSID do usuário é o participante que não é a nossa conta
          if (p.id !== instagram_account_id) {
            return json({
              igsid:    p.id,
              resolved: true,
              source:   "conversation",
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn("[resolve-igsid] conversation lookup failed:", (e as Error).message);
  }

  // ── Estratégia 2: busca direta pelo from_id ───────────────────────────────
  // Em contas Business, o from.id do comentário já é o IGSID
  try {
    const userUrl = new URL(`${GRAPH}/${from_id}`);
    userUrl.searchParams.set("fields", "id,username,name");
    userUrl.searchParams.set("access_token", accessToken);

    const userRes  = await fetch(userUrl.toString());
    const userData = await userRes.json() as Record<string, unknown>;

    if (userRes.ok && userData.id) {
      return json({
        igsid:    userData.id as string,
        resolved: true,
        source:   "direct",
        username: userData.username,
        name:     userData.name,
      });
    }
  } catch (e) {
    console.warn("[resolve-igsid] direct lookup failed:", (e as Error).message);
  }

  // ── Fallback: retorna o from_id original ─────────────────────────────────
  // Pode já ser o IGSID correto — deixa a tentativa de envio decidir
  return json({
    igsid:    from_id,
    resolved: false,
    source:   "fallback",
  });
});
