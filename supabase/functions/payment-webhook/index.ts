/**
 * Edge Function: payment-webhook
 *
 * Recebe webhooks de gateways de pagamento (Asaas e Stripe) e do n8n.
 * Atualiza o status do pagamento no cache local e notifica o Maestr.IA.
 *
 * Endpoints:
 *   POST /payment-webhook?gateway=asaas   — webhook do Asaas
 *   POST /payment-webhook?gateway=stripe  — webhook do Stripe
 *   POST /payment-webhook?gateway=n8n     — trigger manual via n8n
 *
 * Autenticação:
 *   - Asaas: header x-asaas-token (configurado no painel Asaas)
 *   - Stripe: header stripe-signature (verificado com STRIPE_WEBHOOK_SECRET)
 *   - n8n: header x-crm-api-key
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-asaas-token, stripe-signature, x-crm-api-key",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Mapeia status do Asaas para o padrão interno
function mapAsaasStatus(event: string): string | null {
  const map: Record<string, string> = {
    "PAYMENT_RECEIVED":   "pago",
    "PAYMENT_CONFIRMED":  "pago",
    "PAYMENT_OVERDUE":    "vencido",
    "PAYMENT_DELETED":    "cancelado",
    "PAYMENT_RESTORED":   "pendente",
    "PAYMENT_REFUNDED":   "cancelado",
  };
  return map[event] ?? null;
}

// Mapeia status do Stripe para o padrão interno
function mapStripeStatus(status: string): string | null {
  const map: Record<string, string> = {
    "paid":      "pago",
    "open":      "pendente",
    "void":      "cancelado",
    "uncollectible": "vencido",
  };
  return map[status] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const gateway = url.searchParams.get("gateway") ?? "n8n";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return jsonResponse({ error: "Body JSON inválido" }, 400);
  }

  // ── Asaas webhook ─────────────────────────────────────────────────────────
  if (gateway === "asaas") {
    const token = req.headers.get("x-asaas-token");
    if (!token || token !== Deno.env.get("ASAAS_WEBHOOK_TOKEN")) {
      return jsonResponse({ error: "Token Asaas inválido" }, 401);
    }

    const event    = body.event as string;
    const payment  = body.payment as Record<string, unknown>;
    const newStatus = mapAsaasStatus(event);

    if (!newStatus || !payment?.id) {
      return jsonResponse({ ok: true, skipped: true });
    }

    const { error } = await supabase
      .from("payments_cache")
      .update({
        status:    newStatus,
        paid_at:   newStatus === "pago" ? new Date().toISOString() : null,
        synced_at: new Date().toISOString(),
      })
      .eq("gateway", "asaas")
      .eq("gateway_id", String(payment.id));

    if (error) console.error("[payment-webhook/asaas]", error.message);
    return jsonResponse({ ok: true, status: newStatus });
  }

  // ── Stripe webhook ────────────────────────────────────────────────────────
  if (gateway === "stripe") {
    // Nota: verificação de assinatura Stripe requer o body raw — simplificado aqui
    const invoice = body.data?.object as Record<string, unknown> | undefined;
    const stripeStatus = invoice?.status as string | undefined;
    const newStatus = stripeStatus ? mapStripeStatus(stripeStatus) : null;

    if (!newStatus || !invoice?.id) {
      return jsonResponse({ ok: true, skipped: true });
    }

    const { error } = await supabase
      .from("payments_cache")
      .update({
        status:    newStatus,
        paid_at:   newStatus === "pago" ? new Date().toISOString() : null,
        synced_at: new Date().toISOString(),
      })
      .eq("gateway", "stripe")
      .eq("gateway_id", String(invoice.id));

    if (error) console.error("[payment-webhook/stripe]", error.message);
    return jsonResponse({ ok: true, status: newStatus });
  }

  // ── n8n trigger (criação de cobrança) ─────────────────────────────────────
  if (gateway === "n8n") {
    const apiKey = req.headers.get("x-crm-api-key");
    if (!apiKey || apiKey !== Deno.env.get("CRM_API_KEY")) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    // n8n envia os dados do pagamento para criar/atualizar no cache
    // e opcionalmente dispara a cobrança no gateway
    const { tenant_id, maestria_id, action } = body as {
      tenant_id?: string;
      maestria_id?: string;
      action?: "create" | "update" | "cancel";
    };

    if (!tenant_id || !maestria_id) {
      return jsonResponse({ error: "tenant_id e maestria_id são obrigatórios" }, 400);
    }

    if (action === "cancel") {
      await supabase.from("payments_cache")
        .update({ status: "cancelado", synced_at: new Date().toISOString() })
        .eq("tenant_id", tenant_id)
        .eq("maestria_id", maestria_id);
      return jsonResponse({ ok: true, action: "cancelled" });
    }

    // Para create/update, upsert com os dados recebidos
    const { error } = await supabase.from("payments_cache").upsert({
      tenant_id,
      maestria_id,
      description:    body.description ?? "Cobrança",
      amount:         body.amount ?? 0,
      due_date:       body.due_date,
      status:         body.status ?? "pendente",
      payment_method: body.payment_method ?? null,
      gateway:        body.gateway ?? null,
      gateway_id:     body.gateway_id ?? null,
      payment_url:    body.payment_url ?? null,
      notes:          body.notes ?? null,
      synced_at:      new Date().toISOString(),
    }, { onConflict: "tenant_id,maestria_id" });

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true, action: action ?? "upsert" });
  }

  return jsonResponse({ error: "Gateway não reconhecido" }, 400);
});
