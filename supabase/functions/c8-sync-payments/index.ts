/**
 * Edge Function: c8-sync-payments
 * Projeto: Maestr.ia
 *
 * Sincroniza pagamentos do Maestr.ia para o C8 Control.
 * Chama a edge function sync-payments do projeto C8 Control.
 *
 * Secrets necessários:
 *   CRM_URL     — URL do projeto C8 Control
 *   CRM_API_KEY — Chave compartilhada
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentPayload {
  tenant_id:      string;
  maestria_id:    string;
  gateway:        string;
  gateway_id?:    string | null;
  gateway_url?:   string | null;
  description:    string;
  amount:         number;
  currency?:      string;
  due_date:       string;
  paid_at?:       string | null;
  status:         string;
  payment_method?: string;
  installments?:  number;
  is_recurring?:  boolean;
  recurrence_id?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
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

    // ── Payload ───────────────────────────────────────────────────────────────
    const payments: PaymentPayload[] = await req.json();
    if (!Array.isArray(payments) || payments.length === 0)
      return json({ error: "Payload deve ser um array de pagamentos" }, 400);

    const crmUrl = Deno.env.get("CRM_URL");
    const crmApiKey = Deno.env.get("CRM_API_KEY");

    if (!crmUrl || !crmApiKey)
      return json({ error: "CRM_URL ou CRM_API_KEY não configurados" }, 500);

    // ── Chamar sync-payments do C8 Control ────────────────────────────────────
    const syncRes = await fetch(`${crmUrl}/functions/v1/sync-payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-crm-api-key": crmApiKey,
      },
      body: JSON.stringify(payments),
    });

    const syncData = await syncRes.json();

    if (!syncRes.ok) {
      console.error("[c8-sync-payments] C8 Control error:", syncData);
      return json({ error: syncData?.error ?? `Erro ${syncRes.status}`, details: syncData }, 500);
    }

    return json({ success: true, synced: payments.length, result: syncData });

  } catch (err) {
    console.error("[c8-sync-payments]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
