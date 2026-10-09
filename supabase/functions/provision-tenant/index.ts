/**
 * Edge Function: provision-tenant
 *
 * Gerenciamento completo de tenants no C8 Control.
 * Chamada pelo módulo gerencial do Maestr.ia.
 *
 * Mapeamento de campos Maestr.ia → C8 Control (clients):
 *   client_id            → id, tenant_id
 *   clients.name         → name
 *   clients.company      → company
 *   clients.document     → cnpj
 *   clients.phone        → phone
 *   clients.email        → email
 *   clients.name         → primary_contact  (nome do contato principal)
 *   address_street+city+state+zip → address (concatenado)
 *   contract_start       → contract_start_date
 *   subscription_status  → client_status    (mapeado: active→ativo, etc.)
 *   (gerado do nome)     → dashboard_slug
 *
 * Actions disponíveis (campo `action` no body):
 *   "provision"    — upsert tenant + criar/vincular usuário admin
 *   "sync-client"  — upsert apenas do registro em clients (sem usuário)
 *   "delete-tenant"— remove tenant completo (clients, tenant_users, auth users)
 *
 * Autenticação: header x-crm-api-key
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidEmail } from "../_shared/jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-api-key",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/** Mapeia subscription_status do Maestr.ia para client_status_enum do C8 Control */
function mapClientStatus(subscriptionStatus?: string): string | null {
  if (!subscriptionStatus) return null;
  const map: Record<string, string> = {
    active:      "ativo",
    ativo:       "ativo",
    inactive:    "inativo",
    inativo:     "inativo",
    suspended:   "inativo",
    suspenso:    "inativo",
    cancelled:   "inativo",
    cancelado:   "inativo",
    prospect:    "prospect",
    trial:       "prospect",
  };
  return map[subscriptionStatus.toLowerCase()] ?? "ativo";
}

/** Concatena os campos de endereço vindos do Maestr.ia */
function buildAddress(body: Record<string, string | undefined>): string | null {
  const parts = [
    body.address_street,
    body.address_city,
    body.address_state,
    body.address_zip,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : (body.address ?? null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth ───────────────────────────────────────────────────────────────────
  const apiKey = req.headers.get("x-crm-api-key");
  if (!apiKey || apiKey !== Deno.env.get("CRM_API_KEY")) {
    return jsonResponse({ error: "Não autorizado" }, 401);
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let raw: Record<string, any>;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON inválido" }, 400);
  }

  const action = (raw.action ?? "provision") as string;

  // ── Mapeamento de campos: Maestr.ia → C8 Control ──────────────────────────
  //
  // O Maestr.ia pode enviar tanto os nomes antigos quanto os novos.
  // Campos com fallback: aceita o nome C8 Control ou o nome Maestr.ia.

  // Identidade do tenant
  const tenantId = (raw.tenant_id ?? raw.client_id ?? "")?.toString().trim() || null;

  // Nome do cliente
  const tenantName = (raw.tenant_name ?? raw.name ?? "")?.toString().trim();

  // Empresa
  const company = (raw.company ?? null)?.toString().trim() || null;

  // CNPJ: Maestr.ia envia como `document`
  const cnpj = (raw.cnpj ?? raw.document ?? null)?.toString().trim() || null;

  // Telefone
  const phone = (raw.phone ?? null)?.toString().trim() || null;

  // E-mail do cliente (não do admin)
  const clientEmail = (raw.email ?? null)?.toString().trim() || null;

  // Contato principal: Maestr.ia usa o próprio nome do cliente
  const primaryContact = (raw.primary_contact ?? raw.contact_name ?? tenantName) || null;

  // Endereço: suporta campos separados (address_street, address_city, etc.) ou campo único
  const address = buildAddress(raw);

  // Data de início do contrato: Maestr.ia envia como `contract_start`
  const contractStartDate = (raw.contract_start_date ?? raw.contract_start ?? null);

  // Status: Maestr.ia envia `subscription_status`
  const clientStatus = mapClientStatus(raw.client_status ?? raw.subscription_status);

  // Campos de plano
  const maxUsers     = raw.max_users     ?? null;
  const planName     = raw.plan_name     ?? null;
  const planValue    = raw.plan_value    ?? null;
  const billingCycle = raw.billing_cycle ?? null;
  const dueDay       = raw.due_day       ?? null;
  const contractEnd  = raw.contract_end  ?? null;

  // Outros campos
  const slug       = (raw.slug ?? "")?.toString().trim();
  const faviconUrl = raw.favicon_url ?? null;
  const isSupport  = raw.is_support === true;

  // Campos de usuário admin
  const adminEmail    = (raw.admin_email ?? "")?.toString().trim();
  const adminPassword = (raw.admin_password ?? "")?.toString().trim();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // ── Helper: monta payload completo para upsert em clients ─────────────────
  function buildClientPayload(id: string, name: string, dashSlug: string): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      id,
      name,
      tenant_id:      id,
      dashboard_slug: dashSlug,
      metadata: {
        dashboard_performance: true,
        dashboard_atendimento: true,
        dashboard_crm:         true,
      },
    };
    if (company         != null) payload.company             = company;
    if (cnpj            != null) payload.cnpj                = cnpj;
    if (phone           != null) payload.phone               = phone;
    if (clientEmail     != null) payload.email               = clientEmail;
    if (primaryContact  != null) payload.primary_contact     = primaryContact;
    if (address         != null) payload.address             = address;
    if (faviconUrl      != null) payload.favicon_url         = faviconUrl;
    if (contractStartDate != null) payload.contract_start_date = contractStartDate;
    if (clientStatus    != null) payload.client_status       = clientStatus;
    if (maxUsers        != null) payload.max_users           = maxUsers;
    if (planName        != null) payload.plan_name           = planName;
    if (planValue       != null) payload.plan_value          = planValue;
    if (billingCycle    != null) payload.billing_cycle       = billingCycle;
    if (dueDay          != null) payload.due_day             = dueDay;
    if (contractEnd     != null) payload.contract_end        = contractEnd;
    return payload;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTION: delete-tenant
  // ══════════════════════════════════════════════════════════════════════════
  if (action === "delete-tenant") {
    if (!tenantId) {
      return jsonResponse({ error: "tenant_id (ou client_id) é obrigatório para delete-tenant" }, 400);
    }

    const { data: tenantUsers } = await supabase
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId);

    // Deletar de tenant_users
    const { error: tuDeleteErr } = await supabase
      .from("tenant_users").delete().eq("tenant_id", tenantId);

    if (tuDeleteErr) {
      console.error("[provision-tenant] Erro ao remover tenant_users:", tuDeleteErr.message);
    }

    const deletedUsers: string[] = [];
    const skippedUsers: string[] = [];
    for (const tu of tenantUsers ?? []) {
      // Verificar se o usuário pertence a outro tenant (não deletado acima)
      const { count } = await supabase
        .from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("user_id", tu.user_id);
      if ((count ?? 0) === 0) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(tu.user_id);
        if (!delErr) deletedUsers.push(tu.user_id);
      } else {
        skippedUsers.push(tu.user_id);
      }
    }

    const { error: clientDelErr } = await supabase
      .from("clients").delete().eq("tenant_id", tenantId);

    if (clientDelErr) {
      return jsonResponse({ error: `Erro ao remover tenant: ${clientDelErr.message}` }, 500);
    }

    console.log(`[provision-tenant] Tenant removido: ${tenantId}`);
    return jsonResponse({
      tenant_id:     tenantId,
      action:        "deleted",
      users_deleted: deletedUsers.length,
      users_skipped: skippedUsers.length,
      message:       "Tenant removido do C8 Control.",
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTION: sync-client
  // Upsert apenas do registro em clients (sem criar usuário)
  // ══════════════════════════════════════════════════════════════════════════
  if (action === "sync-client") {
    if (!tenantId) {
      return jsonResponse({ error: "tenant_id (ou client_id) é obrigatório para sync-client" }, 400);
    }
    if (!tenantName) {
      return jsonResponse({ error: "tenant_name (ou name) é obrigatório para sync-client" }, 400);
    }

    const { data: existing } = await supabase
      .from("clients").select("id").eq("tenant_id", tenantId).maybeSingle();

    const dashSlug = slug || generateSlug(tenantName);
    const { error: upsertErr } = await supabase
      .from("clients")
      .upsert(buildClientPayload(tenantId, tenantName, dashSlug), { onConflict: "id" });

    if (upsertErr) {
      return jsonResponse({ error: `Erro ao sincronizar cliente: ${upsertErr.message}` }, 500);
    }

    const wasExisting = !!existing;
    console.log(`[provision-tenant] sync-client ${wasExisting ? "updated" : "created"}: ${tenantId}`);
    return jsonResponse({
      tenant_id: tenantId,
      action:    wasExisting ? "updated" : "created",
      message:   wasExisting ? "Cliente atualizado no C8 Control." : "Cliente criado no C8 Control.",
    }, wasExisting ? 200 : 201);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTION: provision (default)
  // Upsert do tenant + criar/vincular usuário admin
  // ══════════════════════════════════════════════════════════════════════════
  if (!adminEmail || !isValidEmail(adminEmail)) {
    return jsonResponse({ error: "admin_email inválido ou ausente" }, 400);
  }

  // ── Caso A: tenant_id fornecido ────────────────────────────────────────────
  if (tenantId) {
    const { data: existingClient } = await supabase
      .from("clients").select("id, name").eq("tenant_id", tenantId).maybeSingle();

    // Se não existe → criar via upsert com todos os campos
    if (!existingClient) {
      if (!tenantName) {
        return jsonResponse({ error: "tenant_name (ou name) é obrigatório para criar tenant" }, 400);
      }
      const dashSlug = slug || generateSlug(tenantName);
      const { error: upsertErr } = await supabase
        .from("clients")
        .upsert(buildClientPayload(tenantId, tenantName, dashSlug), { onConflict: "id" });

      if (upsertErr) {
        console.error("[provision-tenant] Erro ao criar client:", upsertErr.message);
        return jsonResponse({ error: `Erro ao criar tenant: ${upsertErr.message}` }, 500);
      }
      console.log(`[provision-tenant] Tenant criado via upsert: ${tenantId}`);
    } else if (tenantName) {
      // Já existe → atualizar campos recebidos
      const dashSlug = slug || generateSlug(tenantName);
      await supabase
        .from("clients")
        .upsert(buildClientPayload(tenantId, tenantName, dashSlug), { onConflict: "id" });
    }

    // Resolver usuário admin
    // Usuário principal é sempre admin. Suporte é owner.
    const userRole = isSupport ? "owner" : "admin";
    let userId: string;

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.email === adminEmail);

    if (existingUser) {
      userId = existingUser.id;
      const currentMeta = existingUser.user_metadata || {};
      const updatePayload: Record<string, unknown> = {
        // Sempre atualiza metadata e desbloqueia (ban_duration: "none" remove qualquer ban)
        user_metadata: { ...currentMeta, tenant_id: tenantId, role: userRole },
        ban_duration:  "none",
      };
      if (adminPassword) {
        updatePayload.password = adminPassword;
      }
      await supabase.auth.admin.updateUserById(userId, updatePayload as any);
      console.log(`[provision-tenant] Usuário existente atualizado/desbloqueado: ${userId}`);
    } else {
      const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
        email:         adminEmail,
        email_confirm: true,
        password:      adminPassword || undefined,
        user_metadata: {
          tenant_id:             tenantId,
          role:                  userRole,
          force_password_change: adminPassword ? true : false,
        },
      } as any);

      if (userErr || !userData?.user) {
        return jsonResponse({
          error: `Erro ao criar usuário: ${userErr?.message ?? "desconhecido"}`,
        }, 500);
      }
      userId = userData.user.id;
    }

    // Registrar em tenant_users — tanto admin quanto agency (suporte)
    await supabase.from("tenant_users").upsert(
      { user_id: userId, tenant_id: tenantId, role: userRole },
      { onConflict: "user_id,tenant_id" }
    );

    const tenantWasCreated = !existingClient;
    console.log(`[provision-tenant] provision OK — tenant ${tenantWasCreated ? "criado" : "atualizado"}: ${tenantId} | user: ${userId}`);
    return jsonResponse({
      tenant_id: tenantId,
      user_id:   userId,
      email:     adminEmail,
      message:   tenantWasCreated
        ? "Tenant criado no C8 Control e usuário admin provisionado."
        : "Tenant atualizado e usuário vinculado.",
    }, 201);
  }

  // ── Caso B: sem tenant_id — novo tenant com UUID gerado pelo banco ─────────
  if (!tenantName) {
    return jsonResponse({ error: "tenant_name (ou name) é obrigatório para criar novo tenant" }, 400);
  }

  const dashboardSlug = slug || generateSlug(tenantName);

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      name:           tenantName,
      company,
      dashboard_slug: dashboardSlug,
      favicon_url:    faviconUrl,
      metadata: {
        dashboard_performance: true,
        dashboard_atendimento: true,
        dashboard_crm:         true,
      },
    })
    .select("id")
    .single();

  if (clientErr || !client) {
    const isDuplicate = clientErr?.message?.includes("duplicate") || clientErr?.message?.includes("unique");
    return jsonResponse({
      error: isDuplicate
        ? `Slug '${dashboardSlug}' já existe. Informe um slug diferente.`
        : "Erro ao criar tenant",
    }, isDuplicate ? 409 : 500);
  }

  const newTenantId = client.id as string;

  // Atualizar tenant_id (self-reference) + demais campos
  await supabase.from("clients")
    .upsert(buildClientPayload(newTenantId, tenantName, dashboardSlug), { onConflict: "id" });

  // Criar usuário admin
  const createUserPayload: Record<string, unknown> = {
    email:         adminEmail,
    email_confirm: true,
    user_metadata: {
      tenant_id:             newTenantId,
      role:                  isSupport ? "owner" : "admin",
      force_password_change: adminPassword ? true : false,
    },
  };
  if (adminPassword) createUserPayload.password = adminPassword;

  const { data: userData, error: userErr } = await supabase.auth.admin.createUser(
    createUserPayload as Parameters<typeof supabase.auth.admin.createUser>[0]
  );

  if (userErr || !userData?.user) {
    await supabase.from("clients").delete().eq("id", newTenantId);
    const isDuplicate = userErr?.message?.toLowerCase().includes("already registered") ||
                        userErr?.message?.toLowerCase().includes("already exists");
    return jsonResponse({
      error: isDuplicate
        ? `E-mail '${adminEmail}' já está cadastrado no C8 Control.`
        : `Erro ao criar usuário: ${userErr?.message ?? "desconhecido"}`,
    }, isDuplicate ? 409 : 500);
  }

  const userId = userData.user.id;

  const { error: tuErr } = await supabase
    .from("tenant_users")
    .insert({ user_id: userId, tenant_id: newTenantId, role: "admin" });

  if (tuErr) {
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from("clients").delete().eq("id", newTenantId);
    return jsonResponse({ error: "Erro ao registrar usuário no tenant" }, 500);
  }

  if (!adminPassword) {
    await supabase.auth.admin.generateLink({
      type:  "magiclink",
      email: adminEmail,
      options: { redirectTo: `${Deno.env.get("APP_URL") ?? ""}/login` },
    });
  }

  console.log(`[provision-tenant] Novo tenant criado: ${newTenantId} | Admin: ${userId}`);
  return jsonResponse({
    tenant_id: newTenantId,
    user_id:   userId,
    email:     adminEmail,
    slug:      dashboardSlug,
    message:   adminPassword
      ? "Tenant provisionado. Usuário pode fazer login com a senha fornecida."
      : "Tenant provisionado. Magic link enviado para o e-mail do admin.",
  }, 201);
});
