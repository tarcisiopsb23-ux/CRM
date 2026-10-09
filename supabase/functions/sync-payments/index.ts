/**
 * Edge Function: sync-payments
 *
 * Recebe dados de pagamento do Maestr.IA, n8n ou webhook de gateway
 * e atualiza o payments_cache no C8 Control.
 *
 * Autenticação: header x-crm-api-key (mesma chave usada pelo Maestr.IA)
 *
 * Body esperado (array ou objeto único):
 * {
 *   tenant_id:      string   — UUID do tenant
 *   maestria_id?:   string   — ID no Maestr.IA
 *   gateway?:       string   — 'asaas' | 'stripe' | 'manual'
 *   gateway_id?:    string   — ID da cobrança no gateway
 *   gateway_url?:   string   — link de pagamento
 *   description:    string
 *   amount:         number
 *   currency?:      string   — default 'BRL'
 *   due_date?:      string   — ISO date
 *   paid_at?:       string   — ISO datetime
 *   status:         string   — 'pendente'|'pago'|'vencido'|'cancelado'|'estornado'|'processando'
 *   payment_method?: string
 *   installments?:  number
 *   is_recurring?:  boolean
 *   recurrence_id?: string
 *   notes?:         string
 *   metadata?:      object
 * }
 *
 * Também aceita webhooks nativos do Asaas e Stripe (detectados pelo header ou campo event).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-api-key, stripe-signature",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normaliza evento do Asaas para o formato interno
function normalizeAsaas(event: any): Record<string, any> | null {
  const p = event.payment ?? event;
  if (!p?.externalReference && !p?.id) return null;
  const statusMap: Record<string, string> = {
    PENDING: "pendente", RECEIVED: "pago", CONFIRMED: "pago",
    OVERDUE: "vencido", REFUNDED: "estornado", CANCELED: "cancelado",
    AWAITING_RISK_ANALYSIS: "processando",
  };
  return {
    gateway:        "asaas",
    gateway_id:     p.id,
    gateway_url:    p.bankSlipUrl ?? p.invoiceUrl ?? null,
    maestria_id:    p.externalReference ?? null,
    tenant_id:      p.externalReference?.split(":")[0] ?? null, // convenção: "tenantId:maestriaId"
    description:    p.description ?? "Cobrança",
    amount:         p.value ?? 0,
    currency:       "BRL",
    due_date:       p.dueDate ?? null,
    paid_at:        p.paymentDate ?? null,
    status:         statusMap[p.status] ?? "pendente",
    payment_method: p.billingType?.toLowerCase() ?? null,
    installments:   p.installmentCount ?? 1,
    is_recurring:   !!p.subscription,
    recurrence_id:  p.subscription ?? null,
  };
}

// Normaliza evento do Stripe para o formato interno
function normalizeStripe(event: any): Record<string, any> | null {
  const obj = event.data?.object;
  if (!obj) return null;
  const statusMap: Record<string, string> = {
    succeeded: "pago", requires_payment_method: "pendente",
    canceled: "cancelado", processing: "processando",
    requires_action: "pendente", paid: "pago",
  };
  const tenantId = obj.metadata?.tenant_id ?? null;
  if (!tenantId) return null;
  return {
    gateway:        "stripe",
    gateway_id:     obj.id,
    gateway_url:    obj.hosted_invoice_url ?? obj.receipt_url ?? null,
    maestria_id:    obj.metadata?.maestria_id ?? null,
    tenant_id:      tenantId,
    description:    obj.description ?? obj.lines?.data?.[0]?.description ?? "Cobrança",
    amount:         (obj.amount_due ?? obj.amount ?? 0) / 100,
    currency:       (obj.currency ?? "brl").toUpperCase(),
    due_date:       obj.due_date ? new Date(obj.due_date * 1000).toISOString().split("T")[0] : null,
    paid_at:        obj.status_transitions?.paid_at
                      ? new Date(obj.status_transitions.paid_at * 1000).toISOString()
                      : null,
    status:         statusMap[obj.status] ?? "pendente",
    payment_method: obj.collection_method === "charge_automatically" ? "credit_card" : "boleto",
    installments:   1,
    is_recurring:   !!obj.subscription,
    recurrence_id:  obj.subscription ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // ── Detectar origem do webhook ────────────────────────────────────────────
  const isStripeWebhook = req.headers.get("stripe-signature") !== null;
  const contentType = req.headers.get("content-type") ?? "";

  let rawBody: string;
  try { rawBody = await req.text(); } catch { return jsonResponse({ error: "Body inválido" }, 400); }

  let payments: Record<string, any>[] = [];

  if (isStripeWebhook) {
    // Webhook nativo do Stripe
    try {
      const event = JSON.parse(rawBody);
      const normalized = normalizeStripe(event);
      if (normalized) payments = [normalized];
    } catch { return jsonResponse({ error: "Stripe webhook inválido" }, 400); }

  } else {
    // Verificar API key para chamadas do Maestr.IA / n8n
    const apiKey = req.headers.get("x-crm-api-key");
    if (!apiKey || apiKey !== Deno.env.get("CRM_API_KEY")) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    let body: any;
    try { body = JSON.parse(rawBody); } catch { return jsonResponse({ error: "JSON inválido" }, 400); }

    // Detectar se é webhook do Asaas
    if (body.event && body.payment) {
      const normalized = normalizeAsaas(body);
      if (normalized) payments = [normalized];
    } else {
      // Formato interno do Maestr.IA / n8n
      payments = Array.isArray(body) ? body : [body];
    }
  }

  if (payments.length === 0) {
    return jsonResponse({ error: "Nenhum pagamento para processar" }, 400);
  }

  const results = { synced: 0, errors: [] as string[] };

  for (const p of payments) {
    if (!p.tenant_id || !p.description || p.amount === undefined) {
      results.errors.push(`Campos obrigatórios ausentes: tenant_id, description, amount`);
      continue;
    }

    // Upsert por maestria_id + tenant_id, ou gateway_id + gateway
    const matchKey = p.maestria_id
      ? { maestria_id: p.maestria_id, tenant_id: p.tenant_id }
      : p.gateway_id
        ? { gateway_id: p.gateway_id, gateway: p.gateway }
        : null;

    const payload = {
      tenant_id:      p.tenant_id,
      maestria_id:    p.maestria_id ?? null,
      gateway:        p.gateway ?? "manual",
      gateway_id:     p.gateway_id ?? null,
      gateway_url:    p.gateway_url ?? null,
      description:    p.description,
      amount:         Number(p.amount),
      currency:       p.currency ?? "BRL",
      due_date:       p.due_date ?? null,
      paid_at:        p.paid_at ?? null,
      status:         p.status ?? "pendente",
      payment_method: p.payment_method ?? null,
      installments:   p.installments ?? 1,
      is_recurring:   p.is_recurring ?? false,
      recurrence_id:  p.recurrence_id ?? null,
      notes:          p.notes ?? null,
      metadata:       p.metadata ?? null,
      synced_at:      new Date().toISOString(),
    };

    let error;
    if (matchKey) {
      // Tenta atualizar primeiro
      const { error: updateErr, count } = await supabase
        .from("payments_cache")
        .update(payload)
        .match(matchKey);

      if (updateErr || count === 0) {
        // Se não encontrou, insere
        const { error: insertErr } = await supabase.from("payments_cache").insert(payload);
        error = insertErr;
      } else {
        error = updateErr;
      }
    } else {
      const { error: insertErr } = await supabase.from("payments_cache").insert(payload);
      error = insertErr;
    }

    if (error) {
      console.error("[sync-payments] erro:", error.message);
      results.errors.push(error.message);
    } else {
      results.synced++;
    }
  }

  return jsonResponse({ ...results, total: payments.length });
});
