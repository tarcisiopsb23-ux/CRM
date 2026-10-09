/**
 * Edge Function: track-conversion
 *
 * API de Conversões server-side — recebe eventos do browser (ou de outras
 * Edge Functions) e os encaminha para:
 *   • Meta Conversions API (Graph API /events)
 *   • Google Measurement Protocol (GA4)
 *
 * Persiste cada evento em client_tracking_events (Banco A) com status de envio.
 *
 * Pode ser chamada:
 *   1. Pelo browser diretamente (sem auth — usa anon key + slug)
 *   2. Por outra Edge Function (sem auth — usa service_role internamente)
 *
 * Fluxo:
 *   1. Valida payload
 *   2. Resolve client_id + organization_id via slug
 *   3. Lê meta_pixel_id de client_ai_settings
 *   4. Lê ga4_measurement_id + ga4_api_secret de client_gtm_settings
 *   5. Lê access_token Meta de oauth_tokens (ou meta_capi_token de client_gtm_settings)
 *   6. Aplica SHA-256 nos dados PII
 *   7. Envia para Meta Conversions API
 *   8. Envia para Google Measurement Protocol
 *   9. Persiste em client_tracking_events
 *   10. Retorna resultado
 *
 * Secrets necessários (Supabase → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.toLowerCase().trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Normalização de telefone (E.164 parcial) ─────────────────────────────────
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return "55" + digits;
  return digits;
}

// ─── GeoIP simples (falha silenciosamente) ────────────────────────────────────
async function getCity(ip: string): Promise<string | null> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::") || ip.startsWith("10.") || ip.startsWith("192.168.")) return null;
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const d = await res.json() as Record<string, unknown>;
    return (d.city as string) ?? null;
  } catch {
    return null;
  }
}

// ─── User-Agent parser ────────────────────────────────────────────────────────
function parseUA(ua: string) {
  const device = /Mobile|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
  let browser = "other";
  if (/Chrome/i.test(ua) && !/Chromium|Edge/i.test(ua)) browser = "chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "safari";
  else if (/Firefox/i.test(ua)) browser = "firefox";
  else if (/Edge/i.test(ua)) browser = "edge";
  let os = "other";
  if (/Windows/i.test(ua)) os = "windows";
  else if (/Mac OS/i.test(ua)) os = "macos";
  else if (/Android/i.test(ua)) os = "android";
  else if (/iPhone|iPad/i.test(ua)) os = "ios";
  else if (/Linux/i.test(ua)) os = "linux";
  return { device, browser, os };
}

// ─── Meta Conversions API ─────────────────────────────────────────────────────
const META_API = "https://graph.facebook.com/v19.0";

interface MetaUserData {
  em?: string[];   // email hashed
  ph?: string[];   // phone hashed
  fn?: string[];   // first name hashed
  ln?: string[];   // last name hashed
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
}

async function sendToMeta(opts: {
  pixelId: string;
  accessToken: string;
  eventName: string;
  eventId: string;
  sourceUrl: string;
  userData: MetaUserData;
  customData?: Record<string, unknown>;
  testEventCode?: string;
}): Promise<{ status: "sent" | "error"; response: unknown }> {
  const payload = {
    data: [{
      event_name: opts.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: opts.eventId,
      event_source_url: opts.sourceUrl,
      action_source: "website",
      user_data: opts.userData,
      ...(opts.customData ? { custom_data: opts.customData } : {}),
    }],
    ...(opts.testEventCode ? { test_event_code: opts.testEventCode } : {}),
  };

  try {
    const res = await fetch(
      `${META_API}/${opts.pixelId}/events?access_token=${opts.accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      }
    );
    const data = await res.json();
    if (!res.ok || (data as any).error) {
      return { status: "error", response: data };
    }
    return { status: "sent", response: data };
  } catch (err) {
    return { status: "error", response: { message: String(err) } };
  }
}

// ─── Google Measurement Protocol (GA4) ───────────────────────────────────────
async function sendToGoogle(opts: {
  measurementId: string;
  apiSecret: string;
  clientId: string;  // pseudo-random GA4 client id (from _ga cookie or generated)
  eventName: string;
  params?: Record<string, unknown>;
}): Promise<{ status: "sent" | "error"; response: unknown }> {
  // Mapeamento de nomes de eventos Meta → GA4
  const ga4EventMap: Record<string, string> = {
    Lead: "generate_lead",
    Contact: "contact",
    Schedule: "book_appointment",
    Purchase: "purchase",
    CompleteRegistration: "sign_up",
    ViewContent: "page_view",
    PageView: "page_view",
  };
  const ga4Event = ga4EventMap[opts.eventName] ?? opts.eventName.toLowerCase();

  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${opts.measurementId}&api_secret=${opts.apiSecret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: opts.clientId,
          events: [{
            name: ga4Event,
            params: {
              engagement_time_msec: "1",
              ...(opts.params ?? {}),
            },
          }],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    // GA4 Measurement Protocol retorna 204 em sucesso
    if (res.status === 204 || res.ok) {
      return { status: "sent", response: { status: res.status } };
    }
    const data = await res.text();
    return { status: "error", response: { status: res.status, body: data } };
  } catch (err) {
    return { status: "error", response: { message: String(err) } };
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json() as {
      // Obrigatório
      event_name:  string;
      client_slug: string;
      // Identificação do evento (deduplicação)
      event_id?:   string;
      // URL de origem
      source_url?: string;
      // UTMs
      utm_source?:   string;
      utm_medium?:   string;
      utm_campaign?: string;
      utm_content?:  string;
      utm_term?:     string;
      // Parâmetros de clique
      fbclid?: string;
      gclid?:  string;
      // Dados do usuário (em claro — a EF faz o hash)
      email?:      string;
      phone?:      string;
      first_name?: string;
      last_name?:  string;
      // Cookies Meta
      fbc?: string;
      fbp?: string;
      // GA4 client id (_ga cookie ou gerado pelo browser)
      ga_client_id?: string;
      // Contexto do browser
      user_agent?: string;
      // Test event code (Meta) — apenas para testes
      test_event_code?: string;
      // Dados extras (ex: valor de compra)
      custom_data?: Record<string, unknown>;
    };

    const { event_name, client_slug } = body;
    if (!event_name || !client_slug) {
      return json({ error: "event_name e client_slug são obrigatórios" }, 400);
    }

    // Gera event_id se não fornecido
    const eventId = body.event_id ?? crypto.randomUUID();

    // ── Resolve client_id + organization_id pelo slug ─────────────────────
    const { data: clientRows, error: clientErr } = await admin
      .from("clients")
      .select("id, organization_id")
      .eq("dashboard_slug", client_slug)
      .limit(1);

    if (clientErr || !clientRows || clientRows.length === 0) {
      return json({ error: "Cliente não encontrado" }, 404);
    }
    const clientId     = (clientRows[0] as any).id as string;
    const organizationId = (clientRows[0] as any).organization_id as string;

    // ── Lê configurações de tracking ──────────────────────────────────────
    const [aiSettingsRes, gtmSettingsRes, oauthRes] = await Promise.all([
      admin
        .from("client_ai_settings")
        .select("meta_pixel_id, google_tag_id")
        .eq("client_id", clientId)
        .maybeSingle(),
      admin
        .from("client_gtm_settings")
        .select("ga4_measurement_id, ga4_api_secret, meta_capi_token")
        .eq("client_id", clientId)
        .maybeSingle(),
      admin
        .from("oauth_tokens")
        .select("access_token")
        .eq("tenant_id", organizationId)
        .eq("provider", "meta")
        .maybeSingle(),
    ]);

    const metaPixelId     = (aiSettingsRes.data as any)?.meta_pixel_id ?? null;
    const ga4MeasurementId = (gtmSettingsRes.data as any)?.ga4_measurement_id ?? null;
    const ga4ApiSecret    = (gtmSettingsRes.data as any)?.ga4_api_secret ?? null;
    const metaCapiToken   = (gtmSettingsRes.data as any)?.meta_capi_token
      ?? (oauthRes.data as any)?.access_token
      ?? null;

    // ── Detecta IP do usuário ─────────────────────────────────────────────
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? req.headers.get("x-real-ip")
            ?? "";

    // ── User-agent ────────────────────────────────────────────────────────
    const userAgent = body.user_agent ?? req.headers.get("user-agent") ?? "";
    const { device, browser, os } = parseUA(userAgent);

    // ── GeoIP (assíncrono, paralelo) ──────────────────────────────────────
    const cityPromise = getCity(ip);

    // ── Hashing PII ───────────────────────────────────────────────────────
    const [emailHash, phoneHash, firstNameHash, lastNameHash] = await Promise.all([
      body.email      ? sha256(body.email)      : Promise.resolve(null),
      body.phone      ? sha256(normalizePhone(body.phone)) : Promise.resolve(null),
      body.first_name ? sha256(body.first_name) : Promise.resolve(null),
      body.last_name  ? sha256(body.last_name)  : Promise.resolve(null),
    ]);

    const city = await cityPromise;

    // ── Monta userData para Meta ──────────────────────────────────────────
    const metaUserData: MetaUserData = {
      ...(emailHash     ? { em: [emailHash] }     : {}),
      ...(phoneHash     ? { ph: [phoneHash] }     : {}),
      ...(firstNameHash ? { fn: [firstNameHash] } : {}),
      ...(lastNameHash  ? { ln: [lastNameHash] }  : {}),
      ...(ip            ? { client_ip_address: ip }     : {}),
      ...(userAgent     ? { client_user_agent: userAgent } : {}),
      ...(body.fbc      ? { fbc: body.fbc }       : {}),
      ...(body.fbp      ? { fbp: body.fbp }       : {}),
    };

    // ── Envia para Meta e Google em paralelo ──────────────────────────────
    let metaResult:   { status: "sent" | "error" | "skipped"; response: unknown } = { status: "skipped", response: null };
    let googleResult: { status: "sent" | "error" | "skipped"; response: unknown } = { status: "skipped", response: null };

    const [metaRes, googleRes] = await Promise.all([
      metaPixelId && metaCapiToken
        ? sendToMeta({
            pixelId:       metaPixelId,
            accessToken:   metaCapiToken,
            eventName:     event_name,
            eventId,
            sourceUrl:     body.source_url ?? "",
            userData:      metaUserData,
            customData:    body.custom_data,
            testEventCode: body.test_event_code,
          })
        : Promise.resolve(null),
      ga4MeasurementId && ga4ApiSecret
        ? sendToGoogle({
            measurementId: ga4MeasurementId,
            apiSecret:     ga4ApiSecret,
            clientId:      body.ga_client_id ?? crypto.randomUUID(),
            eventName:     event_name,
            params: {
              ...(body.utm_campaign ? { campaign: body.utm_campaign }       : {}),
              ...(body.utm_source   ? { source:   body.utm_source }         : {}),
              ...(body.utm_medium   ? { medium:   body.utm_medium }         : {}),
              ...(body.custom_data  ? body.custom_data                      : {}),
            },
          })
        : Promise.resolve(null),
    ]);

    if (metaRes)   metaResult   = metaRes;
    if (googleRes) googleResult = googleRes;

    // ── Persiste em client_tracking_events ────────────────────────────────
    const { data: insertedEvent, error: insertErr } = await admin
      .from("client_tracking_events")
      .insert({
        client_id:        clientId,
        organization_id:  organizationId,
        event_name,
        event_id:         eventId,
        source_url:       body.source_url,
        utm_source:       body.utm_source,
        utm_medium:       body.utm_medium,
        utm_campaign:     body.utm_campaign,
        utm_content:      body.utm_content,
        utm_term:         body.utm_term,
        fbclid:           body.fbclid,
        gclid:            body.gclid,
        email_hash:       emailHash,
        phone_hash:       phoneHash,
        first_name_hash:  firstNameHash,
        last_name_hash:   lastNameHash,
        fbc:              body.fbc,
        fbp:              body.fbp,
        client_ip:        ip || null,
        client_user_agent: userAgent || null,
        device,
        browser,
        os,
        city,
        meta_status:      metaResult.status,
        meta_response:    metaResult.response,
        google_status:    googleResult.status,
        google_response:  googleResult.response,
        metadata: {
          ga_client_id:    body.ga_client_id,
          test_event_code: body.test_event_code,
        },
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[track-conversion] Erro ao inserir evento:", insertErr.message);
    }

    return json({
      success:        true,
      event_id:       eventId,
      tracking_id:    (insertedEvent as any)?.id ?? null,
      meta_status:    metaResult.status,
      google_status:  googleResult.status,
    });

  } catch (err) {
    console.error("[track-conversion] Erro não tratado:", err);
    return json({ error: "Erro interno", detail: String(err) }, 500);
  }
});
