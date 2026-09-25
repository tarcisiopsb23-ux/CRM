/**
 * send-agenda-email
 *
 * Envia notificações de agendamento por e-mail via Resend,
 * usando o padrão "on behalf of":
 *
 *   From:     Nome do Cliente <noreply@agenciac8.com.br>   ← domínio verificado da agência
 *   Reply-To: agenda@clientexyz.com.br                    ← e-mail do cliente (email_notify_from)
 *   Subject:  configurado no client_ai_settings
 *   HTML:     template com variáveis substituídas
 *
 * O destinatário vê o nome do cliente como remetente e,
 * ao responder, o e-mail vai direto para o cliente.
 *
 * Payload esperado (POST):
 * {
 *   event:            "created" | "confirmed" | "cancelled" | "reminder"
 *   appointment_id:   string    (UUID do agendamento)
 *   client_id:        string    (UUID do cliente/estabelecimento)
 *   customer_email:   string    (destinatário)
 *   customer_name:    string
 *   service_name:     string
 *   start_at:         string    (ISO 8601)
 *   end_at:           string    (ISO 8601)
 * }
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL  (ex: "Maestr.IA <noreply@agenciac8.com.br>")
 *   RESEND_FROM_DOMAIN (ex: "agenciac8.com.br" — usado para montar From com nome do cliente)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

// ── Substitui variáveis de template ──────────────────────────────────────────
function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ── Formata data/hora em pt-BR ────────────────────────────────────────────────
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
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

// ── HTML padrão por evento ────────────────────────────────────────────────────
const DEFAULT_SUBJECTS: Record<string, string> = {
  created:   "Agendamento confirmado — {servico}",
  confirmed: "Seu agendamento foi atualizado — {servico}",
  cancelled: "Agendamento cancelado — {servico}",
  reminder:  "Lembrete: {servico} em {data}",
};

function defaultHtml(event: string, vars: Record<string, string>, clientName: string, primaryColor: string): string {
  const color = primaryColor || "#6366f1";
  const accent = `style="color:${color};font-weight:600;"`;

  const body: Record<string, string> = {
    created:   `<p>Olá, <strong>${vars.nome}</strong>!</p>
                <p>Seu agendamento foi confirmado com sucesso.</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                  <tr><td style="padding:8px 0;color:#666;width:40%">Serviço</td><td ${accent}>${vars.servico}</td></tr>
                  <tr><td style="padding:8px 0;color:#666;">Data</td><td ${accent}>${vars.data}</td></tr>
                  <tr><td style="padding:8px 0;color:#666;">Horário</td><td ${accent}>${vars.hora}</td></tr>
                </table>
                <p style="color:#666;font-size:14px;">Para cancelar ou remarcar, entre em contato conosco.</p>`,
    confirmed: `<p>Olá, <strong>${vars.nome}</strong>!</p>
                <p>Seu agendamento foi atualizado.</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                  <tr><td style="padding:8px 0;color:#666;width:40%">Serviço</td><td ${accent}>${vars.servico}</td></tr>
                  <tr><td style="padding:8px 0;color:#666;">Data</td><td ${accent}>${vars.data}</td></tr>
                  <tr><td style="padding:8px 0;color:#666;">Horário</td><td ${accent}>${vars.hora}</td></tr>
                </table>`,
    cancelled: `<p>Olá, <strong>${vars.nome}</strong>!</p>
                <p>Informamos que seu agendamento de <strong>${vars.servico}</strong> foi cancelado.</p>
                <p style="color:#666;font-size:14px;">Para reagendar, entre em contato conosco.</p>`,
    reminder:  `<p>Olá, <strong>${vars.nome}</strong>!</p>
                <p>Este é um lembrete do seu agendamento amanhã:</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                  <tr><td style="padding:8px 0;color:#666;width:40%">Serviço</td><td ${accent}>${vars.servico}</td></tr>
                  <tr><td style="padding:8px 0;color:#666;">Data</td><td ${accent}>${vars.data}</td></tr>
                  <tr><td style="padding:8px 0;color:#666;">Horário</td><td ${accent}>${vars.hora}</td></tr>
                </table>
                <p style="color:#666;font-size:14px;">Caso precise cancelar, entre em contato o quanto antes.</p>`,
  };

  const bodyContent = body[event] ?? `<p>Você tem um agendamento: <strong>${vars.servico}</strong> em ${vars.data} às ${vars.hora}.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr><td style="background:${color};padding:24px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">${clientName}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          ${bodyContent}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            Este e-mail foi enviado em nome de <strong>${clientName}</strong>.
            Para cancelar ou remarcar, responda este e-mail.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL  = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@agenciac8.com.br";
  // Domínio verificado usado no From — ex: "agenciac8.com.br"
  const FROM_DOMAIN = Deno.env.get("RESEND_FROM_DOMAIN")
    ?? FROM_EMAIL.replace(/.*@/, "").replace(/>.*/, "").trim();

  if (!RESEND_KEY) {
    return json({ error: "RESEND_API_KEY não configurada" }, 503);
  }

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const {
    event,
    client_id,
    customer_email,
    customer_name,
    service_name,
    start_at,
    end_at,
  } = body;

  if (!event || !client_id || !customer_email || !customer_name || !start_at) {
    return json({ error: "Campos obrigatórios: event, client_id, customer_email, customer_name, start_at" }, 400);
  }

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Busca configuração de e-mail do cliente ────────────────────────────
  const { data: cfg } = await admin
    .from("client_ai_settings")
    .select([
      "email_notify_enabled",
      `email_notify_on_${event}`,
      "email_notify_from",
      `email_subject_${event}`,
      `email_msg_${event}`,
      "establishment_name",
      "primary_color",
    ].join(","))
    .eq("client_id", client_id)
    .maybeSingle();

  // Verifica se o canal está habilitado para este evento
  const enabled     = cfg?.email_notify_enabled ?? false;
  const eventOn     = cfg?.[`email_notify_on_${event}`] ?? false;

  if (!enabled || !eventOn) {
    return json({ skipped: true, reason: `email_notify_${event} desabilitado` });
  }

  // ── 2. Monta variáveis de template ────────────────────────────────────────
  const vars: Record<string, string> = {
    nome:    customer_name,
    servico: service_name ?? "Agendamento",
    data:    fmtDate(start_at),
    hora:    fmtTime(start_at),
    hora_fim: end_at ? fmtTime(end_at) : "",
  };

  const clientName   = cfg?.establishment_name ?? "Estabelecimento";
  const primaryColor = cfg?.primary_color ?? "#6366f1";

  // ── 3. Monta assunto e corpo ──────────────────────────────────────────────
  const rawSubject = cfg?.[`email_subject_${event}`] as string | null;
  const rawMsg     = cfg?.[`email_msg_${event}`]     as string | null;

  const subject = rawSubject?.trim()
    ? applyTemplate(rawSubject, vars)
    : applyTemplate(DEFAULT_SUBJECTS[event] ?? "Notificação de agendamento", vars);

  // Se o cliente tem template personalizado de corpo, usa como texto simples em HTML
  // Caso contrário, usa o HTML padrão com layout da plataforma
  const html = rawMsg?.trim()
    ? `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;max-width:560px;">
         <p style="font-size:18px;font-weight:700;color:${primaryColor};">${clientName}</p>
         <div>${applyTemplate(rawMsg, vars).replace(/\n/g, "<br>")}</div>
         <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
         <p style="font-size:12px;color:#9ca3af;">Enviado em nome de ${clientName}. Responda este e-mail para contato direto.</p>
       </body></html>`
    : defaultHtml(event, vars, clientName, primaryColor);

  // ── 4. Monta headers "on behalf of" ──────────────────────────────────────
  // From:     "Nome do Cliente <noreply@agenciac8.com.br>"  — domínio verificado
  // Reply-To: e-mail configurado pelo cliente (email_notify_from)
  const clientReplyTo = (cfg?.email_notify_from as string | null)?.trim() || null;

  const fromHeader = `${clientName} <noreply@${FROM_DOMAIN}>`;

  // ── 5. Envia via Resend ───────────────────────────────────────────────────
  const resendPayload: Record<string, unknown> = {
    from:    fromHeader,
    to:      [customer_email],
    subject,
    html,
  };

  // Reply-To só se o cliente configurou um e-mail próprio
  if (clientReplyTo) {
    resendPayload.reply_to = clientReplyTo;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify(resendPayload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    console.error("[send-agenda-email] Resend error:", err);
    return json({ error: `Falha ao enviar e-mail: ${err.message ?? res.statusText}` }, 502);
  }

  const resendData = await res.json() as { id?: string };
  console.log(`[send-agenda-email] Enviado: ${resendData.id} → ${customer_email} (event: ${event}, client: ${client_id})`);

  return json({ success: true, resend_id: resendData.id });
});
