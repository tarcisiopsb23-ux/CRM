/**
 * get-meta-connections
 *
 * Retorna conexões Meta (WhatsApp/Instagram/Facebook/Ads) para o dashboard.
 * Funciona tanto para usuários do CRM (agência) quanto do C8 Control (cliente).
 *
 * Usa service_role para contornar RLS — necessário pois usuários C8 Control
 * não têm perfil em `profiles` e a RLS usa get_user_organization_id().
 *
 * POST /functions/v1/get-meta-connections
 * Body: { organization_id: string }
 * (sem autenticação obrigatória — dados de conexão não são sensíveis)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Lê organization_id e client_id do body
  let organization_id: string | undefined;
  let client_id:       string | undefined;
  try {
    const body = await req.json();
    organization_id = body?.organization_id as string | undefined;
    client_id       = body?.client_id       as string | undefined; // NOVO
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  if (!organization_id) {
    return json({ error: "organization_id é obrigatório" }, 400);
  }

  // Admin com service_role — ignora RLS completamente
  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Busca TODAS as conexões Meta da organização
  let q = admin
    .from("meta_connections")
    .select(
      "id, organization_id, client_id, provider, status, display_name, " +
      "whatsapp_display_phone_number, instagram_username, waba_id, " +
      "whatsapp_phone_number_id, facebook_page_id, facebook_page_name, " +
      "instagram_account_id, ad_account_id, " +
      "health_status, last_error, created_at, updated_at, " +
      "connection_method, use_agency_token"
    )
    .eq("organization_id", organization_id)
    .not("status", "in", '("deleted")');

  if (client_id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(client_id)) {
      return json({ error: "client_id inválido" }, 400);
    }
    q = q.or(`client_id.eq.${client_id},client_id.is.null`);
  }

  const { data: connections, error } = await q
    .order("status", { ascending: false })  // active primeiro
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[get-meta-connections] DB error:", error.message);
    return json({ connections: [], error: error.message }, 500);
  }

  console.log(`[get-meta-connections] org=${organization_id} → ${connections?.length ?? 0} conexões`);

  return json({ connections: connections ?? [] });
});
