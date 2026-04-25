/**
 * Edge Function: c8-support-user
 * Projeto: Maestr.ia
 *
 * Gerencia o usuário de suporte (suporte@agenciac8.com.br) no C8 Control.
 * Esse usuário existe uma única vez no auth.users do C8 Control e acessa
 * qualquer tenant via user_metadata.tenant_id (trocado a cada acesso).
 *
 * Actions:
 *   provision  — cria/atualiza senha do suporte para um tenant específico
 *   reset_all  — gera novas senhas para todos os tenants da organização
 *
 * Secrets:
 *   C8_SUPABASE_URL, C8_SUPABASE_SERVICE_KEY
 *   C8_SUPPORT_EMAIL (default: suporte@agenciac8.com.br)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
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
      .from("profiles").select("role, organization_id").eq("id", caller.id).single();
    if (!["owner", "admin"].includes(profile?.role ?? ""))
      return json({ error: "Apenas owner/admin" }, 403);

    const orgId = profile.organization_id;

    // ── C8 Control client ─────────────────────────────────────────────────────
    const c8Url = Deno.env.get("C8_SUPABASE_URL");
    const c8Key = Deno.env.get("C8_SUPABASE_SERVICE_KEY");
    if (!c8Url || !c8Key) return json({ error: "C8_SUPABASE_URL/KEY não configurados" }, 500);

    const c8Admin = createClient(c8Url, c8Key, { auth: { persistSession: false } });
    const supportEmail = Deno.env.get("C8_SUPPORT_EMAIL") ?? "suporte@agenciac8.com.br";
    // ── Payload ───────────────────────────────────────────────────────────────
    const body = await req.json() as {
      action: "provision" | "reset_all";
      client_id?: string;
      client_name?: string;
    };

    const { action, client_id, client_name } = body;

    // ── Helper: upsert support user in C8 Control ─────────────────────────────
    async function provisionSupport(tenantId: string, tenantName: string) {
      const password = generatePassword();

      const crmUrl = Deno.env.get("CRM_URL");
      const crmApiKey = Deno.env.get("CRM_API_KEY");

      // Check if we already have a support record for this tenant
      const { data: existing } = await maestriaAdmin
        .from("c8_support_passwords")
        .select("support_email, c8_user_id")
        .eq("organization_id", orgId)
        .eq("client_id", tenantId)
        .maybeSingle();

      // Reuse existing support email or generate a new one based on client_id
      let emailForTenant: string;
      if (existing?.support_email) {
        emailForTenant = existing.support_email;
      } else {
        const code = tenantId.replace(/-/g, "").substring(0, 8);
        const domain = (Deno.env.get("C8_SUPPORT_EMAIL") ?? "suporte@agenciac8.com.br").split("@")[1];
        emailForTenant = `${code}@${domain}`;
      }

      if (crmUrl && crmApiKey) {
        // Nova arquitetura: chama provision-tenant do C8 Control com is_support: true
        const provisionRes = await fetch(`${crmUrl}/functions/v1/provision-tenant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-crm-api-key": crmApiKey,
            "apikey": Deno.env.get("C8_ANON_KEY") ?? "",
            "Authorization": `Bearer ${Deno.env.get("C8_ANON_KEY") ?? ""}`,
          },
          body: JSON.stringify({
            tenant_id:      tenantId,
            tenant_name:    `Suporte — ${tenantName}`,
            admin_email:    emailForTenant,
            admin_password: password,
            is_support:     true,
          }),
        });

        if (!provisionRes.ok) {
          const err = await provisionRes.json().catch(() => ({}));
          throw new Error(`Erro ao provisionar suporte no C8 Control: ${err?.error ?? provisionRes.status}`);
        }

        const provisionData = await provisionRes.json();
        const supportUserId = provisionData.user_id ?? existing?.c8_user_id ?? null;

        // Save in Maestr.ia
        const { error: saveErr } = await maestriaAdmin
          .from("c8_support_passwords")
          .upsert({
            organization_id: orgId,
            client_id: tenantId,
            support_email: emailForTenant,
            password,
            c8_user_id: supportUserId,
          }, { onConflict: "organization_id,client_id" });
        if (saveErr) throw new Error(`Erro ao salvar senha: ${saveErr.message}`);

      } else {
        // Fallback: manipulação direta via C8_SUPABASE_URL (legado)
        const c8Url = Deno.env.get("C8_SUPABASE_URL");
        const c8Key = Deno.env.get("C8_SUPABASE_SERVICE_KEY");
        if (!c8Url || !c8Key) return { client_id: tenantId, support_email: emailForTenant, password };

        const c8Admin = createClient(c8Url, c8Key, { auth: { persistSession: false } });
        const { data: usersPage } = await c8Admin.auth.admin.listUsers({ perPage: 1000 });
        let supportUser = usersPage?.users?.find(
          (u: { email?: string }) => u.email?.toLowerCase() === emailForTenant.toLowerCase()
        );

        if (!supportUser) {
          const { data: newUser, error: createErr } = await c8Admin.auth.admin.createUser({
            email: emailForTenant, password, email_confirm: true,
            user_metadata: { full_name: `Suporte — ${tenantName}`, tenant_id: tenantId, role: "owner", is_support: true },
          });
          if (createErr || !newUser?.user) throw new Error(`Erro ao criar suporte: ${createErr?.message}`);
          supportUser = newUser.user;
        } else {
          await c8Admin.auth.admin.updateUserById(supportUser.id, {
            password,
            user_metadata: { ...supportUser.user_metadata, tenant_id: tenantId, role: "owner", is_support: true, force_password_change: false },
          });
        }

        await maestriaAdmin
          .from("c8_support_passwords")
          .upsert({
            organization_id: orgId, client_id: tenantId,
            support_email: emailForTenant, password, c8_user_id: supportUser.id,
          }, { onConflict: "organization_id,client_id" });
      }

      return { client_id: tenantId, support_email: emailForTenant, password };
    }

    // ── action: provision (single tenant) ────────────────────────────────────
    if (action === "provision") {
      if (!client_id) return json({ error: "client_id obrigatório" }, 400);
      const result = await provisionSupport(client_id, client_name ?? client_id);
      return json({ success: true, ...result });
    }

    // ── action: reset_all ─────────────────────────────────────────────────────
    if (action === "reset_all") {
      // Get all active C8 tenants for this org
      const { data: plans } = await maestriaAdmin
        .from("crm_client_plans")
        .select("client_id, clients(name, company)")
        .eq("organization_id", orgId)
        .neq("subscription_status", "cancelado");

      const results = [];
      for (const p of plans ?? []) {
        const clientData = p.clients as unknown as { name: string; company: string | null } | null;
        const name = clientData?.company || clientData?.name || p.client_id;
        try {
          const r = await provisionSupport(p.client_id, name);
          results.push({ ...r, client_name: name, success: true });
        } catch (e) {
          results.push({ client_id: p.client_id, client_name: name, success: false, error: String(e) });
        }
      }
      return json({ success: true, results });
    }

    return json({ error: "action inválida" }, 400);

  } catch (err) {
    console.error("[c8-support-user]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
