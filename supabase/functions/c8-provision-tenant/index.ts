/**
 * Edge Function: c8-provision-tenant
 * Projeto: Maestr.ia
 *
 * Provisiona um novo tenant no C8 Control chamando a edge function
 * provision-tenant do projeto C8 Control.
 *
 * Secrets necessários:
 *   CRM_URL     — URL do projeto C8 Control (ex: https://xcymhcqbyyuozkzhpxgi.supabase.co)
 *   CRM_API_KEY — Chave compartilhada configurada no C8 Control
 *   RESEND_API_KEY, RESEND_FROM_EMAIL, C8_APP_URL — para e-mail de boas-vindas
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const groups = 3;
  const groupLen = 4;
  let pwd = "";
  const bytes = new Uint8Array(groups * groupLen);
  crypto.getRandomValues(bytes);
  for (let g = 0; g < groups; g++) {
    if (g > 0) pwd += "-";
    for (let i = 0; i < groupLen; i++) {
      pwd += chars[bytes[g * groupLen + i] % chars.length];
    }
  }
  return pwd;
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

    // ── Payload ───────────────────────────────────────────────────────────────
    const body = await req.json() as {
      tenant_id?: string;
      tenant_name: string;
      admin_email: string;
      admin_password?: string;
      company?: string;
      document?: string;
      phone?: string;
      address_street?: string;
      address_city?: string;
      address_state?: string;
      address_zip?: string;
      slug?: string;
      client_id: string;
      plan_name?: string;
      plan_value?: number;
      max_users?: number;
      due_day?: number;
      billing_cycle?: string;
      contract_start?: string;
      contract_end?: string;
      support_email?: string;
      support_password?: string;
      is_support?: boolean;
      send_welcome_email?: boolean;
    };

    const crmUrl = Deno.env.get("CRM_URL");
    const crmApiKey = Deno.env.get("CRM_API_KEY");

    if (!crmUrl || !crmApiKey) {
      return json({ error: "CRM_URL ou CRM_API_KEY não configurados nos Secrets" }, 500);
    }

    const tempPassword = body.admin_password ?? generateTempPassword();

    // ── Chamar provision-tenant do C8 Control ─────────────────────────────────
    const c8AnonKey = Deno.env.get("C8_ANON_KEY") ?? "";
    const provisionRes = await fetch(`${crmUrl}/functions/v1/provision-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-crm-api-key": crmApiKey,
        "apikey": c8AnonKey,
        "Authorization": `Bearer ${c8AnonKey}`,
      },
      body: JSON.stringify({
        tenant_id:        body.tenant_id ?? body.client_id,
        tenant_name:      body.tenant_name,
        admin_email:      body.admin_email,
        admin_password:   tempPassword,
        // Campos mapeados para a tabela clients do C8 Control
        company:          body.company,
        cnpj:             body.document,
        phone:            body.phone,
        email:            body.admin_email,
        primary_contact:  body.tenant_name,
        address:          [body.address_street, body.address_city, body.address_state, body.address_zip].filter(Boolean).join(", ") || null,
        contract_start_date: body.contract_start ?? null,
        client_status:    "ativo",
        // Dados do plano
        plan_name:        body.plan_name,
        plan_value:       body.plan_value,
        max_users:        body.max_users,
        due_day:          body.due_day,
        billing_cycle:    body.billing_cycle,
        contract_end:     body.contract_end,
        // Suporte
        support_email:    body.support_email,
        support_password: body.support_password,
        is_support:       body.is_support ?? false,
      }),
    });

    const provisionData = await provisionRes.json();

    if (!provisionRes.ok) {
      console.error("[c8-provision-tenant] C8 Control error:", provisionData);
      return json({
        error: provisionData?.error ?? `Erro ${provisionRes.status} no C8 Control`,
        details: provisionData,
      }, provisionRes.status === 409 ? 409 : 500);
    }

    // ── Salvar tenant_id no Maestr.ia se não for suporte ──────────────────────
    if (!body.is_support && body.client_id && provisionData.tenant_id) {
      await maestriaAdmin
        .from("crm_client_plans")
        .update({ provisioned_at: new Date().toISOString(), provisioning_status: "sent" })
        .eq("client_id", body.client_id);
    }

    // ── Enviar e-mail de boas-vindas via Resend ───────────────────────────────
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "suporte@agenciac8.com.br";
    const c8AppUrl = (Deno.env.get("C8_APP_URL") ?? "https://app.c8control.com.br").replace(/\/$/, "");

    if (resendKey && !body.is_support && (body.send_welcome_email !== false)) {
      const emailHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#7c3aed">Bem-vindo ao C8 Control!</h2>
          <p>Olá, <strong>${body.tenant_name}</strong>!</p>
          <p>Sua conta no <strong>C8 Control CRM</strong> foi criada com sucesso.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
            <p style="margin:6px 0"><strong>URL:</strong> <a href="${c8AppUrl}" style="color:#7c3aed">${c8AppUrl}</a></p>
            <p style="margin:6px 0"><strong>E-mail:</strong> ${body.admin_email}</p>
            <p style="margin:12px 0 6px 0"><strong>Senha temporária:</strong></p>
            <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center">
              <span style="font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px">${tempPassword}</span>
            </div>
            <p style="margin:8px 0 0 0;font-size:12px;color:#64748b">Plano: ${body.plan_name ?? "Starter"} · ${body.max_users ?? 1} usuário(s)</p>
          </div>
          <p style="color:#dc2626;font-size:13px;font-weight:500">⚠️ Ao fazer login, você será solicitado a criar uma senha permanente.</p>
          <div style="margin:24px 0;text-align:center">
            <a href="${c8AppUrl}" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Acessar o C8 Control</a>
          </div>
        </div>
      `;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail,
          to: [body.admin_email],
          subject: "Seu acesso ao C8 Control está pronto!",
          html: emailHtml,
        }),
      }).catch(e => console.warn("[c8-provision-tenant] email error:", e));
    }

    return json({
      success: true,
      tenant_id: provisionData.tenant_id,
      user_id:   provisionData.user_id,
      email:     provisionData.email,
      slug:      provisionData.slug,
      temp_password: tempPassword,
    }, 201);

  } catch (err) {
    console.error("[c8-provision-tenant]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
