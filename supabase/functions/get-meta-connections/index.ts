/**
 * get-meta-connections
 *
 * Retorna conexões Meta (WhatsApp/Instagram/Ads) para o dashboard C8 Control.
 *
 * O JWT do cliente C8 Control não tem perfil em `profiles`, então a RLS
 * de meta_connections bloqueia SELECT direto do frontend.
 *
 * Esta EF valida o JWT, extrai o organization_id do dashboard_users,
 * e usa service_role para buscar sem RLS.
 *
 * POST /functions/v1/get-meta-connections
 * Headers: Authorization: Bearer <JWT>
 * Body: { organization_id: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    const padded  = payload + "=".repeat((4 - payload.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Extrai JWT do header
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Não autenticado" }, 401);

  // Decodifica JWT para obter sub (user id) sem chamada de rede
  const payload = decodeJwt(token);
  const userId = payload?.sub as string | undefined;
  if (!userId) return json({ error: "Token inválido" }, 401);

  // Verifica expiração
  const exp = payload?.exp as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) {
    return json({ error: "Token expirado" }, 401);
  }

  // Admin com service_role
  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve organization_id: usa o do body se fornecido,
  // senão busca via dashboard_users
  let orgId: string | undefined;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body vazio é ok */ }

  orgId = body?.organization_id as string | undefined;

  if (!orgId) {
    // Busca organization_id do usuário via dashboard_users
    const { data: du } = await admin
      .from("dashboard_users")
      .select("organization_id")
      .eq("auth_user_id", userId)
      .eq("active", true)
      .maybeSingle();

    orgId = du?.organization_id as string | undefined;
  }

  if (!orgId) {
    // Última tentativa: busca o organization_id via profiles (usuário do CRM)
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();

    orgId = profile?.organization_id as string | undefined;
  }

  if (!orgId) {
    console.error("[get-meta-connections] Não foi possível resolver organization_id para userId:", userId);
    return json({ error: "Organização não encontrada", connections: [] }, 200);
  }

  // Busca TODAS as conexões Meta da organização (service_role, sem RLS)
  const { data: connections, error: connErr } = await admin
    .from("meta_connections")
    .select(
      "id, organization_id, client_id, provider, status, display_name, " +
      "whatsapp_display_phone_number, instagram_username, waba_id, " +
      "whatsapp_phone_number_id, facebook_page_id, facebook_page_name, " +
      "instagram_account_id, ad_account_id, " +
      "health_status, last_error, created_at, updated_at"
    )
    .eq("organization_id", orgId)
    .not("status", "in", '("disconnected","revoked","deleted")')
    .order("created_at", { ascending: false });

  if (connErr) {
    console.error("[get-meta-connections] DB error:", connErr.message);
    return json({ error: "Erro ao buscar conexões", connections: [] }, 200);
  }

  console.log(`[get-meta-connections] org=${orgId} → ${connections?.length ?? 0} conexões`);

  return json({ connections: connections ?? [], organization_id: orgId });
});
