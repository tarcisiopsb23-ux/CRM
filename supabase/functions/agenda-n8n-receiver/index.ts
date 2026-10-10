/**
 * agenda-n8n-receiver
 *
 * Edge Function que recebe eventos do Google Calendar via n8n e os sincroniza
 * com o Banco A do C8 Control.
 *
 * Direção: Google Calendar → n8n → POST /agenda-n8n-receiver → Banco A
 *
 * O workflow n8n deve:
 *   1. Receber o push notification do Google Calendar (via watch channel ou polling)
 *   2. Buscar os detalhes do evento no Google Calendar API
 *   3. Fazer POST nesta Edge Function com o payload abaixo
 *
 * Payload esperado (JSON):
 * {
 *   "client_id":        "uuid do cliente no C8",
 *   "google_event_id":  "id do evento no Google Calendar",
 *   "action":           "created" | "updated" | "cancelled",
 *   "summary":          "Título do evento",
 *   "start_at":         "2026-01-15T10:00:00-03:00",
 *   "end_at":           "2026-01-15T11:00:00-03:00",
 *   "customer_name":    "Nome do cliente (opcional)",
 *   "customer_email":   "email@cliente.com (opcional)",
 *   "customer_phone":   "+5511999999999 (opcional)",
 *   "notes":            "Descrição do evento (opcional)"
 * }
 *
 * Segurança:
 *   - Token de autenticação via header X-Webhook-Token
 *   - Token configurável por cliente em client_ai_settings.metadata.n8n_agenda.webhook_token
 *   - client_id validado contra a tabela clients
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   AGENDA_RECEIVER_DEFAULT_TOKEN  → token global de fallback (opcional)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const defaultToken   = Deno.env.get("AGENDA_RECEIVER_DEFAULT_TOKEN") ?? "";

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const {
    client_id,
    google_event_id,
    action,
    summary,
    start_at,
    end_at,
    customer_name,
    customer_email,
    customer_phone,
    notes,
  } = body as Record<string, string | undefined>;

  if (!client_id || !google_event_id || !action) {
    return json({ error: "client_id, google_event_id e action são obrigatórios" }, 400);
  }

  if (!["created", "updated", "cancelled"].includes(action)) {
    return json({ error: "action inválido: use created, updated ou cancelled" }, 400);
  }

  // ── Valida token de autenticação ────────────────────────────────────────────
  const incomingToken = req.headers.get("x-webhook-token") ?? "";

  // Busca token configurado pelo cliente
  const { data: settings } = await admin
    .from("client_ai_settings")
    .select("metadata")
    .eq("client_id", client_id)
    .maybeSingle();

  const clientToken = (settings?.metadata as any)?.n8n_agenda?.webhook_token ?? "";
  const expectedToken = clientToken || defaultToken;

  if (expectedToken && incomingToken !== expectedToken) {
    console.warn(`[agenda-n8n-receiver] Token inválido para client_id ${client_id}`);
    return json({ error: "Token de autenticação inválido" }, 401);
  }

  // ── Valida que o cliente existe ─────────────────────────────────────────────
  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("id", client_id)
    .maybeSingle();

  if (!client) {
    return json({ error: "Cliente não encontrado" }, 404);
  }

  // ── Verifica se já existe agendamento com este google_event_id ──────────────
  const { data: existing } = await admin
    .from("client_appointments")
    .select("id, status")
    .eq("client_id", client_id)
    .eq("google_event_id", google_event_id)
    .maybeSingle();

  try {
    if (action === "cancelled") {
      // ── Cancelar agendamento ─────────────────────────────────────────────
      if (existing?.id) {
        const { error } = await admin
          .from("client_appointments")
          .update({
            status:           "cancelled",
            cancelled_reason: "Cancelado via Google Calendar",
            updated_at:       new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("client_id", client_id);

        if (error) throw error;
        console.log(`[agenda-n8n-receiver] Agendamento ${existing.id} cancelado via Google Calendar.`);
      }
      return json({ success: true, action: "cancelled", appointment_id: existing?.id ?? null });
    }

    if (action === "created" || action === "updated") {
      if (!start_at || !end_at) {
        return json({ error: "start_at e end_at são obrigatórios para created/updated" }, 400);
      }

      const startDate  = new Date(start_at);
      const endDate    = new Date(end_at);
      const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60_000);

      if (existing?.id && action === "updated") {
        // ── Atualizar agendamento existente ────────────────────────────────
        const { error } = await admin
          .from("client_appointments")
          .update({
            service_name:   summary ?? existing.id,
            start_at:       startDate.toISOString(),
            end_at:         endDate.toISOString(),
            duration_min:   durationMin,
            customer_name:  customer_name ?? undefined,
            customer_email: customer_email ?? undefined,
            customer_phone: customer_phone ?? undefined,
            notes:          notes ?? undefined,
            source:         "google_calendar",
            updated_at:     new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("client_id", client_id);

        if (error) throw error;
        console.log(`[agenda-n8n-receiver] Agendamento ${existing.id} atualizado via Google Calendar.`);
        return json({ success: true, action: "updated", appointment_id: existing.id });
      }

      // ── Criar novo agendamento ─────────────────────────────────────────
      // Busca organization_id do cliente
      const { data: clientData } = await admin
        .from("clients")
        .select("organization_id")
        .eq("id", client_id)
        .single();

      const { data: inserted, error } = await admin
        .from("client_appointments")
        .insert({
          client_id:        client_id,
          organization_id:  clientData?.organization_id,
          customer_name:    customer_name ?? "Agendamento Google Calendar",
          customer_email:   customer_email ?? null,
          customer_phone:   customer_phone ?? null,
          service_id:       null,
          service_name:     summary ?? "Evento Google Calendar",
          start_at:         startDate.toISOString(),
          end_at:           endDate.toISOString(),
          duration_min:     durationMin,
          status:           "confirmed",
          source:           "google_calendar",
          google_event_id:  google_event_id,
          notes:            notes ?? null,
          metadata:         { synced_from_google: true },
        })
        .select("id")
        .single();

      if (error) throw error;
      console.log(`[agenda-n8n-receiver] Agendamento ${inserted.id} criado via Google Calendar.`);
      return json({ success: true, action: "created", appointment_id: inserted.id });
    }

  } catch (err) {
    console.error("[agenda-n8n-receiver] Erro:", err);
    return json({ error: "Erro interno ao processar agendamento" }, 500);
  }

  return json({ error: "action não reconhecida" }, 400);
});
