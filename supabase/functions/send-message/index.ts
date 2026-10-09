/**
 * send-message
 *
 * Envia mensagem via Meta Graph API para WhatsApp, Instagram DM ou Facebook DM.
 * Usa meta-credential-provider internamente para resolver o token correto.
 *
 * Suporta:
 *   • Texto simples
 *   • Mídia (imagem, vídeo, áudio, documento)
 *   • Templates WhatsApp aprovados pela Meta
 *   • Reações
 *   • Respostas a mensagens específicas (reply_to)
 *   • Comentários em posts Facebook/Instagram
 *
 * POST /functions/v1/send-message
 * Headers: Authorization: Bearer <JWT da agência ou do cliente C8>
 *
 * Body: {
 *   connection_id:   string,    -- ID da meta_connection
 *   organization_id: string,    -- para lookup de permissão
 *   channel_type:    string,    -- "whatsapp" | "instagram_dm" | "facebook_dm" | "instagram_comment" | "facebook_comment"
 *   recipient_id:    string,    -- phone (WA) ou PSID (FB/IG)
 *   message_type:    string,    -- "text" | "image" | "video" | "audio" | "document" | "template" | "reaction" | "comment_reply"
 *   content:         string,    -- texto ou URL de mídia
 *   reply_to_id?:    string,    -- external_message_id para reply
 *   template_name?:  string,    -- nome do template WhatsApp
 *   template_params?: object,   -- parâmetros do template
 *   post_id?:        string,    -- para comment_reply (facebook_comment / instagram_comment)
 *   comment_id?:     string,    -- para responder comentário específico
 *   -- Contexto de persistência (opcional)
 *   conversation_id?: string,   -- para registrar na conversa
 *   client_id?:       string,   -- se for mensagem de cliente C8
 * }
 *
 * Response: { success: boolean, message_id?: string, error?: string }
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
  serviceKey: string
): Promise<string> {
  const internalSecret = Deno.env.get("INTERNAL_SECRET");
  if (!internalSecret) throw new Error("INTERNAL_SECRET not configured");

  const res = await fetch(`${supabaseUrl}/functions/v1/meta-credential-provider`, {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
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

// ── Builders de payload por tipo de mensagem ──────────────────────────────────

function buildWhatsAppPayload(
  recipientId: string,
  messageType: string,
  content: string,
  replyToId?: string,
  templateName?: string,
  templateParams?: Record<string, unknown>
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                recipientId,
  };

  if (replyToId) {
    base.context = { message_id: replyToId };
  }

  switch (messageType) {
    case "text":
      base.type = "text";
      base.text = { body: content, preview_url: false };
      break;
    case "image":
      base.type  = "image";
      base.image = content.startsWith("http") ? { link: content } : { id: content };
      break;
    case "video":
      base.type  = "video";
      base.video = content.startsWith("http") ? { link: content } : { id: content };
      break;
    case "audio":
      base.type  = "audio";
      base.audio = content.startsWith("http") ? { link: content } : { id: content };
      break;
    case "document":
      base.type     = "document";
      base.document = content.startsWith("http") ? { link: content } : { id: content };
      break;
    case "template":
      base.type     = "template";
      base.template = {
        name:      templateName ?? content,
        language:  { code: "pt_BR" },
        components: templateParams?.components ?? [],
      };
      break;
    case "reaction":
      base.type     = "reaction";
      base.reaction = { message_id: replyToId ?? "", emoji: content };
      break;
    default:
      base.type = "text";
      base.text = { body: content };
  }

  return base;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userToken  = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!userToken) return json({ error: "Não autorizado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verifica JWT
  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) return json({ error: "Não autorizado" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const {
    connection_id,
    organization_id,
    channel_type,
    recipient_id,
    message_type = "text",
    content,
    reply_to_id,
    template_name,
    template_params,
    post_id,
    comment_id,
    conversation_id,
    client_id,
  } = body as Record<string, string>;

  if (!connection_id || !organization_id || !recipient_id || !channel_type) {
    return json({ error: "connection_id, organization_id, recipient_id e channel_type são obrigatórios" }, 400);
  }

  if (!content && message_type !== "reaction") {
    return json({ error: "content é obrigatório" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verifica permissão — conexão pertence à organização
  const { data: conn } = await admin
    .from("meta_connections")
    .select("id, provider, whatsapp_phone_number_id, facebook_page_id, instagram_account_id")
    .eq("id", connection_id)
    .eq("organization_id", organization_id)
    .eq("status", "active")
    .maybeSingle();

  if (!conn) return json({ error: "Conexão não encontrada ou inativa" }, 404);

  // Resolve o access token
  let accessToken: string;
  try {
    accessToken = await resolveToken(connection_id, organization_id, supabaseUrl, serviceKey);
  } catch (e: unknown) {
    return json({ error: `token_resolution_failed: ${(e as Error).message}` }, 400);
  }

  let graphUrl   = "";
  let payload: Record<string, unknown> = {};
  let messageId: string | null = null;

  try {
    // ── WhatsApp ─────────────────────────────────────────────────────────────
    if (channel_type === "whatsapp") {
      if (!conn.whatsapp_phone_number_id) {
        return json({ error: "phone_number_id não configurado na conexão" }, 400);
      }
      graphUrl = `${GRAPH}/${conn.whatsapp_phone_number_id}/messages`;
      payload  = buildWhatsAppPayload(
        recipient_id, message_type, content,
        reply_to_id, template_name,
        template_params ? JSON.parse(typeof template_params === "string" ? template_params : JSON.stringify(template_params)) : undefined
      );
    }

    // ── Facebook DM (Messenger) ───────────────────────────────────────────────
    else if (channel_type === "facebook_dm") {
      if (!conn.facebook_page_id) return json({ error: "page_id não configurado" }, 400);
      graphUrl = `${GRAPH}/${conn.facebook_page_id}/messages`;
      payload  = {
        recipient:        { id: recipient_id },
        message:          { text: content },
        messaging_type:   "RESPONSE",
      };
    }

    // ── Instagram DM ─────────────────────────────────────────────────────────
    else if (channel_type === "instagram_dm") {
      if (!conn.instagram_account_id) return json({ error: "instagram_account_id não configurado" }, 400);
      graphUrl = `${GRAPH}/${conn.instagram_account_id}/messages`;
      payload  = {
        recipient: { id: recipient_id },
        message:   { text: content },
      };
    }

    // ── Facebook Comment Reply ────────────────────────────────────────────────
    else if (channel_type === "facebook_comment") {
      const targetId = comment_id ?? post_id;
      if (!targetId) return json({ error: "comment_id ou post_id obrigatório" }, 400);
      graphUrl = `${GRAPH}/${targetId}/comments`;
      payload  = { message: content };
    }

    // ── Instagram Comment Reply ───────────────────────────────────────────────
    else if (channel_type === "instagram_comment") {
      const targetId = comment_id ?? post_id;
      if (!targetId) return json({ error: "comment_id ou post_id obrigatório" }, 400);
      graphUrl = `${GRAPH}/${targetId}/replies`;
      payload  = { message: content };
    }

    else {
      return json({ error: `channel_type '${channel_type}' não suportado` }, 400);
    }

    // ── Chamada à Graph API ───────────────────────────────────────────────────
    const url = new URL(graphUrl);
    url.searchParams.set("access_token", accessToken);

    const graphRes = await fetch(url.toString(), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    const graphData = await graphRes.json() as Record<string, unknown>;

    if (!graphRes.ok || graphData.error) {
      const errMsg = (graphData.error as Record<string, string>)?.message ?? "Graph API error";
      console.error("[send-message] Graph API error:", JSON.stringify(graphData.error));
      return json({ success: false, error: errMsg }, 400);
    }

    messageId = (graphData.messages as Array<{ id: string }>)?.[0]?.id
             ?? (graphData as { message_id?: string }).message_id
             ?? (graphData as { id?: string }).id
             ?? null;

    // ── Persiste mensagem enviada no banco ────────────────────────────────────
    if (conversation_id && messageId) {
      const msgTable   = client_id ? "client_channel_messages"  : "whatsapp_messages";
      const insertData = client_id
        ? {
            client_id,
            organization_id,
            conversation_id,
            external_message_id: messageId,
            direction:           "outbound",
            sender_type:         "human",
            channel_type,
            message_type,
            content,
            delivery_status:     "sent",
          }
        : {
            organization_id,
            conversation_id,
            direction:       "outbound",
            content,
            external_id:     messageId,
            sender_type:     "human",
            channel_type,
            message_type,
            delivery_status: "sent",
          };

      await admin.from(msgTable as any).insert(insertData);
    }

    return json({ success: true, message_id: messageId });

  } catch (err: unknown) {
    const msg = (err as Error).message;
    console.error("[send-message] error:", msg);
    return json({ success: false, error: msg }, 500);
  }
});
