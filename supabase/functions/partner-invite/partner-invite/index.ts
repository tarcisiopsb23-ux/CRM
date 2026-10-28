/**
 * partner-invite — v2
 *
 * Convida um parceiro/terceirizado para o Portal Parceiro.
 * Suporta dois tipos de parceiro:
 *
 *   partner_type = 'agency'
 *     → Parceiro da agência, vinculado a um fornecedor existente (supplier_id).
 *       Pode ser atribuído a qualquer cliente da organização.
 *       Tem vínculo financeiro com a agência (contratos, pagamentos).
 *
 *   partner_type = 'client'
 *     → Parceiro do cliente, contratado diretamente pelo cliente.
 *       Vinculado a um cliente específico (client_id).
 *       Sem vínculo financeiro com a agência.
 *       Só pode ser atribuído a itens do cliente vinculado.
 *
 * Fluxo:
 *   1. Valida JWT do usuário da agência
 *   2. Verifica pertença à organização (mín. admin)
 *   3. Se agency: valida supplier_id existente
 *   4. Se client: valida client_id existente
 *   5. Gera partner_slug único
 *   6. Cria auth.users com senha temporária de 12 chars
 *   7. Insere em partner_users
 *   8. Gera partner_invite_token (72h)
 *   9. Envia e-mail via Resend com link de primeiro acesso e senha provisória
 *  10. Retorna { partner_user_id, partner_slug, token_id, email_sent }
 *
 * POST application/json:
 * {
 *   email:           string,            -- e-mail real do parceiro
 *   full_name:       string,
 *   organization_id: string,
 *   partner_type:    'agency' | 'client',
 *   supplier_id?:    string,            -- obrigatório se agency
 *   client_id?:      string,            -- obrigatório se client
 *   specialty?:      string,
 *   phone?:          string,
 *   partner_slug?:   string,            -- gerado automaticamente se omitido
 * }
 *
 * Vars de ambiente necessárias:
 *   RESEND_API_KEY          — chave da API Resend
 *   C8_FROM_EMAIL           — remetente (padrão: noreply@c8control.com.br)
 *   C8_PARTNER_URL          — URL base do portal parceiro (padrão: https://parceiro.c8control.com.br)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Slug ──────────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// ── Senha temporária ──────────────────────────────────────────────────────────

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$";
  const arr   = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join("");
}

// ── E-mail HTML inline ────────────────────────────────────────────────────────

function buildEmailHtml(opts: {
  partnerName:   string;
  partnerEmail:  string;
  partnerSlug:   string;
  tempPassword:  string;
  loginUrl:      string;
  tokenUrl:      string;
  partnerType:   string;
  orgName:       string;
}): string {
  const { partnerName, partnerEmail, tempPassword, loginUrl, tokenUrl, partnerType, orgName } = opts;
  const typeLabel = partnerType === "agency"
    ? `Parceiro da <strong>${orgName}</strong>`
    : `Parceiro do cliente (via ${orgName})`;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#7c3aed;padding:32px 40px;text-align:center">
      <span style="color:#fff;font-size:22px;font-weight:900;letter-spacing:-0.5px">C8 Parceiro</span>
      <p style="color:#ede9fe;font-size:13px;margin:4px 0 0">Portal de Colaboradores</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 40px">
      <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px">Olá, ${partnerName}!</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px">
        Você foi convidado para colaborar como <strong>${typeLabel}</strong>
        na plataforma C8 Parceiro.
      </p>

      <!-- Credenciais -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:0 0 24px">
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.5px">
          Suas credenciais de acesso
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155">
          <tr>
            <td style="padding:6px 0;color:#64748b;white-space:nowrap;padding-right:16px">E-mail</td>
            <td style="padding:6px 0;font-weight:500">${partnerEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;white-space:nowrap;padding-right:16px">URL do portal</td>
            <td style="padding:6px 0">
              <a href="${loginUrl}" style="color:#7c3aed;text-decoration:none;font-weight:500">${loginUrl}</a>
            </td>
          </tr>
        </table>
        <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:8px;padding:16px;margin:16px 0 0;text-align:center">
          <p style="margin:0 0 6px;font-size:12px;color:#6d28d9;font-weight:600;text-transform:uppercase;letter-spacing:.5px">
            Senha provisória
          </p>
          <span style="font-family:monospace;font-size:24px;font-weight:900;color:#5b21b6;letter-spacing:3px">${tempPassword}</span>
        </div>
      </div>

      <!-- Aviso expiração -->
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:14px 16px;margin:0 0 24px">
        <p style="margin:0;font-size:13px;color:#92400e">
          ⏰ <strong>Este convite expira em 72 horas.</strong>
          Após expirar, solicite um novo convite à agência.
        </p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:0 0 24px">
        <a href="${tokenUrl}"
           style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px">
          Acessar o Portal Parceiro →
        </a>
        <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">
          Ou acesse diretamente: <a href="${loginUrl}" style="color:#7c3aed">${loginUrl}</a>
        </p>
      </div>

      <!-- Instrução troca de senha -->
      <p style="font-size:13px;color:#64748b;background:#f8fafc;border-radius:8px;padding:14px 16px;margin:0">
        🔐 Ao fazer o primeiro login, você será solicitado a criar uma senha permanente.
        A senha provisória acima não poderá ser reutilizada após a troca.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
      <p style="margin:0;font-size:12px;color:#94a3b8">
        Este e-mail foi enviado automaticamente. Não responda a esta mensagem.
      </p>
      <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">
        C8 Control &middot; ${orgName}
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Valida JWT do usuário da agência ──────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ error: "Token de autenticação obrigatório" }, 401);

  const userClient = createClient(SUPA_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Token inválido ou expirado" }, 401);

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: {
    email?:           string;
    full_name?:       string;
    organization_id?: string;
    partner_type?:    string;
    supplier_id?:     string;
    client_id?:       string;
    specialty?:       string;
    phone?:           string;
    partner_slug?:    string;
  };
  try { body = await req.json(); }
  catch { return json({ error: "Body JSON inválido" }, 400); }

  const {
    email, full_name, organization_id,
    partner_type = "agency",
    supplier_id, client_id,
    specialty, phone,
  } = body;

  if (!email?.trim())           return json({ error: "email obrigatório" }, 400);
  if (!full_name?.trim())       return json({ error: "full_name obrigatório" }, 400);
  if (!organization_id?.trim()) return json({ error: "organization_id obrigatório" }, 400);

  if (!["agency", "client"].includes(partner_type)) {
    return json({ error: "partner_type deve ser 'agency' ou 'client'" }, 400);
  }
  if (partner_type === "agency" && !supplier_id?.trim()) {
    return json({ error: "supplier_id obrigatório para parceiros da agência" }, 400);
  }
  if (partner_type === "client" && !client_id?.trim()) {
    return json({ error: "client_id obrigatório para parceiros do cliente" }, 400);
  }

  const emailNorm = email.trim().toLowerCase();

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Verifica que o usuário pertence à organização (mín. admin) ────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, full_name, organization_id")
    .eq("id", user.id)
    .eq("organization_id", organization_id)
    .maybeSingle();

  if (!profile) {
    return json({ error: "Acesso negado — usuário não pertence à organização" }, 403);
  }
  if (!["owner", "admin"].includes(profile.role ?? "")) {
    return json({ error: "Apenas admin ou owner podem convidar parceiros" }, 403);
  }

  // ── Busca nome da organização para o e-mail ────────────────────────────────
  const { data: orgData } = await admin
    .from("organizations")
    .select("name")
    .eq("id", organization_id)
    .maybeSingle();
  const orgName = orgData?.name ?? "Agência C8";

  // ── Valida supplier/client informado ─────────────────────────────────────
  if (partner_type === "agency" && supplier_id) {
    const { data: supplier } = await admin
      .from("suppliers")
      .select("id")
      .eq("id", supplier_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!supplier) return json({ error: "Fornecedor não encontrado nesta organização" }, 404);
  }
  if (partner_type === "client" && client_id) {
    const { data: client } = await admin
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!client) return json({ error: "Cliente não encontrado nesta organização" }, 404);
  }

  // ── Gera partner_slug único ───────────────────────────────────────────────
  let partnerSlug = body.partner_slug?.trim().toLowerCase() || generateSlug(full_name!);
  let counter     = 1;
  while (true) {
    const { data: existing } = await admin
      .from("partner_users")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("partner_slug", partnerSlug)
      .maybeSingle();
    if (!existing) break;
    partnerSlug = `${generateSlug(full_name!)}-${counter++}`;
    if (counter > 99) return json({ error: "Não foi possível gerar slug único" }, 500);
  }

  const loginKey      = `${emailNorm}::${partnerSlug}`;
  const internalEmail = `${emailNorm}::${partnerSlug}@c8partner.internal`;
  const tempPassword  = generatePassword(12);

  // ── Verifica se já existe ─────────────────────────────────────────────────
  const { data: existingPartner } = await admin
    .from("partner_users")
    .select("id")
    .eq("login_key", loginKey)
    .maybeSingle();
  if (existingPartner) {
    return json({ error: `Parceiro com e-mail '${emailNorm}' e slug '${partnerSlug}' já existe` }, 409);
  }

  // ── Cria auth.users com senha temporária + force_password_change ──────────
  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email:         internalEmail,
    password:      tempPassword,
    email_confirm: true,
    user_metadata: {
      real_email:             emailNorm,
      partner_slug:           partnerSlug,
      organization_id,
      user_type:              "partner",
      full_name:              full_name!.trim(),
      force_password_change:  true,
    },
    app_metadata: {
      user_type:      "partner",
      organization_id,
      partner_slug:   partnerSlug,
    },
  });

  if (createErr || !authUser.user) {
    console.error("[partner-invite] Auth create error:", createErr);
    return json({ error: createErr?.message ?? "Falha ao criar usuário" }, 500);
  }

  // ── Insere em partner_users ───────────────────────────────────────────────
  const { data: partnerUser, error: insertErr } = await admin
    .from("partner_users")
    .insert({
      organization_id,
      login_key:    loginKey,
      real_email:   emailNorm,
      partner_slug: partnerSlug,
      auth_user_id: authUser.user.id,
      full_name:    full_name!.trim(),
      specialty:    specialty ?? null,
      phone:        phone?.trim() ?? null,
      active:       true,
      partner_type,
      supplier_id:  partner_type === "agency" ? (supplier_id ?? null) : null,
      client_id:    partner_type === "client"  ? (client_id  ?? null) : null,
    })
    .select("id, partner_slug")
    .single();

  if (insertErr) {
    // Rollback: remove auth user
    await admin.auth.admin.deleteUser(authUser.user.id);
    console.error("[partner-invite] Insert error:", insertErr);
    return json({ error: "Falha ao registrar parceiro" }, 500);
  }

  // ── Cria token de convite (72h) ───────────────────────────────────────────
  const { data: inviteToken, error: tokenErr } = await admin
    .from("partner_invite_tokens")
    .insert({ partner_id: partnerUser.id })
    .select("token, expires_at")
    .single();

  let tokenValue = "";
  if (tokenErr || !inviteToken) {
    console.warn("[partner-invite] Token creation error:", tokenErr);
  } else {
    tokenValue = inviteToken.token;
  }

  // ── Envia e-mail via Resend ───────────────────────────────────────────────
  const resendKey   = Deno.env.get("RESEND_API_KEY");
  const fromEmail   = Deno.env.get("C8_FROM_EMAIL")    ?? "noreply@c8control.com.br";
  const partnerBase = (Deno.env.get("C8_PARTNER_URL")  ?? "https://parceiro.c8control.com.br").replace(/\/$/, "");

  const loginUrl = `${partnerBase}/${partnerSlug}`;
  const tokenUrl = tokenValue
    ? `${partnerBase}/${partnerSlug}/login?token=${tokenValue}`
    : loginUrl;

  let emailSent = false;

  if (resendKey) {
    try {
      // Tenta usar template customizado do banco
      const { getEmailTemplate } = await import("../_shared/emailTemplate.ts");
      const tpl = await getEmailTemplate(admin, organization_id, "partner_invite", {
        partner_name:   full_name!.trim(),
        partner_email:  emailNorm,
        partner_slug:   partnerSlug,
        temp_password:  tempPassword,
        login_url:      loginUrl,
        token_url:      tokenUrl,
        org_name:       orgName,
        expires_hours:  "72",
      }).catch(() => null);

      const emailHtml    = tpl?.html    ?? buildEmailHtml({
        partnerName:  full_name!.trim(),
        partnerEmail: emailNorm,
        partnerSlug,
        tempPassword,
        loginUrl,
        tokenUrl,
        partnerType: partner_type,
        orgName,
      });
      const emailSubject = tpl?.subject ?? `Convite para o Portal Parceiro — ${orgName}`;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ from: fromEmail, to: [emailNorm], subject: emailSubject, html: emailHtml }),
      });

      emailSent = emailRes.ok;
      if (!emailRes.ok) {
        const errBody = await emailRes.text().catch(() => "");
        console.warn("[partner-invite] Resend error:", emailRes.status, errBody);
      }
    } catch (emailErr) {
      console.warn("[partner-invite] Email send error:", emailErr);
    }
  } else {
    console.warn("[partner-invite] RESEND_API_KEY não configurado — e-mail não enviado");
  }

  return json({
    success:          true,
    partner_user_id:  partnerUser.id,
    partner_slug:     partnerUser.partner_slug,
    login_key:        loginKey,
    token_id:         tokenValue ? inviteToken?.token : null,
    email_sent:       emailSent,
    partner_type,
    // Retorna senha apenas se e-mail não foi enviado (para o admin comunicar manualmente)
    ...(!emailSent ? { temp_password: tempPassword } : {}),
    message: emailSent
      ? `Convite enviado para ${emailNorm}. Válido por 72 horas.`
      : `Parceiro criado. E-mail não enviado — senha: ${tempPassword}`,
  }, 201);
});
