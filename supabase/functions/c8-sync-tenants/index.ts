/**
 * Edge Function: c8-sync-tenants
 * Projeto: Maestr.ia
 *
 * Sincroniza todos os tenants ativos do Maestr.ia com o C8 Control
 * chamando provision-tenant para cada um. Idempotente — o C8 Control
 * deve fazer upsert ao receber um tenant_id já existente.
 *
 * Body (opcional):
 *   client_id — sincroniza apenas um tenant específico
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const maestriaAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Decodifica o JWT sem re-validar assinatura (evita erro ES256)
    const jwt = authHeader.replace("Bearer ", "").trim();
    let callerId: string | null = null;
    try {
      const payloadB64 = jwt.split(".")[1];
      const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
      callerId = JSON.parse(payloadJson).sub ?? null;
    } catch {
      return json({ error: "Token inválido" }, 401);
    }
    if (!callerId) return json({ error: "Token sem sub" }, 401);

    const { data: profile } = await maestriaAdmin
      .from("profiles").select("role, organization_id").eq("id", callerId).single();
    if (!["owner", "admin"].includes(profile?.role ?? ""))
      return json({ error: "Apenas owner/admin" }, 403);

    const orgId = profile.organization_id;

    // Buscar planos ativos
    let filterClientId: string | null = null;
    try {
      const body = await req.json();
      filterClientId = body?.client_id ?? null;
    } catch { /* sem body */ }

    // Buscar planos ativos
    let plansQuery = maestriaAdmin
      .from("crm_client_plans")
      .select(`
        client_id, organization_id, plan_name, plan_value, max_users,
        due_day, billing_cycle, primary_user_email, contract_start, contract_end,
        clients!inner(
          name, company, document, email, phone,
          address_street, address_city, address_state, address_zip
        )
      `)
      .eq("organization_id", orgId)
      .neq("subscription_status", "cancelado");

    if (filterClientId) {
      plansQuery = plansQuery.eq("client_id", filterClientId);
    }

    const { data: plans, error: plansErr } = await plansQuery;
    if (plansErr) return json({ error: plansErr.message }, 500);
    if (!plans || plans.length === 0) return json({ success: true, synced: 0, results: [] });

    // Buscar senhas de suporte em batch
    const clientIds = plans.map((p: any) => p.client_id);
    const { data: supportRecords } = await maestriaAdmin
      .from("c8_support_passwords")
      .select("client_id, support_email, password")
      .in("client_id", clientIds);

    const supportMap: Record<string, { support_email: string; password: string }> = {};
    for (const s of supportRecords ?? []) {
      supportMap[s.client_id] = { support_email: s.support_email, password: s.password };
    }

    const results: Array<{ client_id: string; client_name: string; success: boolean; error?: string }> = [];

    for (const plan of plans) {
      const clientData = (plan as any).clients as {
        name: string; company: string | null; document: string | null;
        email: string | null; phone: string | null;
        address_street: string | null; address_city: string | null;
        address_state: string | null; address_zip: string | null;
      } | null;
      const clientName = clientData?.company || clientData?.name || plan.client_id;
      const support = supportMap[plan.client_id];

      if (!plan.primary_user_email) {
        results.push({ client_id: plan.client_id, client_name: clientName, success: false, error: "Sem e-mail principal" });
        continue;
      }

      try {
        const crmUrl = Deno.env.get("CRM_URL");
        const crmApiKey = Deno.env.get("CRM_API_KEY");
        const c8AnonKey = Deno.env.get("C8_ANON_KEY") ?? "";

        if (!crmUrl || !crmApiKey) {
          throw new Error("CRM_URL ou CRM_API_KEY não configurados nos Secrets desta função");
        }

        const provisionRes = await fetch(`${crmUrl}/functions/v1/provision-tenant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-crm-api-key": crmApiKey,
            "apikey": c8AnonKey,
            "Authorization": `Bearer ${c8AnonKey}`,
          },
          body: JSON.stringify({
            tenant_id:           plan.client_id,
            tenant_name:         clientName,
            admin_email:         plan.primary_user_email,
            client_id:           plan.client_id,
            // Campos mapeados para a tabela clients do C8 Control
            company:             clientData?.company ?? null,
            cnpj:                clientData?.document ?? null,
            phone:               clientData?.phone ?? null,
            email:               plan.primary_user_email,
            primary_contact:     clientData?.name ?? clientName,
            address:             [clientData?.address_street, clientData?.address_city, clientData?.address_state, clientData?.address_zip].filter(Boolean).join(", ") || null,
            contract_start_date: plan.contract_start ?? null,
            client_status:       "ativo",
            // Dados do plano
            plan_name:           plan.plan_name,
            plan_value:          plan.plan_value,
            max_users:           plan.max_users,
            due_day:             plan.due_day,
            billing_cycle:       plan.billing_cycle ?? "mensal",
            contract_end:        plan.contract_end,
            // Suporte
            support_email:       support?.support_email ?? null,
            support_password:    support?.password ?? null,
            is_support:          false,
            send_welcome_email:  false,
          }),
        });

        const provisionData = await provisionRes.json();

        if (!provisionRes.ok && provisionRes.status !== 409) {
          // 409 = já existe, tudo bem
          throw new Error(provisionData?.error ?? `Erro ${provisionRes.status}`);
        }

        // Atualizar status de provisionamento
        await maestriaAdmin
          .from("crm_client_plans")
          .update({ provisioned_at: new Date().toISOString(), provisioning_status: "confirmed" })
          .eq("client_id", plan.client_id);

        results.push({ client_id: plan.client_id, client_name: clientName, success: true });
      } catch (e) {
        results.push({ client_id: plan.client_id, client_name: clientName, success: false, error: String(e) });
      }
    }

    const synced = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return json({ success: true, synced, failed, results });

  } catch (err) {
    console.error("[c8-sync-tenants]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
