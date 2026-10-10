/**
 * agenda-notify-dispatch
 *
 * Dispatcher unificado de notificações de agendamento.
 * Recebe um evento de agendamento e decide quais canais notificar
 * com base na configuração do cliente em client_ai_settings.
 *
 * Toda a lógica de decisão fica aqui — o n8n é apenas um pipe.
 *
 * Canais suportados:
 *   - E-mail  → chama send-agenda-email (Resend, on-behalf-of)
 *   - WhatsApp → chama send-message   (Meta Graph API)
 *
 * POST /functions/v1/agenda-notify-dispatch
 * Headers: Authorization: Bearer <service_role_key>
 *
 * Body:
 * {
 *   event:          "created" | "confirmed" | "cancelled" | "reminder"
 *   appointment_id: string   (UUID)
 *   client_id:      string   (UUID)
 *   -- Campos opcionais (se não fornecidos, busca no banco) --
 *   customer_name?:  string
 *   customer_email?: string
 *   customer_phone?: string
 *   service_name?:   string
 *   start_at?:       string  (ISO 8601)
 *   end_at?:         string  (ISO 8601)
 * }
 *
 * Response:
 * {
 *   email:    { sent: boolean, skipped?: boolean, reason?: string, error?: string }
 *   whatsapp: { sent: boolean, skipped?: boolean, reason?: string, error?: string }
 * }
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   RESEND_FROM_DOMAIN    (ex: c8control.com.br)
 *   INTERNAL_SECRET       (para chamar meta-credential-provider)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Helpers de formatação ─────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long",
      timeZone: "America/Sao_Paulo",
    });
  } catch { return iso; }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    });
  } catch { return iso; }
}

function normalizePhone(phone: string): string {
  let p = phone.replace(/\D/g, "");
  if (!p.startsWith("55")) p = "55" + p;
  return "+" + p;
}

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// ── Resultado por canal ───────────────────────────────────────────────────────

type ChannelResult = {
  sent:     boolean;
  skipped?: boolean;
  reason?:  string;
  error?:   string;
  id?:      string;
};

// ── Dispatch de E-mail ────────────────────────────────────────────────────────

async function dispatchEmail(
  supabaseUrl: string,
  serviceKey:  string,
  event:       string,
  clientId:    string,
  apptId:      string,
  customerEmail: string,
  customerName:  string,
  serviceName:   string,
  startAt:       string,
  endAt:         string | null,
): Promise<ChannelResult> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-agenda-email`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        event,
        client_id:      clientId,
        appointment_id: apptId,
        customer_email: customerEmail,
        customer_name:  customerName,
        service_name:   serviceName,
        start_at:       startAt,
        end_at:         endAt,
      }),
    });

    const data = await res.json() as Record<string, unknown>;

    if (data.skipped) {
      return { sent: false, skipped: true, reason: String(data.reason ?? "") };
    }
    if (!res.ok || data.error) {
      return { sent: false, error: String(data.error ?? `HTTP ${res.status}`) };
    }
    return { sent: true, id: String(data.resend_id ?? "") };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

// ── Dispatch de WhatsApp ──────────────────────────────────────────────────────

async function dispatchWhatsApp(
  admin:        ReturnType<typeof createClient>,
  supabaseUrl:  string,
  serviceKey:   string,
  event:        string,
  clientId:     string,
  customerPhone: string,
  customerName:  string,
  serviceName:   string,
  startAt:       string,
): Promise<ChannelResult> {
  // 1. Busca config WhatsApp via RPC (já resolve connection_id)
  const { data: cfg, error: cfgErr } = await admin
    .rpc("get_whatsapp_notify_config", { p_client_id: clientId });

  if (cfgErr || !cfg) {
    return { sent: false, skipped: true, reason: "config_whatsapp_nao_encontrada" };
  }

  const waConfig = cfg as Record<string, unknown>;

  if (!waConfig.enabled) {
    return { sent: false, skipped: true, reason: "whatsapp_notify_disabled" };
  }

  // 2. Verifica se o evento específico está habilitado
  const eventKey = `on_${event}` as keyof typeof waConfig;
  if (!waConfig[eventKey]) {
    return { sent: false, skipped: true, reason: `whatsapp_notify_on_${event}_disabled` };
  }

  // 3. Valida número
  if (!customerPhone) {
    return { sent: false, skipped: true, reason: "customer_phone_nao_disponivel" };
  }

  // 4. Monta mensagem
  const vars: Record<string, string> = {
    nome:    customerName,
    servico: serviceName ?? "Agendamento",
    data:    fmtDate(startAt),
    hora:    fmtTime(startAt),
  };

  const defaults: Record<string, string> = {
    created:   `✅ Olá, ${vars.nome}! Seu agendamento de *${vars.servico}* foi confirmado para ${vars.data} às ${vars.hora}.`,
    confirmed: `📋 Olá, ${vars.nome}! Seu agendamento de *${vars.servico}* foi atualizado para ${vars.data} às ${vars.hora}.`,
    cancelled: `❌ Olá, ${vars.nome}! Seu agendamento de *${vars.servico}* foi cancelado. Entre em contato para remarcar.`,
    reminder:  `⏰ Olá, ${vars.nome}! Lembrete: você tem *${vars.servico}* em ${vars.data} às ${vars.hora}.`,
  };

  const msgKey  = `msg_${event}` as keyof typeof waConfig;
  const rawMsg  = (waConfig[msgKey] as string | null)?.trim();
  const message = rawMsg ? applyTemplate(rawMsg, vars) : (defaults[event] ?? `Agendamento: ${vars.servico} em ${vars.data} às ${vars.hora}.`);

  const phone        = normalizePhone(customerPhone);
  const connectionId = waConfig.resolved_connection_id as string | null;

  if (!connectionId) {
    return { sent: false, skipped: true, reason: "whatsapp_connection_nao_configurada" };
  }

  // 5. Busca organization_id da conexão (necessário para send-message)
  const { data: connRow } = await admin
    .from("meta_connections")
    .select("organization_id, status")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connRow || connRow.status !== "active") {
    return { sent: false, skipped: true, reason: "whatsapp_connection_inativa" };
  }

  // 6. Envia via send-message
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-message`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey":        serviceKey,
      },
      body: JSON.stringify({
        connection_id:   connectionId,
        organization_id: connRow.organization_id,
        channel_type:    "whatsapp",
        recipient_id:    phone,
        message_type:    "text",
        content:         message,
      }),
    });

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok || data.error) {
      return { sent: false, error: String(data.error ?? `HTTP ${res.status}`) };
    }

    const msgId = (data.messages as Array<{ id: string }>)?.[0]?.id ?? null;
    return { sent: true, id: msgId ?? undefined };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL  = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Aceita service_role via Authorization ou X-Service-Key
  const authHeader  = req.headers.get("Authorization") ?? "";
  const serviceKeyH = req.headers.get("X-Service-Key") ?? "";
  const isAuthorized = authHeader === `Bearer ${SVC_KEY}` || serviceKeyH === SVC_KEY;

  if (!isAuthorized) {
    // Valida JWT normal
    const userClient = createClient(SUPA_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);
  }

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const {
    event,
    appointment_id,
    client_id,
    customer_name,
    customer_email,
    customer_phone,
    service_name,
    start_at,
    end_at,
  } = body;

  if (!event || !appointment_id || !client_id) {
    return json({ error: "event, appointment_id e client_id são obrigatórios" }, 400);
  }

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Busca dados do agendamento se não vieram no payload
  let name  = customer_name;
  let email = customer_email;
  let phone = customer_phone;
  let svc   = service_name;
  let start = start_at;
  let end   = end_at ?? null;

  if (!name || !start) {
    const { data: appt } = await admin
      .from("client_appointments")
      .select("customer_name,customer_email,customer_phone,whatsapp_notify_phone,service_name,start_at,end_at")
      .eq("id", appointment_id)
      .eq("client_id", client_id)
      .maybeSingle();

    if (!appt) return json({ error: "Agendamento não encontrado" }, 404);

    name  = name  || appt.customer_name;
    email = email || appt.customer_email;
    // whatsapp_notify_phone tem prioridade sobre customer_phone
    phone = phone || appt.whatsapp_notify_phone || appt.customer_phone;
    svc   = svc   || appt.service_name;
    start = start || appt.start_at;
    end   = end   || appt.end_at || null;
  }

  // Dispara os dois canais em paralelo
  const [emailResult, waResult] = await Promise.all([
    dispatchEmail(SUPA_URL, SVC_KEY, event, client_id, appointment_id,
                  email ?? "", name ?? "", svc ?? "", start ?? "", end),
    dispatchWhatsApp(admin, SUPA_URL, SVC_KEY, event, client_id,
                     phone ?? "", name ?? "", svc ?? "", start ?? ""),
  ]);

  console.log(`[agenda-notify-dispatch] event=${event} appt=${appointment_id}`,
    `email=${emailResult.sent ? "sent" : (emailResult.skipped ? "skipped" : "error")}`,
    `wa=${waResult.sent ? "sent" : (waResult.skipped ? "skipped" : "error")}`);

  return json({ email: emailResult, whatsapp: waResult });
});
