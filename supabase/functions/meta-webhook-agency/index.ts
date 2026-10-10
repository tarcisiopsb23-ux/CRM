/**
 * meta-webhook-agency
 *
 * Gateway de entrada de eventos Meta para a AGÊNCIA (Maestr.IA CRM).
 * Rota: POST /functions/v1/meta-webhook-agency
 *       GET  /functions/v1/meta-webhook-agency  (verificação do webhook)
 *
 * Responsabilidades:
 *   1. Responder ao handshake de verificação da Meta (GET)
 *   2. Validar assinatura HMAC-SHA256 (X-Hub-Signature-256)
 *   3. Lookup: page_id / waba_id / instagram_account_id → organization_id via meta_connections
 *   4. Normalizar o evento para estrutura unificada
 *   5. Persistir em whatsapp_messages (deduplicação por external_id)
 *   6. Disparar webhook n8n da organização para processamento assíncrono
 *   7. Retornar 200 imediatamente (Meta exige < 20s)
 *
 * Variáveis de ambiente necessárias:
 *   META_APP_SECRET        — para validação HMAC
 *   META_VERIFY_TOKEN      — token para handshake de verificação
 *   SUPABASE_URL           — auto-injetado
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injetado
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

// ── HMAC-SHA256 verification ──────────────────────────────────────────────────

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const sigBytes = Uint8Array.from(
      signature.replace("sha256=", "").match(/.{1,2}/g)!.map(b => parseInt(b, 16))
    );
    const enc     = new TextEncoder();
    const keyMat  = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", keyMat, sigBytes, enc.encode(body));
  } catch {
    return false;
  }
}

// ── Extrai asset IDs do payload Meta para lookup ──────────────────────────────

interface MetaEvent {
  page_id?: string;
  instagram_account_id?: string;
  waba_id?: string;
  phone_number_id?: string;
  event_type: string;       // "whatsapp_message" | "instagram_dm" | "facebook_dm" | "comment"
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

function normalizeWebhookPayload(body: Record<string, unknown>): MetaEvent[] {
  const events: MetaEvent[] = [];
  const object = body.object as string;

  if (object === "whatsapp_business_account") {
    for (const entry of (body.entry as any[]) ?? []) {
      const wabaId = entry.id as string;
      for (const change of (entry.changes as any[]) ?? []) {
        if (change.field !== "messages") continue;
        const value = change.value as any;
        const phoneNumberId = value?.metadata?.phone_number_id as string;
        for (const msg of value?.messages ?? []) {
          events.push({
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            event_type: "whatsapp_message",
            external_event_id: msg.id,
            sender_id: msg.from,
            sender_name: value.contacts?.find((c: any) => c.wa_id === msg.from)?.profile?.name,
            sender_phone: msg.from,
            content: msg.text?.body ?? msg.caption,
            media_url: msg.image?.link ?? msg.video?.link ?? msg.audio?.link ?? msg.document?.link,
            media_type: msg.type,
            message_type: msg.type ?? "text",
            timestamp: parseInt(msg.timestamp),
            raw: msg,
          });
        }
      }
    }
  }

  if (object === "page") {
    for (const entry of (body.entry as any[]) ?? []) {
      const pageId = entry.id as string;
      // DMs via Messenger
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
      // Comentários
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
      // DMs
      for (const msg of entry.messaging ?? []) {
        if (!msg.message) continue;
        events.push({
          instagram_account_id: igId,
          event_type: "instagram_dm",
          external_event_id: msg.message.mid,
          sender_id: msg.sender.id,
          content: msg.message.text,
          message_type: "text",
          timestamp: msg.timestamp,
          raw: msg,
        });
      }
      // Comentários
      for (const change of entry.changes ?? []) {
        if (change.field !== "comments") continue;
        const v = change.value as any;
        events.push({
          instagram_account_id: igId,
          event_type: "instagram_comment",
          external_event_id: v.id,
          sender_id: v.from?.id,
          sender_name: v.from?.username,
          content: v.text,
          message_type: "comment",
          timestamp: v.timestamp,
          raw: v,
        });
      }
    }
  }

  return events;
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const appSecret   = Deno.env.get("META_APP_SECRET")!;
  const verifyToken = Deno.env.get("META_VERIFY_TOKEN")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── GET: Handshake de verificação ─────────────────────────────────────────
  if (req.method === "GET") {
    const url     = new URL(req.url);
    const mode    = url.searchParams.get("hub.mode");
    const token   = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge ?? "ok", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── POST: Evento da Meta ──────────────────────────────────────────────────

  const rawBody = await req.text();

  // Valida assinatura HMAC
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (appSecret && signature) {
    const valid = await verifySignature(rawBody, signature, appSecret);
    if (!valid) {
      console.error("[meta-webhook-agency] HMAC validation failed");
      return json({ error: "Invalid signature" }, 403);
    }
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const events = normalizeWebhookPayload(body);
  if (events.length === 0) return json({ ok: true, processed: 0 });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let processed = 0;

  for (const event of events) {
    try {
      // 1. Lookup: encontra organization_id pelo asset
      const { data: conn } = await admin
        .from("meta_connections")
        .select("organization_id, id")
        .eq("status", "active")
        .or([
          event.page_id              ? `facebook_page_id.eq.${event.page_id}` : null,
          event.instagram_account_id ? `instagram_account_id.eq.${event.instagram_account_id}` : null,
          event.waba_id              ? `waba_id.eq.${event.waba_id}` : null,
          event.phone_number_id      ? `whatsapp_phone_number_id.eq.${event.phone_number_id}` : null,
        ].filter(Boolean).join(","))
        .maybeSingle();

      if (!conn) {
        console.warn(`[meta-webhook-agency] No connection found for event: ${event.event_type} ${event.external_event_id}`);
        continue;
      }

      const { organization_id } = conn;

      // 2. Busca contato existente ou cria
      let contactId: string | null = null;
      const { data: existingContact } = await admin
        .from("whatsapp_contacts")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("phone", event.sender_phone ?? event.sender_id)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        // Cria contato + lead via RPC existente
        const { data: rpcResult } = await admin.rpc("process_incoming_whatsapp_message", {
          p_organization_id:    organization_id,
          p_phone:              event.sender_phone ?? event.sender_id,
          p_contact_name:       event.sender_name ?? null,
          p_message_content:    event.content ?? null,
          p_message_external_id: event.external_event_id,
          p_direction:          "inbound",
        });
        if (rpcResult?.ok) {
          contactId = rpcResult.contact_id;
        }
      }

      // 3. Para WhatsApp: persiste mensagem com todos os novos campos
      if (event.event_type === "whatsapp_message" && event.sender_phone) {
        // A RPC já persistiu se o contato era novo. Para contatos existentes, inserimos:
        if (existingContact) {
          const { data: conv } = await admin
            .from("whatsapp_conversations")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("contact_id", contactId)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (conv) {
            await admin.from("whatsapp_messages").insert({
              organization_id,
              conversation_id: conv.id,
              direction:       "inbound",
              content:         event.content,
              external_id:     event.external_event_id,
              sender_type:     "customer",
              channel_type:    "whatsapp",
              message_type:    event.message_type,
              media_url:       event.media_url,
              media_type:      event.media_type,
              meta_timestamp:  event.timestamp,
            }).onConflict("conversation_id, external_id");
          }
        }
      }

      // 4. Busca webhook n8n da organização e dispara assincronamente
      const { data: n8nCfg } = await admin
        .from("organization_integrations")
        .select("config")
        .eq("organization_id", organization_id)
        .eq("integration_type", "n8n")
        .maybeSingle();

      const webhookUrl = (n8nCfg?.config as Record<string, string> | null)?.metaInboundAgencyWebhookUrl;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            organization_id,
            meta_connection_id: conn.id,
            event_type:         event.event_type,
            external_event_id:  event.external_event_id,
            sender_id:          event.sender_id,
            sender_phone:       event.sender_phone,
            sender_name:        event.sender_name,
            content:            event.content,
            media_url:          event.media_url,
            media_type:         event.media_type,
            message_type:       event.message_type,
            timestamp:          event.timestamp,
            contact_id:         contactId,
          }),
        }).catch(e => console.error("[meta-webhook-agency] n8n dispatch error:", e.message));
      }

      processed++;
    } catch (err: unknown) {
      console.error("[meta-webhook-agency] event error:", (err as Error).message);
    }
  }

  // Meta exige sempre 200 (senão re-envia)
  return json({ ok: true, processed });
});
