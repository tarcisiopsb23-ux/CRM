/**
 * Edge Function: get-client-credentials
 *
 * Retorna as credenciais sensíveis (service_key, email, password) de um cliente
 * para exibição no painel interno da agência.
 *
 * Segurança:
 *   - Requer JWT válido do Banco A (usuário autenticado no CRM)
 *   - Apenas roles owner/admin podem acessar
 *   - Verifica que o cliente pertence à organização do chamador
 *   - Usa SUPABASE_SERVICE_ROLE_KEY no servidor — nunca exposta ao frontend
 *   - Retorna apenas o campo solicitado (principle of least privilege)
 *
 * Body: { client_id: string, field: "service_key" | "email" | "password" }
 * Response: { value: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_FIELDS = ["service_key", "email", "password"] as const;
type AllowedField = typeof ALLOWED_FIELDS[number];

const FIELD_TO_COLUMN: Record<AllowedField, string> = {
  service_key: "client_supabase_service_key",
  email:       "client_supabase_email",
  password:    "client_supabase_password",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    // ── 1. Validar Authorization header ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Não autorizado" }, 401);
    }
    const jwt = authHeader.slice(7).trim();

    // ── 2. Criar cliente admin (service role) do Banco A ─────────────────────
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // ── 3. Verificar JWT e obter usuário ──────────────────────────────────────
    const { data: { user }, error: jwtErr } = await adminClient.auth.getUser(jwt);
    if (jwtErr || !user) {
      return json({ error: "Sessão inválida" }, 401);
    }

    // ── 4. Verificar role do chamador (owner ou admin apenas) ─────────────────
    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return json({ error: "Perfil não encontrado" }, 403);
    }
    if (!["owner", "admin"].includes(profile.role)) {
      return json({ error: "Acesso restrito a owner e admin" }, 403);
    }

    // ── 5. Validar body ───────────────────────────────────────────────────────
    let body: { client_id?: string; field?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Body inválido" }, 400);
    }

    const { client_id, field } = body;

    if (!client_id || typeof client_id !== "string") {
      return json({ error: "client_id é obrigatório" }, 400);
    }
    if (!field || !ALLOWED_FIELDS.includes(field as AllowedField)) {
      return json({ error: `field deve ser um de: ${ALLOWED_FIELDS.join(", ")}` }, 400);
    }

    // ── 6. Verificar que o cliente pertence à organização do chamador ─────────
    const { data: client, error: clientErr } = await adminClient
      .from("clients")
      .select("id, organization_id")
      .eq("id", client_id)
      .single();

    if (clientErr || !client) {
      return json({ error: "Cliente não encontrado" }, 404);
    }
    if (client.organization_id !== profile.organization_id) {
      return json({ error: "Acesso negado a este cliente" }, 403);
    }

    // ── 7. Buscar apenas a coluna solicitada ──────────────────────────────────
    const column = FIELD_TO_COLUMN[field as AllowedField];
    const { data: credRow, error: credErr } = await adminClient
      .from("clients")
      .select(column)
      .eq("id", client_id)
      .single();

    if (credErr) {
      console.error("[get-client-credentials] credErr:", credErr);
      return json({ error: "Erro ao buscar credencial" }, 500);
    }

    const value: string | null = (credRow as Record<string, string | null>)[column] ?? null;

    if (value === null) {
      return json({ error: "Credencial não configurada" }, 404);
    }

    // ── 8. Retornar apenas o valor ────────────────────────────────────────────
    return json({ value });

  } catch (err) {
    console.error("[get-client-credentials] unexpected:", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
