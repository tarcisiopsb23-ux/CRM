/**
 * appointment-reminders
 *
 * Backend de controle da fila de lembretes de agendamento.
 * Toda a lógica de negócio fica aqui — o n8n apenas executa.
 *
 * Endpoints (campo `action` no body):
 *
 *   claim   — Reserva atômicamente lembretes PENDING elegíveis (para o n8n)
 *   sent    — Marca lembrete como enviado com sucesso
 *   failed  — Marca lembrete como falha (com retry inteligente)
 *   list    — Lista lembretes de um agendamento (para o frontend)
 *   cancel  — Cancela lembretes pendentes de um agendamento
 *
 * Autenticação:
 *   claim/sent/failed — service_role key (n8n) ou JWT autenticado
 *   list/cancel — JWT autenticado (frontend)
 *
 * Erro retryable vs non-retryable:
 *   Non-retryable: telefone inválido, template inexistente, config inválida
 *   Retryable: timeout, 5xx, falha temporária de rede
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
};

const MAX_ATTEMPTS = 3;

// Erros que NÃO devem gerar retry
const NON_RETRYABLE_PATTERNS = [
  "invalid_phone",
  "template_not_found",
  "template_not_approved",
  "invalid_recipient",
  "parameter_missing",
  "131030", // Meta: template not found
  "131047", // Meta: template param mismatch
  "100",    // Meta: invalid parameter
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function isNonRetryable(error: string): boolean {
  const lower = error.toLowerCase();
  return NON_RETRYABLE_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleClaim(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>
) {
  const limit    = Math.min(Number(body.limit ?? 50), 100);
  const workerId = String(body.worker_id ?? `n8n-${Date.now()}`);

  const { data, error } = await admin.rpc("claim_appointment_reminders", {
    p_limit:     limit,
    p_worker_id: workerId,
  });

  if (error) {
    console.error("[reminders] claim error:", error);
    return json({ error: "Erro ao reservar lembretes" }, 500);
  }

  const reminders = (data ?? []) as unknown[];

  console.log(`[reminders] claimed ${reminders.length} reminders (worker: ${workerId})`);
  return json({ reminders, count: reminders.length, worker_id: workerId });
}

async function handleSent(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>
) {
  const { reminder_id, provider_message_id } = body as {
    reminder_id: string;
    provider_message_id?: string;
  };

  if (!reminder_id) return json({ error: "reminder_id obrigatório" }, 400);

  const { error } = await admin
    .from("appointment_reminders")
    .update({
      status:              "sent",
      sent_at:             new Date().toISOString(),
      provider_message_id: provider_message_id ?? null,
      processing_at:       null,
      processing_worker_id: null,
      updated_at:          new Date().toISOString(),
    })
    .eq("id", reminder_id)
    .eq("status", "processing");  // só atualiza se ainda estiver em processing

  if (error) {
    console.error("[reminders] sent update error:", error);
    return json({ error: "Erro ao marcar como enviado" }, 500);
  }

  return json({ updated: true });
}

async function handleFailed(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>
) {
  const { reminder_id, error: errorMsg, retryable } = body as {
    reminder_id: string;
    error: string;
    retryable?: boolean;
  };

  if (!reminder_id) return json({ error: "reminder_id obrigatório" }, 400);
  if (!errorMsg)    return json({ error: "error é obrigatório" }, 400);

  // Busca tentativas atuais
  const { data: reminder } = await admin
    .from("appointment_reminders")
    .select("attempts, max_attempts")
    .eq("id", reminder_id)
    .single();

  if (!reminder) return json({ error: "Lembrete não encontrado" }, 404);

  const attempts     = (reminder.attempts ?? 0) + 1;
  const maxAttempts  = reminder.max_attempts ?? MAX_ATTEMPTS;
  const nonRetryable = retryable === false || isNonRetryable(errorMsg);
  const exhausted    = attempts >= maxAttempts;

  // Determina próximo status
  const newStatus = (nonRetryable || exhausted) ? "failed" : "pending";

  // Se vai retentativa, agenda para daqui a 5 minutos (backoff simples)
  const nextScheduledAt = newStatus === "pending"
    ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
    : null;

  const updateData: Record<string, unknown> = {
    status:               newStatus,
    attempts,
    last_error:           errorMsg,
    error_retryable:      !nonRetryable,
    processing_at:        null,
    processing_worker_id: null,
    updated_at:           new Date().toISOString(),
  };

  if (newStatus === "failed") {
    updateData.failed_at = new Date().toISOString();
  }

  if (nextScheduledAt) {
    updateData.scheduled_at = nextScheduledAt;
  }

  await admin.from("appointment_reminders").update(updateData).eq("id", reminder_id);

  console.log(`[reminders] reminder ${reminder_id} → ${newStatus} (attempt ${attempts}/${maxAttempts}, retryable: ${!nonRetryable})`);

  return json({
    updated:     true,
    new_status:  newStatus,
    attempts,
    max_attempts: maxAttempts,
    retryable:   !nonRetryable,
    retry_at:    nextScheduledAt,
  });
}

async function handleList(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  userId: string
) {
  const { appointment_id, client_id } = body as {
    appointment_id?: string;
    client_id?: string;
  };

  if (!appointment_id && !client_id) {
    return json({ error: "appointment_id ou client_id obrigatório" }, 400);
  }

  let query = admin
    .from("appointment_reminders")
    .select(`
      id, channel, scheduled_at, status,
      sent_at, failed_at, cancelled_at,
      attempts, max_attempts, last_error,
      provider_message_id, created_at,
      reminder_setting_id,
      appointment_reminder_settings ( timing_type, send_time, days_before, hours_before )
    `)
    .order("scheduled_at", { ascending: true });

  if (appointment_id) query = query.eq("appointment_id", appointment_id);
  if (client_id)      query = query.eq("client_id", client_id);

  const { data, error } = await query.limit(200);

  if (error) return json({ error: "Erro ao buscar lembretes" }, 500);
  return json({ reminders: data ?? [] });
}

async function handleCancel(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>
) {
  const { appointment_id } = body as { appointment_id: string };
  if (!appointment_id) return json({ error: "appointment_id obrigatório" }, 400);

  const { data, error } = await admin.rpc("cancel_appointment_reminders", {
    p_appointment_id: appointment_id,
  });

  if (error) return json({ error: "Erro ao cancelar lembretes" }, 500);
  return json({ cancelled: data ?? 0 });
}

// ── Servidor principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Aceita service_role (n8n) ou JWT (frontend)
  const authHeader   = req.headers.get("Authorization") ?? "";
  const serviceKeyH  = req.headers.get("X-Service-Key") ?? "";
  const isServiceKey = serviceKeyH === SVC_KEY || authHeader === `Bearer ${SVC_KEY}`;

  let userId = "service";
  if (!isServiceKey) {
    // Valida JWT
    if (!authHeader) return json({ error: "Não autenticado" }, 401);
    const userClient = createClient(SUPA_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sessão inválida" }, 401);
    userId = user.id;
  }

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const { action } = body as { action: string };
  if (!action) return json({ error: "action é obrigatório" }, 400);

  // Ações restritas ao service_role (n8n)
  const serviceOnlyActions = ["claim", "sent", "failed"];
  if (serviceOnlyActions.includes(action) && !isServiceKey) {
    return json({ error: "Esta ação requer service_role key" }, 403);
  }

  try {
    switch (action) {
      case "claim":  return await handleClaim(admin, body);
      case "sent":   return await handleSent(admin, body);
      case "failed": return await handleFailed(admin, body);
      case "list":   return await handleList(admin, body, userId);
      case "cancel": return await handleCancel(admin, body);
      default:       return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[appointment-reminders] Unhandled error:", err);
    return json({ error: (err as Error).message ?? "Erro interno" }, 500);
  }
});
