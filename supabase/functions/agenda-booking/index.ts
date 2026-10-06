/**
 * agenda-booking
 *
 * Edge Function pública para receber agendamentos do formulário /booking/:slug.
 * Não requer autenticação — acesso anon via anon key do Banco A.
 *
 * Endpoints:
 *   GET  /agenda-booking?slug=<slug>&date=<YYYY-MM-DD>&service_id=<uuid>
 *        → Retorna slots disponíveis para um dia
 *
 *   GET  /agenda-booking?action_token=<uuid>
 *        → Retorna dados do agendamento vinculado ao token (para a BookingActionPage)
 *
 *   POST /agenda-booking
 *        body.action = undefined → Cria novo agendamento
 *        body.action = "confirm"    → Confirma agendamento via token
 *        body.action = "cancel"     → Cancela agendamento via token
 *        body.action = "reschedule" → Reagenda (cancela atual + retorna link novo)
 *        body.action = "lookup"     → Busca agendamento ativo por telefone
 *
 * Segurança:
 *   - Validação de slug → client_id antes de qualquer operação
 *   - Rate limit simples por IP via header X-Forwarded-For
 *   - Tokens de ação: UUID único por ação, uso único, expiração 48h
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── Rate limit ───────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX    = 10;
const RATE_LIMIT_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ─── Formata data/hora em pt-BR ───────────────────────────────────────────────
function fmtDateLong(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: tz,
    });
  } catch { return iso; }
}

function fmtTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: tz,
    });
  } catch { return iso; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return json({ error: "Muitas requisições. Tente novamente em alguns minutos." }, 429);
  }

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const n8nWebhookUrl  = Deno.env.get("N8N_AGENDA_WEBHOOK_URL");
  const n8nToken       = Deno.env.get("N8N_AGENDA_WEBHOOK_TOKEN");

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const url = new URL(req.url);

  // ══════════════════════════════════════════════════════════════════════════
  // GET
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === "GET") {

    // ── GET ?action_token=<uuid> — Resolve token para BookingActionPage ────
    const actionToken = url.searchParams.get("action_token");
    if (actionToken) {
      const { data: result } = await adminClient
        .rpc("resolve_action_token", { p_token: actionToken, p_ip: ip });

      const r = result as Record<string, unknown> | null;
      if (!r) return json({ error: "token_not_found" }, 404);
      if (r.error) return json(r, (r.code as number) ?? 400);

      // Retorna dados para exibição na página de ação — sem consumir o token ainda
      // (o token é consumido apenas no POST de confirmação da ação)
      // Regera token para uso no POST (resolve não consumiu neste GET)
      return json({
        action_type:      r.action_type,
        appointment_id:   r.appointment_id,
        slug:             r.slug,
        customer_name:    r.customer_name,
        service_name:     r.service_name,
        appt_status:      r.appt_status,
        start_at:         r.start_at,
        end_at:           r.end_at,
        professional_name: r.professional_name,
        date_formatted:   fmtDateLong(r.start_at as string, (r.timezone as string) ?? "America/Sao_Paulo"),
        time_formatted:   fmtTime(r.start_at as string, (r.timezone as string) ?? "America/Sao_Paulo"),
      });
    }

    // ── GET ?slug=&date= — Slots disponíveis ──────────────────────────────
    const slug      = url.searchParams.get("slug");
    const dateParam = url.searchParams.get("date");
    const serviceId = url.searchParams.get("service_id") ?? undefined;

    if (!slug || !dateParam) return json({ error: "slug e date são obrigatórios" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return json({ error: "Formato de data inválido. Use YYYY-MM-DD" }, 400);

    const { data: client } = await adminClient
      .from("clients")
      .select("id, name, metadata")
      .eq("dashboard_slug", slug)
      .eq("is_active", true)
      .single();
    if (!client) return json({ error: "Estabelecimento não encontrado" }, 404);

    const professionalId = url.searchParams.get("professional_id") ?? undefined;
    const { data: slots, error: slotsErr } = await adminClient.rpc("get_available_slots", {
      p_client_id:       client.id,
      p_date:            dateParam,
      p_service_id:      serviceId      ?? null,
      p_professional_id: professionalId ?? null,
    });
    if (slotsErr) return json({ error: "Erro ao buscar disponibilidade" }, 500);

    const [servicesResult, professionalsResult, displayResult, brandingResult] = await Promise.all([
      adminClient.from("client_schedule_services").select("id, name, duration_min, price, color").eq("client_id", client.id).eq("active", true).order("name"),
      adminClient.rpc("get_schedule_professionals", { p_client_id: client.id }),
      adminClient.rpc("get_agenda_display_config",  { p_client_id: client.id }),
      adminClient.from("client_ai_settings").select("display_name, logo_url, primary_color, description").eq("client_id", client.id).maybeSingle(),
    ]);

    const displayRow = Array.isArray(displayResult.data) ? displayResult.data[0] : displayResult.data;
    const branding   = brandingResult.data;

    return json({
      client: {
        name:          client.name,
        display_name:  branding?.display_name  ?? null,
        logo_url:      branding?.logo_url      ?? client.metadata?.logo_url ?? null,
        primary_color: branding?.primary_color ?? null,
        description:   branding?.description   ?? null,
      },
      date:           dateParam,
      slots:          slots?.slots         ?? [],
      services:       servicesResult.data  ?? [],
      professionals:  professionalsResult.data ?? [],
      display_config: {
        show_services:      displayRow?.show_services      ?? true,
        show_professionals: displayRow?.show_professionals ?? false,
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return json({ error: "JSON inválido" }, 400); }

    const action = (body.action as string | undefined);

    // ── POST action=confirm|cancel|reschedule — Processar ação via token ──
    if (action === "confirm" || action === "cancel" || action === "reschedule") {
      const token = body.token as string;
      if (!token) return json({ error: "token é obrigatório" }, 400);

      // Valida UUID básico
      if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: "token inválido" }, 400);

      const { data: result } = await adminClient
        .rpc("resolve_action_token", { p_token: token, p_ip: ip });

      const r = result as Record<string, unknown> | null;
      if (!r) return json({ error: "token_not_found" }, 404);
      if (r.error) return json(r, (r.code as number) ?? 400);

      // Valida que a ação do token corresponde à ação solicitada
      if (r.action_type !== action) {
        return json({ error: "token_action_mismatch", expected: r.action_type }, 400);
      }

      const apptId   = r.appointment_id as string;
      const clientId = r.client_id as string;
      const slug     = r.slug as string;
      const tz       = (r.timezone as string) ?? "America/Sao_Paulo";

      if (action === "confirm") {
        // Muda status para confirmed
        const { error: updErr } = await adminClient
          .from("client_appointments")
          .update({ status: "confirmed", updated_at: new Date().toISOString() })
          .eq("id", apptId)
          .eq("client_id", clientId);

        if (updErr) return json({ error: "Erro ao confirmar agendamento" }, 500);

        // Dispara n8n para notificação de confirmação
        if (n8nWebhookUrl) {
          fetch(n8nWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(n8nToken ? { "X-Webhook-Token": n8nToken } : {}) },
            body: JSON.stringify({ event: "appointment.updated", appointment_id: apptId, client_id: clientId, source: "action_link" }),
          }).catch(e => console.warn("[agenda-booking] n8n confirm:", e));
        }

        return json({
          success:     true,
          action:      "confirmed",
          message:     "Presença confirmada! Até lá 😊",
          appointment: {
            service_name:    r.service_name,
            date_formatted:  fmtDateLong(r.start_at as string, tz),
            time_formatted:  fmtTime(r.start_at as string, tz),
            professional_name: r.professional_name,
          },
        });
      }

      if (action === "cancel") {
        const cancelReason = (body.reason as string | undefined) ?? "Cancelado pelo cliente via link";

        const { error: updErr } = await adminClient
          .from("client_appointments")
          .update({
            status:           "cancelled",
            cancelled_reason: cancelReason,
            updated_at:       new Date().toISOString(),
          })
          .eq("id", apptId)
          .eq("client_id", clientId);

        if (updErr) return json({ error: "Erro ao cancelar agendamento" }, 500);

        // Cancela lembretes pendentes
        await adminClient.rpc("cancel_appointment_reminders", { p_appointment_id: apptId });

        // Dispara n8n para notificação de cancelamento
        if (n8nWebhookUrl) {
          fetch(n8nWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(n8nToken ? { "X-Webhook-Token": n8nToken } : {}) },
            body: JSON.stringify({ event: "appointment.cancelled", appointment_id: apptId, client_id: clientId, source: "action_link" }),
          }).catch(e => console.warn("[agenda-booking] n8n cancel:", e));
        }

        return json({
          success:      true,
          action:       "cancelled",
          message:      "Agendamento cancelado. O horário foi liberado.",
          reschedule_url: `${url.origin}/booking/${slug}`,
        });
      }

      if (action === "reschedule") {
        // Cancela o agendamento atual
        const { error: updErr } = await adminClient
          .from("client_appointments")
          .update({
            status:           "cancelled",
            cancelled_reason: "Reagendado pelo cliente via link",
            updated_at:       new Date().toISOString(),
          })
          .eq("id", apptId)
          .eq("client_id", clientId);

        if (updErr) return json({ error: "Erro ao cancelar agendamento para reagendamento" }, 500);

        await adminClient.rpc("cancel_appointment_reminders", { p_appointment_id: apptId });

        // Pré-preenche dados do cliente no link de novo agendamento
        const customerPhone = r.customer_phone as string | null;
        const rescheduleUrl = `${url.origin}/booking/${slug}?phone=${encodeURIComponent(customerPhone ?? "")}`;

        if (n8nWebhookUrl) {
          fetch(n8nWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(n8nToken ? { "X-Webhook-Token": n8nToken } : {}) },
            body: JSON.stringify({ event: "appointment.cancelled", appointment_id: apptId, client_id: clientId, source: "reschedule_link" }),
          }).catch(e => console.warn("[agenda-booking] n8n reschedule:", e));
        }

        return json({
          success:        true,
          action:         "rescheduled",
          message:        "Horário liberado! Use o link abaixo para escolher um novo horário.",
          reschedule_url: rescheduleUrl,
        });
      }
    }

    // ── POST action=lookup — Busca agendamento ativo por telefone ──────────
    if (action === "lookup") {
      const { slug, phone } = body as { slug?: string; phone?: string };
      if (!slug || !phone) return json({ error: "slug e phone são obrigatórios" }, 400);

      const safePhone = String(phone).replace(/\D/g, "");
      if (safePhone.length < 10) return json({ error: "Telefone inválido" }, 400);

      const { data: client } = await adminClient
        .from("clients")
        .select("id")
        .eq("dashboard_slug", slug)
        .eq("is_active", true)
        .single();
      if (!client) return json({ error: "Estabelecimento não encontrado" }, 404);

      // Busca agendamento ativo mais recente para este telefone
      const { data: existing } = await adminClient
        .from("client_appointments")
        .select("id, customer_name, customer_email, service_name, start_at, end_at, status, professional_name")
        .eq("client_id", client.id)
        .eq("customer_phone", safePhone)
        .in("status", ["pending", "confirmed"])
        .gt("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Busca histórico de agendamentos para verificar intervalo mínimo
      const { data: lastAppt } = await adminClient
        .from("client_appointments")
        .select("id, start_at, status")
        .eq("client_id", client.id)
        .eq("customer_phone", safePhone)
        .neq("status", "cancelled")
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Busca configuração de intervalo
      const { data: configRows } = await adminClient
        .from("client_schedule_config")
        .select("booking_interval_days")
        .eq("client_id", client.id)
        .limit(1);

      const intervalDays = configRows?.[0]?.booking_interval_days ?? 0;

      // Verifica se está dentro do intervalo mínimo
      let withinInterval = false;
      let daysSinceLast: number | null = null;
      if (intervalDays > 0 && lastAppt) {
        const lastDate  = new Date(lastAppt.start_at);
        const now       = new Date();
        daysSinceLast   = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        withinInterval  = daysSinceLast < intervalDays;
      }

      // Busca dados do cliente pelo telefone (nome preenchido anteriormente)
      const lastCustomerData = existing ?? lastAppt;
      let customerName: string | null = null;
      let customerEmail: string | null = null;

      if (lastCustomerData) {
        const { data: pastAppt } = await adminClient
          .from("client_appointments")
          .select("customer_name, customer_email")
          .eq("client_id", client.id)
          .eq("customer_phone", safePhone)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        customerName  = pastAppt?.customer_name  ?? null;
        customerEmail = pastAppt?.customer_email ?? null;
      }

      return json({
        found:            !!customerName,
        customer_name:    customerName,
        customer_email:   customerEmail,
        active_appointment: existing ?? null,
        within_interval:  withinInterval,
        interval_days:    intervalDays,
        days_since_last:  daysSinceLast,
      });
    }

    // ── POST criar novo agendamento ────────────────────────────────────────
    const {
      slug,
      customer_name,
      customer_phone,
      customer_email,
      service_id,
      service_name,
      start_at,
      end_at,
      notes,
      professional_id,
      professional_name,
    } = body as Record<string, string>;

    if (!slug || !customer_name || !start_at || !end_at) {
      return json({ error: "Campos obrigatórios: slug, customer_name, start_at, end_at" }, 400);
    }
    if (!service_name && !service_id) {
      return json({ error: "Informe service_id ou service_name" }, 400);
    }

    const safeName  = String(customer_name).trim().substring(0, 120);
    const safePhone = customer_phone ? String(customer_phone).replace(/[^\d\s\+\-\(\)]/g, "").trim() : null;
    const safeEmail = customer_email ? String(customer_email).trim().toLowerCase() : null;
    const safeNotes = notes ? String(notes).trim().substring(0, 500) : null;

    if (safeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
      return json({ error: "E-mail inválido" }, 400);
    }

    const { data: client } = await adminClient
      .from("clients")
      .select("id, organization_id, name")
      .eq("dashboard_slug", slug)
      .eq("is_active", true)
      .single();
    if (!client) return json({ error: "Estabelecimento não encontrado" }, 404);

    const startDate = new Date(start_at);
    const endDate   = new Date(end_at);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return json({ error: "Datas inválidas" }, 400);
    if (startDate <= new Date()) return json({ error: "Não é possível agendar no passado" }, 400);

    // Verifica conflito de slot
    const { data: conflict } = await adminClient
      .from("client_appointments")
      .select("id")
      .eq("client_id", client.id)
      .neq("status", "cancelled")
      .lt("start_at", end_at)
      .gt("end_at", start_at)
      .limit(1);

    const weekday = startDate.getDay();
    const { data: config } = await adminClient
      .from("client_schedule_config")
      .select("max_per_slot, booking_interval_days")
      .eq("client_id", client.id)
      .eq("weekday", weekday)
      .eq("active", true)
      .single();

    const maxPerSlot = config?.max_per_slot ?? 1;
    if ((conflict?.length ?? 0) >= maxPerSlot) {
      return json({ error: "Este horário não está mais disponível" }, 409);
    }

    // ── Verifica intervalo mínimo por telefone ────────────────────────────
    const intervalDays = config?.booking_interval_days ?? 0;
    if (intervalDays > 0 && safePhone) {
      const intervalStart = new Date();
      intervalStart.setDate(intervalStart.getDate() - intervalDays);

      const { data: recentAppt } = await adminClient
        .from("client_appointments")
        .select("id, start_at")
        .eq("client_id", client.id)
        .eq("customer_phone", safePhone)
        .neq("status", "cancelled")
        .gte("start_at", intervalStart.toISOString())
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentAppt) {
        const daysSince = Math.floor(
          (new Date().getTime() - new Date(recentAppt.start_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        return json({
          error:              "interval_restriction",
          message:            `Você já possui um agendamento recente. O intervalo mínimo é de ${intervalDays} dias.`,
          appointment_id:     recentAppt.id,
          days_since:         daysSince,
          interval_days:      intervalDays,
          days_remaining:     intervalDays - daysSince,
        }, 409);
      }
    }

    // Resolve service_name
    let resolvedServiceName = service_name;
    if (!resolvedServiceName && service_id) {
      const { data: svc } = await adminClient
        .from("client_schedule_services")
        .select("name")
        .eq("id", service_id)
        .eq("client_id", client.id)
        .single();
      resolvedServiceName = svc?.name ?? "Serviço";
    }

    const { data: result, error: insertError } = await adminClient.rpc("upsert_appointment", {
      p_client_id:          client.id,
      p_customer_name:      safeName,
      p_customer_phone:     safePhone,
      p_customer_email:     safeEmail,
      p_service_id:         service_id       ?? null,
      p_service_name:       resolvedServiceName,
      p_start_at:           start_at,
      p_end_at:             end_at,
      p_notes:              safeNotes,
      p_source:             "public_form",
      p_metadata:           { ip, user_agent: req.headers.get("user-agent") ?? "" },
      p_professional_id:    professional_id   ?? null,
      p_professional_name:  professional_name ?? null,
    });

    if (insertError || !result?.id) {
      console.error("[agenda-booking] Erro ao inserir agendamento:", insertError);
      return json({ error: "Erro ao criar agendamento. Tente novamente." }, 500);
    }

    const appointmentId = result.id as string;

    // Dispara n8n de forma assíncrona
    if (n8nWebhookUrl) {
      fetch(n8nWebhookUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...(n8nToken ? { "X-Webhook-Token": n8nToken } : {}) },
        body: JSON.stringify({
          event:          "appointment.created",
          appointment_id: appointmentId,
          client_id:      client.id,
          source:         "public_form",
        }),
      }).catch((e) => console.warn("[agenda-booking] Falha ao notificar n8n:", e));
    }

    console.log(`[agenda-booking] Agendamento criado: ${appointmentId} — ${safeName} em ${start_at}`);

    return json({
      success:        true,
      appointment_id: appointmentId,
      message:        "Agendamento realizado com sucesso!",
      start_at,
      end_at,
      service_name:   resolvedServiceName,
    });
  }

  return json({ error: "Método não permitido" }, 405);
});
