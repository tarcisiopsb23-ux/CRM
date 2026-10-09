/**
 * Edge Function: c8-sync-payments
 * Projeto: Maestr.ia
 *
 * Sincroniza pagamentos diretamente na tabela client_charges do Banco B
 * de cada cliente. Agrupa o payload por tenant_id e faz upsert em cada
 * Banco B individualmente.
 *
 * Não usa mais CRM_URL, CRM_API_KEY.
 *
 * Payload: array de PaymentPayload[]
 *
 * Secrets necessários:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Banco A (injetados automaticamente)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentPayload {
  tenant_id:       string;
  maestria_id:     string;  // ID no Banco A — usado como external_ref
  gateway:         string;
  gateway_id?:     string | null;
  gateway_url?:    string | null;
  description:     string;
  amount:          number;
  currency?:       string;
  due_date:        string;
  paid_at?:        string | null;
  status:          string;
  payment_method?: string;
  installments?:   number;
  is_recurring?:   boolean;
  recurrence_id?:  string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Mapeia status do Maestr.ia → status da tabela client_charges do Banco B
function mapStatus(status: string): string {
  const MAP: Record<string, string> = {
    confirmed: "CONFIRMED", received: "RECEIVED", pending: "PENDING",
    overdue: "OVERDUE", cancelled: "CANCELLED", refunded: "REFUNDED",
    CONFIRMED: "CONFIRMED", RECEIVED: "RECEIVED", PENDING: "PENDING",
    OVERDUE: "OVERDUE", CANCELLED: "CANCELLED", REFUNDED: "REFUNDED",
  };
  return MAP[status] ?? "PENDING";
}

function mapBillingType(method?: string): string {
  if (!method) return "PIX";
  const m = method.toUpperCase();
  if (m.includes("PIX"))    return "PIX";
  if (m.includes("BOLETO")) return "BOLETO";
  if (m.includes("CREDIT") || m.includes("CARTAO") || m.includes("CARD")) return "CREDIT_CARD";
  return "PIX";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const maestriaAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user: caller }, error: jwtErr } = await maestriaAdmin.auth.getUser(jwt);
    if (jwtErr || !caller) return json({ error: "Sessão inválida" }, 401);

    const { data: profile } = await maestriaAdmin
      .from("profiles").select("role").eq("id", caller.id).single();
    if (!["owner", "admin"].includes(profile?.role ?? ""))
      return json({ error: "Apenas owner/admin" }, 403);

    const payments: PaymentPayload[] = await req.json();
    if (!Array.isArray(payments) || !payments.length)
      return json({ error: "Payload deve ser um array de pagamentos" }, 400);

    // ── Agrupa pagamentos por tenant_id ───────────────────────────────────────
    const byTenant = new Map<string, PaymentPayload[]>();
    for (const p of payments) {
      if (!p.tenant_id) continue;
      if (!byTenant.has(p.tenant_id)) byTenant.set(p.tenant_id, []);
      byTenant.get(p.tenant_id)!.push(p);
    }

    // ── Busca credenciais de todos os clientes envolvidos de uma vez ──────────
    const tenantIds = Array.from(byTenant.keys());
    const { data: clients } = await maestriaAdmin
      .from("clients")
      .select("id, client_supabase_url, client_supabase_service_key")
      .in("id", tenantIds);

    const credMap = new Map<string, { url: string; key: string }>();
    for (const c of clients ?? []) {
      const url = (c as Record<string, unknown>).client_supabase_url as string | null;
      const key = (c as Record<string, unknown>).client_supabase_service_key as string | null;
      if (url && key) credMap.set(c.id, { url, key });
    }

    // ── Upsert em cada Banco B ────────────────────────────────────────────────
    const results: Array<{
      tenant_id: string; success: boolean; upserted?: number; error?: string;
    }> = [];

    for (const [tenantId, tenantPayments] of byTenant) {
      const creds = credMap.get(tenantId);
      if (!creds) {
        results.push({ tenant_id: tenantId, success: false,
          error: "Banco B não configurado para este cliente" });
        continue;
      }

      const bankB = createClient(creds.url, creds.key, { auth: { persistSession: false } });

      // Monta registros para client_charges
      const rows = tenantPayments.map(p => ({
        client_id:      tenantId,
        asaas_id:       p.gateway_id ?? null,
        description:    p.description || "",
        value:          p.amount,
        due_date:       p.due_date,
        payment_date:   p.paid_at ?? null,
        billing_type:   mapBillingType(p.payment_method),
        status:         mapStatus(p.status),
        invoice_url:    p.gateway_url ?? null,
        external_ref:   p.maestria_id,
        metadata: {
          gateway:      p.gateway,
          installments: p.installments ?? null,
          is_recurring: p.is_recurring ?? false,
          recurrence_id:p.recurrence_id ?? null,
          currency:     p.currency ?? "BRL",
        },
      }));

      try {
        const { error: upsertErr } = await bankB
          .from("client_charges")
          .upsert(rows, { onConflict: "asaas_id", ignoreDuplicates: false });

        if (upsertErr) throw new Error(upsertErr.message);
        results.push({ tenant_id: tenantId, success: true, upserted: rows.length });
      } catch (e) {
        // Fallback: tenta upsert por external_ref se asaas_id não é unique
        try {
          const rowsNoAsaasId = rows.map(r => ({ ...r, asaas_id: r.asaas_id ?? undefined }));
          const { error: fallbackErr } = await bankB
            .from("client_charges")
            .upsert(rowsNoAsaasId, { onConflict: "external_ref", ignoreDuplicates: false });
          if (fallbackErr) throw new Error(fallbackErr.message);
          results.push({ tenant_id: tenantId, success: true, upserted: rows.length });
        } catch (e2) {
          results.push({ tenant_id: tenantId, success: false, error: String(e2) });
        }
      }
    }

    const synced = results.filter(r => r.success).reduce((a, r) => a + (r.upserted ?? 0), 0);
    const failed = results.filter(r => !r.success).length;
    return json({ success: true, synced, failed, results });

  } catch (err) {
    console.error("[c8-sync-payments]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
