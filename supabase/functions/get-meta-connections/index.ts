/**
 * get-meta-connections
 *
 * Retorna as conexões Meta (WhatsApp/Instagram) para o dashboard do cliente C8 Control.
 *
 * O JWT do cliente C8 Control NÃO tem perfil em `profiles`, então a RLS de
 * meta_connections_safe bloqueia o SELECT diretamente do frontend.
 * Esta EF valida o JWT via dashboard_users e usa service_role para buscar.
 *
 * POST /functions/v1/get-meta-connections
 * Headers: Authorization: Bearer <JWT do cliente C8 Control>
 * Body: { organization_id: string }
 *
 * Response: { connections: MetaConnectionSafe[] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Valida JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Não autenticado" }, 401);

  // Verifica sessão via anon client (valida o token)
  const anonClient = createClient(SUPA_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return json({ error: "Token inválido" }, 401);

  // Lê organization_id do body
  let organization_id: string | undefined;
  try {
    const body = await req.json();
    organization_id = body?.organization_id;
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!organization_id) return json({ error: "organization_id é obrigatório" }, 400);

  // Admin client com service_role — ignora RLS
  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Valida que o user.id pertence a um dashboard_user dessa organização
  const { data: du } = await admin
    .from("dashboard_users")
    .select("id, organization_id, active")
    .eq("auth_user_id", user.id)
    .eq("organization_id", organization_id)
    .eq("active", true)
    .maybeSingle();

  if (!du) {
    // Tenta sem filtrar por organization_id (o du pode ter um org diferente)
    const { data: duAny } = await admin
      .from("dashboard_users")
      .select("id, organization_id, active")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!duAny) return json({ error: "Usuário não autorizado" }, 403);

    // Usa o organization_id do dashboard_user, não o do body
    organization_id = duAny.organization_id as string;
  }

  // Busca conexões Meta usando service_role (sem RLS)
  const { data: connections, error: connErr } = await admin
    .from("meta_connections_safe")
    .select("id, organization_id, client_id, provider, status, display_name, " +
            "whatsapp_display_phone_number, instagram_username, waba_id, " +
            "whatsapp_phone_number_id, health_status, last_error, " +
            "token_is_set, created_at, updated_at")
    .eq("organization_id", organization_id)
    .not("status", "in", '("disconnected","revoked")')
    .order("created_at", { ascending: false });

  if (connErr) {
    console.error("[get-meta-connections] Error:", connErr);
    return json({ error: "Erro ao buscar conexões" }, 500);
  }

  return json({ connections: connections ?? [] });
});
