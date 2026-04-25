/**
 * Edge Function: c8-reset-password
 * Projeto: Maestr.ia
 *
 * Provisiona ou reseta acesso do usuário principal de um tenant no C8 Control.
 * Delega para c8-provision-tenant que chama provision-tenant do C8 Control.
 *
 * Secrets necessários:
 *   CRM_URL, CRM_API_KEY — conexão com C8 Control
 *   RESEND_API_KEY, RESEND_FROM_EMAIL, C8_APP_URL — e-mail
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const maestriaAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user: callerUser }, error: jwtErr } = await maestriaAdmin.auth.getUser(jwt);
    if (jwtErr || !callerUser) return json({ error: "Sessão inválida" }, 401);

    const { data: callerProfile } = await maestriaAdmin
      .from("profiles").select("role, organization_id").eq("id", callerUser.id).single();
    if (!["owner", "admin"].includes(callerProfile?.role ?? ""))
      return json({ error: "Apenas owner/admin podem provisionar acesso ao C8 Control" }, 403);

    const body = await req.json() as {
      email: string;
      client_name?: string;
      client_id: string;
      plan_name?: string;
      max_users?: number;
    };

    const { email, client_name, client_id, plan_name, max_users } = body;
    if (!email?.includes("@")) return json({ error: "E-mail inválido" }, 400);
    if (!client_id) return json({ error: "client_id é obrigatório" }, 400);

    const crmUrl = Deno.env.get("CRM_URL");
    const crmApiKey = Deno.env.get("CRM_API_KEY");

    if (!crmUrl || !crmApiKey)
      return json({ error: "CRM_URL ou CRM_API_KEY não configurados" }, 500);

    const tempPassword = generateTempPassword();

    // Chama provision-tenant do C8 Control diretamente
    const provisionRes = await fetch(`${crmUrl}/functions/v1/provision-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-crm-api-key": crmApiKey,
      },
      body: JSON.stringify({
        tenant_name:    client_name ?? email.split("@")[0],
        admin_email:    email,
        admin_password: tempPassword,
        is_support:     false,
      }),
    });

    const provisionData = await provisionRes.json();
    const isNewUser = provisionRes.status === 201;

    if (!provisionRes.ok && provisionRes.status !== 200) {
      return json({ error: provisionData?.error ?? `Erro ${provisionRes.status}` }, 500);
    }

    // Atualiza status de provisionamento no Maestr.ia
    await maestriaAdmin
      .from("crm_client_plans")
      .update({ provisioned_at: new Date().toISOString(), provisioning_status: "sent" })
      .eq("client_id", client_id);

    // Envia e-mail via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "suporte@agenciac8.com.br";
    const c8AppUrl = (Deno.env.get("C8_APP_URL") ?? "https://app.c8control.com.br").replace(/\/$/, "");
    const displayName = client_name ?? email.split("@")[0];

    if (!resendKey) {
      return json({
        success: true, is_new_user: isNewUser,
        temp_password: tempPassword,
        warning: "RESEND_API_KEY não configurado — e-mail não enviado.",
      });
    }

    const emailHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#7c3aed">${isNewUser ? "Bem-vindo ao C8 Control!" : "Nova senha temporária"}</h2>
        <p>Olá, <strong>${displayName}</strong>!</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:6px 0"><strong>URL:</strong> <a href="${c8AppUrl}" style="color:#7c3aed">${c8AppUrl}</a></p>
          <p style="margin:6px 0"><strong>E-mail:</strong> ${email}</p>
          <p style="margin:12px 0 6px 0"><strong>Senha temporária:</strong></p>
          <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center">
            <span style="font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px">${tempPassword}</span>
          </div>
          ${isNewUser ? `<p style="margin:8px 0 0 0;font-size:12px;color:#64748b">Plano: ${plan_name ?? "Starter"} · ${max_users ?? 1} usuário(s)</p>` : ""}
        </div>
        <p style="color:#dc2626;font-size:13px;font-weight:500">⚠️ Ao fazer login, você será solicitado a criar uma senha permanente.</p>
        <div style="margin:24px 0;text-align:center">
          <a href="${c8AppUrl}" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Acessar o C8 Control</a>
        </div>
      </div>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail, to: [email],
        subject: isNewUser ? "Seu acesso ao C8 Control está pronto!" : "Nova senha temporária — C8 Control",
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      return json({
        success: true, is_new_user: isNewUser, temp_password: tempPassword,
        warning: `Usuário ${isNewUser ? "criado" : "atualizado"} mas e-mail não enviado (Resend: ${errBody}).`,
      });
    }

    return json({
      success: true, is_new_user: isNewUser,
      message: isNewUser
        ? `Usuário criado e e-mail enviado para ${email}`
        : `Nova senha enviada para ${email}`,
    });

  } catch (err) {
    console.error("[c8-reset-password]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
