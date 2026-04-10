/**
 * Edge Function: provision-tenant
 *
 * Provisionamento completo de um novo tenant no C8 Control.
 * Chamada pelo módulo gerencial do Maestr.ia após cadastrar um tenant.
 *
 * Cria em sequência (com rollback em caso de falha):
 *   1. Registro em `clients` (o id gerado é o tenant_id)
 *   2. Usuário em auth.users com user_metadata { tenant_id, role: 'admin' }
 *   3. Registro em `tenant_users` vinculando user_id ao tenant_id
 *
 * Autenticação: header x-crm-api-key (mesma chave usada pela crm-tenant-api)
 *
 * Body esperado:
 * {
 *   tenant_name:   string   — nome do cliente (obrigatório)
 *   admin_email:   string   — e-mail do usuário admin principal (obrigatório)
 *   admin_password?: string — senha inicial (opcional; se omitido, envia magic link)
 *   company?:      string   — nome da empresa
 *   slug?:         string   — dashboard_slug (gerado automaticamente se omitido)
 * }
 *
 * Resposta de sucesso:
 * {
 *   tenant_id: string  — UUID do tenant (usar no crm_tenant_config do Maestr.ia)
 *   user_id:   string  — UUID do usuário admin criado
 *   email:     string  — e-mail do admin
 * }
 *
 * Required secrets:
 *   SUPABASE_URL              — CRM URL (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY — CRM service role key (auto-injected)
 *   CRM_API_KEY               — Chave compartilhada com o Maestr.ia
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidEmail, isValidUuid } from "../_shared/jwt.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Autenticar via CRM_API_KEY ─────────────────────────────────────────────
  const apiKey = req.headers.get("x-crm-api-key");
  if (!apiKey || apiKey !== Deno.env.get("CRM_API_KEY")) {
    return jsonResponse({ error: "Não autorizado" }, 401);
  }

  // ── Parse do body ──────────────────────────────────────────────────────────
  let body: {
    tenant_name:    string;
    admin_email:    string;
    admin_password?: string;
    company?:       string;
    slug?:          string;
  };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON inválido" }, 400);
  }

  const { tenant_name, admin_email, admin_password, company, slug } = body;

  if (!tenant_name?.trim()) {
    return jsonResponse({ error: "tenant_name é obrigatório" }, 400);
  }
  if (!admin_email?.trim() || !isValidEmail(admin_email.trim())) {
    return jsonResponse({ error: "admin_email inválido" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // ── Passo 1: Criar o tenant em `clients` ──────────────────────────────────
  const dashboardSlug = slug?.trim() || generateSlug(tenant_name.trim());

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      name:           tenant_name.trim(),
      company:        company?.trim() ?? null,
      dashboard_slug: dashboardSlug,
      metadata:       {
        dashboard_performance: true,
        dashboard_atendimento: true,
        dashboard_crm:         true,
      },
    })
    .select("id")
    .single();

  if (clientErr || !client) {
    console.error("[provision-tenant] Erro ao criar client:", clientErr?.message);
    const isDuplicate = clientErr?.message?.includes("duplicate") ||
                        clientErr?.message?.includes("unique");
    return jsonResponse({
      error: isDuplicate
        ? `Slug '${dashboardSlug}' já existe. Informe um slug diferente.`
        : "Erro ao criar tenant",
    }, isDuplicate ? 409 : 500);
  }

  const tenantId = client.id as string;

  // ── Passo 2: Criar o usuário admin em auth.users ───────────────────────────
  // Também atualiza tenant_id no clients (self-reference: clients.tenant_id = clients.id)
  await supabase
    .from("clients")
    .update({ tenant_id: tenantId })
    .eq("id", tenantId);

  const createUserPayload: Record<string, unknown> = {
    email:         admin_email.trim(),
    email_confirm: true,
    user_metadata: {
      tenant_id:             tenantId,
      role:                  "admin",
      // Se senha temporária fornecida, forçar troca no primeiro acesso
      force_password_change: admin_password?.trim() ? true : false,
    },
  };

  if (admin_password?.trim()) {
    createUserPayload.password = admin_password.trim();
  }

  const { data: userData, error: userErr } = await supabase.auth.admin.createUser(
    createUserPayload as Parameters<typeof supabase.auth.admin.createUser>[0]
  );

  if (userErr || !userData?.user) {
    // Rollback: remover o client criado
    await supabase.from("clients").delete().eq("id", tenantId);
    console.error("[provision-tenant] Erro ao criar usuário:", userErr?.message);
    const isDuplicate = userErr?.message?.toLowerCase().includes("already registered") ||
                        userErr?.message?.toLowerCase().includes("already exists");
    return jsonResponse({
      error: isDuplicate
        ? `E-mail '${admin_email.trim()}' já está cadastrado no C8 Control.`
        : `Erro ao criar usuário: ${userErr?.message ?? "desconhecido"}`,
    }, isDuplicate ? 409 : 500);
  }

  const userId = userData.user.id;

  // ── Passo 3: Registrar em tenant_users ────────────────────────────────────
  const { error: tuErr } = await supabase
    .from("tenant_users")
    .insert({ user_id: userId, tenant_id: tenantId, role: "admin" });

  if (tuErr) {
    // Rollback: remover usuário e client
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from("clients").delete().eq("id", tenantId);
    console.error("[provision-tenant] Erro ao criar tenant_users:", tuErr.message);
    return jsonResponse({ error: "Erro ao registrar usuário no tenant" }, 500);
  }

  // ── Passo 4: Enviar magic link se não foi fornecida senha ─────────────────
  if (!admin_password?.trim()) {
    await supabase.auth.admin.generateLink({
      type:  "magiclink",
      email: admin_email.trim(),
      options: {
        redirectTo: `${Deno.env.get("APP_URL") ?? ""}/login`,
      },
    });
  }

  console.log(`[provision-tenant] Tenant criado: ${tenantId} | Admin: ${userId} (${admin_email.trim()})`);

  return jsonResponse({
    tenant_id: tenantId,
    user_id:   userId,
    email:     admin_email.trim(),
    slug:      dashboardSlug,
    message:   admin_password?.trim()
      ? "Tenant provisionado. Usuário pode fazer login com a senha fornecida."
      : "Tenant provisionado. Magic link enviado para o e-mail do admin.",
  }, 201);
});
