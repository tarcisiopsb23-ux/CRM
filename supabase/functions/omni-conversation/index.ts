/**
 * omni-conversation
 *
 * Função unificada para criar/buscar contato e conversa omnichannel.
 * Decide automaticamente se é lado cliente (client_channel_*) ou agência (omni_*)
 * pela presença do campo client_id no body.
 *
 * COM client_id    → cliente C8 Control → tabelas client_channel_contacts,
 *                    client_contact_identities, client_channel_conversations
 *
 * SEM client_id   → agência             → tabelas omni_contacts,
 *                    omni_contact_identities, omni_conversations
 *
 * POST /functions/v1/omni-conversation
 * Headers: Authorization: Bearer <service_role_key>
 *
 * Body: {
 *   organization_id:      string,   -- obrigatório
 *   channel_type:         string,   -- 'instagram' | 'facebook' | 'whatsapp'
 *   external_user_id:     string,   -- ID externo do usuário (ig_user_id, phone, psid)
 *   display_name?:        string,   -- nome do usuário
 *   username?:            string,   -- @username
 *   connection_id?:       string,   -- meta_connection_id
 *   external_account_id?: string,   -- meu_id (instagram_account_id, page_id, waba_id)
 *   bot_active?:          boolean,  -- default true
 *   client_id?:           string,   -- se presente: lado cliente; ausente: agência
 * }
 *
 * Response: {
 *   contact_id:       string,
 *   conversation_id:  string,
 *   status:           string,
 *   created:          boolean,  -- true se conversa foi criada agora
 *   side:             'client' | 'agency',
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ── Normaliza channel_type canônico para valor armazenado nas tabelas ─────────

function normalizeChannel(channel: string): string {
  // Contatos: sempre canônico (instagram, facebook, whatsapp)
  if (["instagram", "instagram_dm", "instagram_comment"].includes(channel)) return "instagram";
  if (["facebook", "facebook_dm", "facebook_comment"].includes(channel))   return "facebook";
  return "whatsapp";
}

function normalizeChannelConv(channel: string): string {
  // Conversas: tabelas antigas usam instagram_dm, facebook_dm
  if (["instagram", "instagram_dm", "instagram_comment"].includes(channel)) return "instagram_dm";
  if (["facebook", "facebook_dm", "facebook_comment"].includes(channel))    return "facebook_dm";
  return "whatsapp";
}

// ── Lado CLIENTE ──────────────────────────────────────────────────────────────

async function handleClient(
  admin: ReturnType<typeof createClient>,
  params: {
    organization_id: string;
    client_id: string;
    channel_type: string;
    external_user_id: string;
    display_name?: string;
    username?: string;
    connection_id?: string;
    external_account_id?: string;
    bot_active: boolean;
  }
) {
  const {
    organization_id, client_id, channel_type,
    external_user_id, display_name, username,
    connection_id, external_account_id, bot_active,
  } = params;

  const channelContact = normalizeChannel(channel_type);
  const channelConv    = normalizeChannelConv(channel_type);

  // 1. Upsert contato via RPC
  const { data: contactData, error: contactErr } = await (admin.rpc as any)(
    "upsert_client_contact_identity",
    {
      p_client_id:        client_id,
      p_organization_id:  organization_id,
      p_channel_type:     channelContact,
      p_external_user_id: external_user_id,
      p_display_name:     display_name ?? null,
      p_username:         username ?? null,
    }
  );

  if (contactErr) throw new Error(`contact_upsert_failed: ${contactErr.message}`);
  const contact_id = contactData?.contact_id ?? contactData;

  // 2. Busca conversa ativa existente
  const { data: existingConv } = await admin
    .from("client_channel_conversations")
    .select("id, status, assigned_agent_id")
    .eq("omni_contact_id", contact_id)
    .eq("channel_type", channelConv)
    .eq("client_id", client_id)
    .not("status", "in", '("resolved","closed")')
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existingConv) {
    return {
      contact_id,
      conversation_id:  existingConv.id,
      status:           existingConv.status,
      assigned_agent_id: existingConv.assigned_agent_id,
      created:          false,
      side:             "client",
    };
  }

  // 3. Cria nova conversa
  const { data: newConv, error: convErr } = await admin
    .from("client_channel_conversations")
    .insert({
      client_id,
      organization_id,
      channel_type:        channelConv,
      meta_connection_id:  connection_id ?? null,
      external_account_id: external_account_id ?? null,
      omni_contact_id:     contact_id,
      contact_id,
      status:              "open",
      bot_active,
    })
    .select("id, status, assigned_agent_id")
    .single();

  if (convErr) throw new Error(`conversation_insert_failed: ${convErr.message}`);

  return {
    contact_id,
    conversation_id:   newConv.id,
    status:            newConv.status,
    assigned_agent_id: newConv.assigned_agent_id,
    created:           true,
    side:              "client",
  };
}

// ── Lado AGÊNCIA ──────────────────────────────────────────────────────────────

async function handleAgency(
  admin: ReturnType<typeof createClient>,
  params: {
    organization_id: string;
    channel_type: string;
    external_user_id: string;
    display_name?: string;
    username?: string;
    connection_id?: string;
  }
) {
  const {
    organization_id, channel_type,
    external_user_id, display_name, username,
    connection_id,
  } = params;

  const channelContact = normalizeChannel(channel_type);
  const channelConv    = normalizeChannelConv(channel_type);

  // 1. Upsert contato via RPC
  const { data: contactData, error: contactErr } = await (admin.rpc as any)(
    "upsert_omni_contact_identity",
    {
      p_organization_id:  organization_id,
      p_channel_type:     channelContact,
      p_external_user_id: external_user_id,
      p_display_name:     display_name ?? null,
      p_username:         username ?? null,
    }
  );

  if (contactErr) throw new Error(`contact_upsert_failed: ${contactErr.message}`);
  const contact_id = contactData?.contact_id ?? contactData;

  // 2. Busca conversa ativa existente via RPC
  const { data: convData, error: convErr } = await (admin.rpc as any)(
    "get_or_create_agency_conversation",
    {
      p_omni_contact_id:    contact_id,
      p_channel_type:       channelContact,
      p_organization_id:    organization_id,
      p_meta_connection_id: connection_id ?? null,
    }
  );

  if (convErr) throw new Error(`conversation_failed: ${convErr.message}`);

  return {
    contact_id,
    conversation_id:   convData.conversation_id,
    status:            convData.status,
    assigned_agent_id: convData.assigned_agent_id,
    display_name:      convData.display_name,
    username:          convData.username,
    created:           convData.created,
    side:              "agency",
  };
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader  = req.headers.get("Authorization") ?? "";
  const apiKeyHeader = req.headers.get("apikey") ?? "";
  const userToken   = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader || apiKeyHeader;

  if (!userToken) return json({ error: "Não autorizado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Valida token
  let authorized = false;
  try {
    const parts = userToken.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.role === "service_role" || payload.role === "anon") authorized = true;
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

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const {
    organization_id,
    channel_type,
    external_user_id,
    display_name,
    username,
    connection_id,
    external_account_id,
    bot_active = true,
    client_id,
  } = body as Record<string, string>;

  if (!organization_id || !channel_type || !external_user_id) {
    return json({ error: "organization_id, channel_type e external_user_id são obrigatórios" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (client_id) {
      // ── Lado cliente ──────────────────────────────────────────────────────
      const result = await handleClient(admin, {
        organization_id,
        client_id,
        channel_type,
        external_user_id,
        display_name,
        username,
        connection_id,
        external_account_id,
        bot_active: bot_active === true || (bot_active as unknown) === "true",
      });
      return json(result);
    } else {
      // ── Lado agência ──────────────────────────────────────────────────────
      const result = await handleAgency(admin, {
        organization_id,
        channel_type,
        external_user_id,
        display_name,
        username,
        connection_id,
      });
      return json(result);
    }
  } catch (err: unknown) {
    const msg = (err as Error).message;
    console.error("[omni-conversation] error:", msg);
    return json({ error: msg }, 500);
  }
});
