/**
 * send-agenda-email
 *
 * Envia notificações de agendamento por e-mail via Resend.
 * Padrão "on behalf of":
 *   From:     Nome do Cliente <noreply@c8control.com.br>
 *   Reply-To: email_notify_from do cliente
 *
 * Para event="reminder": inclui botões de ação (Confirmar / Reagendar / Cancelar)
 * com tokens únicos gerados pela RPC generate_action_tokens.
 *
 * Payload (POST):
 * {
 *   event:          "created" | "confirmed" | "cancelled" | "reminder"
 *   appointment_id: string
 *   client_id:      string
 *   customer_email: string
 *   customer_name:  string
 *   service_name:   string
 *   start_at:       string (ISO 8601)
 *   end_at?:        string (ISO 8601)
 * }
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

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
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

const DEFAULT_SUBJECTS: Record<string, string> = {
  created:   "Agendamento confirmado — {servico}",
  confirmed: "Seu agendamento foi atualizado — {servico}",
  cancelled: "Agendamento cancelado — {servico}",
  reminder:  "Lembrete: {servico} em {data}",
};

// ── Template HTML padrão ──────────────────────────────────────────────────────

function buildHtml(opts: {
  event:       string;
  vars:        Record<string, string>;
  clientName:  string;
  color:       string;
  customMsg?:  string | null;
  // Para lembrete com ações:
  actionLinks?: { confirm: string; cancel: string; reschedule: string } | null;
  professional?: string | null;
}): string {
  const { event, vars, clientName, color, customMsg, actionLinks, professional } = opts;
  const accent = `style="color:${color};font-weight:600;"`;

  // Card de detalhes do agendamento
  const detailRows = [
    ["Serviço",     vars.servico],
    ["Data",        vars.data],
    ["Horário",     vars.hora],
    ...(professional ? [["Profissional", professional]] : []),
  ].map(([label, value]) => `
    <tr>
      <td style="padding:8px 0;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;width:40%;border-top:1px solid #f3f4f6;">${label}</td>
      <td style="padding:8px 0;font-size:14px;border-top:1px solid #f3f4f6;" ${accent}>${value}</td>
    </tr>`).join("");

  const appointmentCard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin:20px 0;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">${detailRows}</table>
      </td></tr>
    </table>`;

  // Botões de ação (apenas para lembrete)
  const actionButtons = actionLinks ? `
    <p style="margin:0 0 14px;font-size:13px;color:#6b7280;text-align:center;">Você vai comparecer? Selecione uma opção:</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 0 8px;">
        <a href="${actionLinks.confirm}" style="display:block;background:#10b981;color:#ffffff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-size:14px;font-weight:700;">
          ✅ Confirmar presença
        </a>
      </td></tr>
      <tr><td style="padding:0 0 8px;">
        <a href="${actionLinks.reschedule}" style="display:block;background:#f59e0b;color:#ffffff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-size:14px;font-weight:700;">
          📅 Reagendar
        </a>
      </td></tr>
      <tr><td>
        <a href="${actionLinks.cancel}" style="display:block;background:#ffffff;color:#ef4444;text-decoration:none;text-align:center;padding:13px;border-radius:10px;font-size:14px;font-weight:600;border:1.5px solid #fca5a5;">
          ❌ Cancelar agendamento
        </a>
      </td></tr>
    </table>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:16px;">
      <p style="margin:0;font-size:12px;color:#92400e;line-height:1.5;">
        ⚠️ <strong>Importante:</strong> Se não puder comparecer, cancele ou reagende com antecedência para que possamos atender outros pacientes.
      </p>
    </div>` : "";

  // Corpo por evento
  const bodyMap: Record<string, string> = {
    created: `
      <p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Olá, <strong style="color:#111827;">${vars.nome}</strong>!</p>
      <p style="margin:0 0 4px;font-size:15px;color:#374151;line-height:1.6;">Seu agendamento foi <strong>confirmado com sucesso</strong>.</p>
      ${appointmentCard}
      <p style="color:#6b7280;font-size:13px;">Para cancelar ou remarcar, entre em contato conosco.</p>`,

    confirmed: `
      <p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Olá, <strong style="color:#111827;">${vars.nome}</strong>!</p>
      <p style="margin:0 0 4px;font-size:15px;color:#374151;line-height:1.6;">Seu agendamento foi <strong>atualizado</strong>.</p>
      ${appointmentCard}`,

    cancelled: `
      <p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Olá, <strong style="color:#111827;">${vars.nome}</strong>!</p>
      <p style="margin:0 0 4px;font-size:15px;color:#374151;line-height:1.6;">Informamos que seu agendamento de <strong>${vars.servico}</strong> foi <strong>cancelado</strong>.</p>
      <p style="color:#6b7280;font-size:13px;">Para reagendar, entre em contato conosco.</p>`,

    reminder: `
      <p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Olá, <strong style="color:#111827;">${vars.nome}</strong>!</p>
      <p style="margin:0 0 4px;font-size:15px;color:#374151;line-height:1.6;">Este é um lembrete do seu agendamento marcado para <strong>amanhã</strong>. Por favor, confirme sua presença.</p>
      ${appointmentCard}
      ${actionButtons}`,
  };

  const bodyContent = customMsg?.trim()
    ? `<p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Olá, <strong style="color:#111827;">${vars.nome}</strong>!</p>
       <div style="font-size:14px;color:#374151;line-height:1.6;">${applyTemplate(customMsg, vars).replace(/\n/g, "<br>")}</div>
       ${event === "reminder" ? appointmentCard + actionButtons : ""}`
    : (bodyMap[event] ?? `<p>Você tem um agendamento: <strong>${vars.servico}</strong> em ${vars.data} às ${vars.hora}.</p>`);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${color};padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>
                <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1px;font-weight:600;">
                  ${event === "reminder" ? "Lembrete" : event === "cancelled" ? "Cancelamento" : "Agendamento"}
                </p>
                <p style="margin:5px 0 0;font-size:20px;font-weight:700;color:#ffffff;">${clientName}</p>
              </td>
              <td align="right" style="vertical-align:top;">
                <span style="font-size:28px;">${event === "reminder" ? "🗓️" : event === "cancelled" ? "❌" : "✅"}</span>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 20px;">
            ${bodyContent}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0 0 3px;font-size:12px;color:#9ca3af;text-align:center;">
              Este e-mail foi enviado em nome de <strong style="color:#6b7280;">${clientName}</strong>.
            </p>
            <p style="margin:0;font-size:11px;color:#d1d5db;text-align:center;">
              Para entrar em contato, responda este e-mail.
              ${event === "reminder" ? "Os links de ação expiram em 48 horas." : ""}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL    = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_KEY  = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL  = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@c8control.com.br";
  const FROM_DOMAIN = Deno.env.get("RESEND_FROM_DOMAIN")
    ?? FROM_EMAIL.replace(/.*@/, "").replace(/>.*/, "").trim()
    ?? "c8control.com.br";

  if (!RESEND_KEY) return json({ error: "RESEND_API_KEY não configurada" }, 503);

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const { event, client_id, appointment_id, customer_email, customer_name, service_name, start_at, end_at } = body;

  if (!event || !client_id || !customer_email || !customer_name || !start_at) {
    return json({ error: "Campos obrigatórios: event, client_id, customer_email, customer_name, start_at" }, 400);
  }

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Busca config do cliente ───────────────────────────────────────────────
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

  const enabled  = cfg?.email_notify_enabled ?? false;
  const eventOn  = cfg?.[`email_notify_on_${event}`] ?? false;

  if (!enabled || !eventOn) {
    return json({ skipped: true, reason: `email_notify_${event} desabilitado` });
  }

  // ── Variáveis de template ─────────────────────────────────────────────────
  const vars: Record<string, string> = {
    nome:     customer_name,
    servico:  service_name ?? "Agendamento",
    data:     fmtDate(start_at),
    hora:     fmtTime(start_at),
    hora_fim: end_at ? fmtTime(end_at) : "",
  };

  const clientName  = cfg?.establishment_name ?? "Estabelecimento";
  const primaryColor = cfg?.primary_color ?? "#6366f1";
  const rawMsg      = cfg?.[`email_msg_${event}`] as string | null;

  // ── Gera tokens de ação para lembrete ─────────────────────────────────────
  let actionLinks: { confirm: string; cancel: string; reschedule: string } | null = null;

  if (event === "reminder" && appointment_id) {
    try {
      const { data: tokens } = await admin
        .rpc("generate_action_tokens", {
          p_appointment_id: appointment_id,
          p_expires_hours:  48,
        });

      if (tokens && Array.isArray(tokens)) {
        const tokenMap: Record<string, string> = {};
        for (const t of tokens as Array<{ action_type: string; token: string }>) {
          tokenMap[t.action_type] = t.token;
        }

        // URL base do C8 Control para links de ação
        const appUrl = Deno.env.get("C8_CONTROL_APP_URL") ?? "https://app.c8control.com.br";

        // Busca o slug do cliente
        const { data: clientRow } = await admin
          .from("clients")
          .select("dashboard_slug")
          .eq("id", client_id)
          .maybeSingle();

        const slug = clientRow?.dashboard_slug ?? "";

        if (tokenMap.confirm && tokenMap.cancel && tokenMap.reschedule) {
          actionLinks = {
            confirm:    `${appUrl}/booking/${slug}/action/${tokenMap.confirm}`,
            cancel:     `${appUrl}/booking/${slug}/action/${tokenMap.cancel}`,
            reschedule: `${appUrl}/booking/${slug}/action/${tokenMap.reschedule}`,
          };
        }
      }
    } catch (err) {
      console.warn("[send-agenda-email] Falha ao gerar tokens de ação:", err);
      // Continua sem botões de ação — não bloqueia o envio
    }
  }

  // ── Monta assunto e HTML ──────────────────────────────────────────────────
  const rawSubject = cfg?.[`email_subject_${event}`] as string | null;
  const subject = rawSubject?.trim()
    ? applyTemplate(rawSubject, vars)
    : applyTemplate(DEFAULT_SUBJECTS[event] ?? "Notificação de agendamento", vars);

  // Busca profissional do agendamento para exibir no card
  let professionalName: string | null = null;
  if (appointment_id) {
    const { data: appt } = await admin
      .from("client_appointments")
      .select("professional_name")
      .eq("id", appointment_id)
      .maybeSingle();
    professionalName = appt?.professional_name ?? null;
  }

  const html = buildHtml({
    event,
    vars,
    clientName,
    color:        primaryColor,
    customMsg:    rawMsg,
    actionLinks,
    professional: professionalName,
  });

  // ── Envia via Resend ──────────────────────────────────────────────────────
  const clientReplyTo = (cfg?.email_notify_from as string | null)?.trim() || null;
  const fromHeader    = `${clientName} <noreply@${FROM_DOMAIN}>`;

  const resendPayload: Record<string, unknown> = {
    from:    fromHeader,
    to:      [customer_email],
    subject,
    html,
  };
  if (clientReplyTo) resendPayload.reply_to = clientReplyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
    body:    JSON.stringify(resendPayload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    console.error("[send-agenda-email] Resend error:", err);
    return json({ error: `Falha ao enviar e-mail: ${err.message ?? res.statusText}` }, 502);
  }

  const resendData = await res.json() as { id?: string };
  console.log(`[send-agenda-email] Enviado: ${resendData.id} → ${customer_email} (${event} / client: ${client_id})`);
  return json({ success: true, resend_id: resendData.id, has_action_buttons: !!actionLinks });
});
