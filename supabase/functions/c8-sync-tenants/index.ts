/**
 * Edge Function: c8-sync-tenants
 * Projeto: Maestr.ia
 *
 * Garante que o usuário principal de cada cliente existe no Banco B daquele
 * cliente. Idempotente — se o usuário já existe, atualiza os metadados mas
 * não altera a senha. Se não existe, cria com senha temporária e registra
 * em crm_client_plans.
 *
 * Não usa mais CRM_URL, CRM_API_KEY, C8_ANON_KEY.
 *
 * Body (opcional):
 *   client_id — sincroniza apenas um cliente específico
 *
 * Secrets necessários:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Banco A (injetados automaticamente)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const groups = 3; const groupLen = 4;
  let pwd = "";
  const bytes = new Uint8Array(groups * groupLen);
  crypto.getRandomValues(bytes);
  for (let g = 0; g < groups; g++) {
    if (g > 0) pwd += "-";
    for (let i = 0; i < groupLen; i++) pwd += chars[bytes[g * groupLen + i] % chars.length];
  }
  return pwd;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const maestriaAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const jwt = authHeader.replace("Bearer ", "").trim();
    let callerId: string | null = null;
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      callerId = payload.sub ?? null;
    } catch { return json({ error: "Token inválido" }, 401); }
    if (!callerId) return json({ error: "Token sem sub" }, 401);

    const { data: profile } = await maestriaAdmin
      .from("profiles").select("role, organization_id").eq("id", callerId).single();
    if (!["owner", "admin"].includes(profile?.role ?? ""))
      return json({ error: "Apenas owner/admin" }, 403);

    const orgId = profile.organization_id as string;

    let filterClientId: string | null = null;
    try { filterClientId = (await req.json())?.client_id ?? null; } catch { /* sem body */ }

    // ── Busca planos ativos com dados do cliente ───────────────────────────────
    let plansQuery = maestriaAdmin
      .from("crm_client_plans")
      .select(`
        client_id, plan_name, plan_value, max_users, due_day, billing_cycle,
        primary_user_email, contract_start, contract_end, provisioning_status,
        clients!inner(
          name, company, email,
          client_supabase_url, client_supabase_service_key, dashboard_slug
        )
      `)
      .eq("organization_id", orgId)
      .neq("subscription_status", "cancelado");

    if (filterClientId) plansQuery = plansQuery.eq("client_id", filterClientId);

    const { data: plans, error: plansErr } = await plansQuery;
    if (plansErr) return json({ error: plansErr.message }, 500);
    if (!plans?.length) return json({ success: true, synced: 0, results: [] });

    const results: Array<{
      client_id: string; client_name: string; success: boolean;
      action?: string; error?: string;
    }> = [];

    for (const plan of plans) {
      const cd = plan.clients as unknown as {
        name: string; company: string | null; email: string | null;
        client_supabase_url: string | null; client_supabase_service_key: string | null;
        dashboard_slug: string | null;
      } | null;

      const clientName = cd?.company || cd?.name || plan.client_id;

      if (!cd?.client_supabase_url || !cd?.client_supabase_service_key) {
        results.push({ client_id: plan.client_id, client_name: clientName, success: false,
          error: "Banco B não configurado (sem client_supabase_url ou service_key)" });
        continue;
      }

      const adminEmail = plan.primary_user_email ?? cd.email;
      if (!adminEmail) {
        results.push({ client_id: plan.client_id, client_name: clientName, success: false,
          error: "Sem e-mail principal definido" });
        continue;
      }

      try {
        const bankBAdmin = createClient(cd.client_supabase_url, cd.client_supabase_service_key,
          { auth: { persistSession: false } });

        // Verifica se usuário já existe
        const { data: usersPage } = await bankBAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existing = usersPage?.users?.find(
          (u: { email?: string }) => u.email?.toLowerCase() === adminEmail.toLowerCase()
        );

        let action: string;

        if (existing) {
          // Só atualiza metadados — preserva senha atual
          await bankBAdmin.auth.admin.updateUserById(existing.id, {
            user_metadata: {
              ...existing.user_metadata,
              full_name: cd.company ?? cd.name ?? adminEmail.split("@")[0],
              client_id: plan.client_id,
              role: existing.user_metadata?.role ?? "owner",
            },
          });
          action = "updated_metadata";
        } else {
          // Cria usuário com senha temporária
          const tempPwd = generateTempPassword();
          const { error: createErr } = await bankBAdmin.auth.admin.createUser({
            email:         adminEmail.toLowerCase(),
            password:      tempPwd,
            email_confirm: true,
            user_metadata: {
              full_name:  cd.company ?? cd.name ?? adminEmail.split("@")[0],
              client_id:  plan.client_id,
              role:       "owner",
            },
          });
          if (createErr) throw new Error(createErr.message);
          action = "created";
        }

        // Atualiza status no Banco A
        await maestriaAdmin
          .from("crm_client_plans")
          .update({ provisioned_at: new Date().toISOString(), provisioning_status: "confirmed" })
          .eq("client_id", plan.client_id);

        results.push({ client_id: plan.client_id, client_name: clientName, success: true, action });
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
