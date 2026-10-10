/**
 * meta-webhook-client
 *
 * Gateway de entrada de eventos Meta para clientes do C8 Control.
 * Rota: POST /functions/v1/meta-webhook-client
 *       GET  /functions/v1/meta-webhook-client  (verificação)
 *
 * Diferença em relação ao meta-webhook-agency:
 *   • Faz lookup pelo client_id (além do organization_id)
 *   • Persiste em client_channel_* (não em whatsapp_*)
 *   • Usa client_channel_events para idempotência
 *   • Usa get_client_knowledge_context + agent_configs para o bot
 *   • Dispara webhook n8n específico do cliente (não da agência)
 *
 * Variáveis de ambiente necessárias:
 *   META_APP_SECRET, META_VERIFY_TOKEN
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-hub-signature-256",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── HMAC verification ─────────────────────────────────────────────────────────

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const sigBytes = Uint8Array.from(
      signature.replace("sha256=", "").match(/.{1,2}/g)!.map(b => parseInt(b, 16))
    );
    const enc    = new TextEncoder();
    const keyMat = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", keyMat, sigBytes, enc.encode(body));
  } catch {
    return false;
  }
}

// ── Normalização do payload ───────────────────────────────────────────────────

interface MetaEvent {
  page_id?: string;
  instagram_account_id?: string;
  waba_id?: string;
  phone_number_id?: string;
  event_type: string;
  external_event_id: string;
  sender_id: string;
  sender_name?: string;
  sender_phone?: string;
  content?: string;
  media_url?: string;
  media_type?: string;
  message_type: string;
  timestamp: number;
  raw: unknown;
}

function normalizePayload(body: Record<string, unknown>): MetaEvent[] {
  const events: MetaEvent[] = [];
  const object = body.object as string;

  if (object === "whatsapp_business_account") {
    for (const entry of (body.entry as any[]) ?? []) {
      const wabaId = entry.id as string;
      for (const change of (entry.changes as any[]) ?? []) {
        if (change.field !== "messages") continue;
        const value     = change.value as any;
        const phoneNumId = value?.metadata?.phone_number_id as string;
        for (const msg of value?.messages ?? []) {
          events.push({
            waba_id:          wabaId,
            phone_number_id:  phoneNumId,
            event_type:       "whatsapp_message",
            external_event_id: msg.id,
            sender_id:        msg.from,
            sender_name:      value.contacts?.find((c: any) => c.wa_id === msg.from)?.profile?.name,
            sender_phone:     msg.from,
            content:          msg.text?.body ?? msg.caption,
            media_url:        msg.image?.link ?? msg.video?.link ?? msg.audio?.link ?? msg.document?.link,
            media_type:       msg.type,
            message_type:     msg.type ?? "text",
            timestamp:        parseInt(msg.timestamp),
            raw:              msg,
          });
        }
      }
    }
  }

  if (object === "page") {
    for (const entry of (body.entry as any[]) ?? []) {
      const pageId = entry.id as string;
      for (const msg of entry.messaging ?? []) {
        if (!msg.message) continue;
        events.push({
          page_id: pageId,
          event_type: "facebook_dm",
          external_event_id: msg.message.mid,
          sender_id: msg.sender.id,
          content: msg.message.text,
          media_url: msg.message.attachments?.[0]?.payload?.url,
          media_type: msg.message.attachments?.[0]?.type,
          message_type: msg.message.attachments ? msg.message.attachments[0]?.type : "text",
          timestamp: msg.timestamp,
          raw: msg,
        });
      }
      for (const change of entry.changes ?? []) {
        if (change.field !== "feed") continue;
        const v = change.value as any;
        if (v.item === "comment") {
          events.push({
            page_id: pageId,
            event_type: "facebook_comment",
            external_event_id: v.comment_id,
            sender_id: v.from?.id,
            sender_name: v.from?.name,
            content: v.message,
            message_type: "comment",
            timestamp: v.created_time,
            raw: v,
          });
        }
      }
    }
  }

  if (object === "instagram") {
    for (const entry of (body.entry as any[]) ?? []) {
      const igId = entry.id as string;
      for (const msg of entry.messaging ?? []) {
        if (!msg.message) continue;
        events.push({
          instagram_account_id: igId,
          event_type:       "instagram_dm",
          external_event_id: msg.message.mid,
          sender_id:        msg.sender.id,
          content:          msg.message.text,
          message_type:     "text",
          timestamp:        msg.timestamp,
          raw:              msg,
        });
      }
      for (const change of entry.changes ?? []) {
        if (change.field !== "comments") continue;
        const v = change.value as any;
        events.push({
          instagram_account_id: igId,
          event_type:       "instagram_comment",
          external_event_id: v.id,
          sender_id:        v.from?.id,
          sender_name:      v.from?.username,
          content:          v.text,
          message_type:     "comment",
          timestamp:        v.timestamp,
          raw:              v,
        });
      }
    }
  }

  return events;
}

// ── Converte event_type para channel_type ─────────────────────────────────────
function toChannelType(eventType: string): string {
  const map: Record<string, string> = {
    whatsapp_message:   "whatsapp",
    instagram_dm:       "instagram_dm",
    facebook_dm:        "facebook_dm",
    instagram_comment:  "instagram_comment",
    facebook_comment:   "facebook_comment",
  };
  return map[eventType] ?? "whatsapp";
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const appSecret   = Deno.env.get("META_APP_SECRET")!;
  const verifyToken = Deno.env.get("META_VERIFY_TOKEN")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── GET: Verificação do webhook ───────────────────────────────────────────
  if (req.method === "GET") {
    const url       = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge ?? "ok", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();

  // Valida assinatura HMAC
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (appSecret && signature) {
    const valid = await verifySignature(rawBody, signature, appSecret);
    if (!valid) {
      console.error("[meta-webhook-client] HMAC validation failed");
      return json({ error: "Invalid signature" }, 403);
    }
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const events = normalizePayload(body);
  if (events.length === 0) return json({ ok: true, processed: 0 });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let processed = 0;

  for (const event of events) {
    const channelType = toChannelType(event.event_type);

    try {
      // 1. Lookup: meta_connections com client_id (não só organization_id)
      const orClause = [
        event.page_id              ? `facebook_page_id.eq.${event.page_id}` : null,
        event.instagram_account_id ? `instagram_account_id.eq.${event.instagram_account_id}` : null,
        event.waba_id              ? `waba_id.eq.${event.waba_id}` : null,
        event.phone_number_id      ? `whatsapp_phone_number_id.eq.${event.phone_number_id}` : null,
      ].filter(Boolean).join(",");

      if (!orClause) continue;

      const { data: conn } = await admin
        .from("meta_connections")
        .select("organization_id, id")
        .eq("status", "active")
        .or(orClause)
        .maybeSingle();

      if (!conn) {
        console.warn(`[meta-webhook-client] No connection for event ${event.external_event_id}`);
        continue;
      }

      // Busca o client_id através da organização (meta_connections é por organization_id)
      // O client_id é o tenant do C8 Control que tem esse canal configurado
      const { data: client } = await admin
        .from("clients")
        .select("id")
        .eq("organization_id", conn.organization_id)
        .eq("c8_control_enabled", true)
        .maybeSingle();

      if (!client) {
        console.warn(`[meta-webhook-client] No C8 client for org ${conn.organization_id}`);
        continue;
      }

      const clientId = client.id;
      const orgId    = conn.organization_id;

      // 2. Idempotência — verifica se evento já foi processado
      const { data: existingEvent } = await admin
        .from("client_channel_events")
        .select("id, processing_status")
        .eq("client_id", clientId)
        .eq("channel_type", channelType)
        .eq("external_event_id", event.external_event_id)
        .maybeSingle();

      if (existingEvent?.processing_status === "processed") {
        processed++;
        continue;
      }

      // 3. Registra o evento (ou marca como processando)
      const { data: eventRow } = await admin
        .from("client_channel_events")
        .upsert({
          client_id:          clientId,
          organization_id:    orgId,
          meta_connection_id: conn.id,
          external_event_id:  event.external_event_id,
          channel_type:       channelType,
          event_type:         event.event_type,
          raw_payload:        { event } as Record<string, unknown>,
          processing_status:  "pending",
        }, { onConflict: "client_id,channel_type,external_event_id", ignoreDuplicates: false })
        .select("id")
        .single();

      // 4. Busca ou cria contato
      const externalUserId = event.sender_phone ?? event.sender_id;

      let contactId: string | null = null;
      const { data: identity } = await admin
        .from("client_contact_identities")
        .select("contact_id")
        .eq("client_id", clientId)
        .eq("channel_type", channelType)
        .eq("external_user_id", externalUserId)
        .maybeSingle();

      if (identity) {
        contactId = identity.contact_id;
      } else {
        // Cria contato + identidade
        const { data: newContact } = await admin
          .from("client_channel_contacts")
          .insert({
            client_id:      clientId,
            organization_id: orgId,
            display_name:   event.sender_name ?? externalUserId,
            phone:          event.sender_phone,
          })
          .select("id")
          .single();

        if (newContact) {
          contactId = newContact.id;
          await admin.from("client_contact_identities").insert({
            client_id:       clientId,
            organization_id: orgId,
            contact_id:      contactId,
            channel_type:    channelType,
            external_user_id: externalUserId,
            display_name:    event.sender_name,
          });
        }
      }

      // 5. Busca ou cria conversa ativa
      let conversationId: string | null = null;
      const { data: activeConv } = await admin
        .from("client_channel_conversations")
        .select("id, status, bot_active")
        .eq("client_id", clientId)
        .eq("contact_id", contactId)
        .eq("channel_type", channelType)
        .not("status", "in", '("resolved","closed")')
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeConv) {
        conversationId = activeConv.id;
        // Atualiza last_message_at
        await admin.from("client_channel_conversations")
          .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      } else {
        // Cria nova conversa
        const { data: newConv } = await admin
          .from("client_channel_conversations")
          .insert({
            client_id:          clientId,
            organization_id:    orgId,
            channel_type:       channelType,
            meta_connection_id: conn.id,
            external_account_id: event.waba_id ?? event.page_id ?? event.instagram_account_id,
            contact_id:         contactId,
            status:             "open",
            bot_active:         true,
            sla_started_at:     new Date().toISOString(),
            last_message_at:    new Date().toISOString(),
          })
          .select("id")
          .single();

        conversationId = newConv?.id ?? null;
      }

      // 6. Persiste a mensagem
      if (conversationId && event.content) {
        await admin.from("client_channel_messages").insert({
          client_id:          clientId,
          organization_id:    orgId,
          conversation_id:    conversationId,
          external_message_id: event.external_event_id,
          direction:          "inbound",
          sender_type:        "customer",
          sender_name:        event.sender_name,
          channel_type:       channelType,
          message_type:       event.message_type,
          content:            event.content,
          media_url:          event.media_url,
          media_type:         event.media_type,
          meta_timestamp:     event.timestamp,
          delivery_status:    "sent",
        });
      }

      // 7. Marca evento como processado
      if (eventRow?.id) {
        await admin.from("client_channel_events")
          .update({ processing_status: "processed", processed_at: new Date().toISOString() })
          .eq("id", eventRow.id);
      }

      // 8. Dispara webhook n8n do cliente assincronamente
      // Busca a URL do webhook n8n armazenada na organização
      const { data: n8nCfg } = await admin
        .from("organization_integrations")
        .select("config")
        .eq("organization_id", orgId)
        .eq("integration_type", "n8n")
        .maybeSingle();

      const n8nWebhookUrl = (n8nCfg?.config as Record<string, string> | null)?.metaInboundClientWebhookUrl;

      if (n8nWebhookUrl) {
        fetch(n8nWebhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            client_id:          clientId,
            organization_id:    orgId,
            meta_connection_id: conn.id,
            conversation_id:    conversationId,
            contact_id:         contactId,
            event_type:         event.event_type,
            channel_type:       channelType,
            external_event_id:  event.external_event_id,
            sender_id:          event.sender_id,
            sender_phone:       event.sender_phone,
            sender_name:        event.sender_name,
            content:            event.content,
            media_url:          event.media_url,
            media_type:         event.media_type,
            message_type:       event.message_type,
            timestamp:          event.timestamp,
          }),
        }).catch(e => console.error("[meta-webhook-client] n8n dispatch error:", e.message));
      }

      processed++;

    } catch (err: unknown) {
      console.error("[meta-webhook-client] event error:", (err as Error).message, event.external_event_id);
    }
  }

  return json({ ok: true, processed });
});
