/**
 * whatsapp-template-service
 *
 * Gerencia templates WhatsApp Business via Meta Graph API.
 * Nunca expõe tokens ao frontend — credenciais resolvidas via meta-credential-provider.
 *
 * Endpoints (campo `action` no body):
 *
 *   list      — Lista templates da WABA (sincroniza com o banco local)
 *   sync      — Sincroniza status de todos os templates da WABA
 *   create    — Cria template e submete para aprovação Meta
 *   get       — Busca um template específico por ID local
 *   delete    — Remove template da Meta e do banco local
 *
 * Body:
 *   { action, connection_id, organization_id, ...dados }
 *
 * Segurança:
 *   - Requer JWT autenticado (Authorization: Bearer <token>)
 *   - organization_id validado contra o JWT
 *   - Tokens Meta nunca expostos ao frontend
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v19.0";
const GRAPH_BASE    = `https://graph.facebook.com/${GRAPH_VERSION}`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Resolve token via meta-credential-provider ────────────────────────────────
async function resolveToken(
  connectionId: string,
  organizationId: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<string> {
  const internalSecret = Deno.env.get("INTERNAL_SECRET");
  if (!internalSecret) throw new Error("INTERNAL_SECRET não configurado");

  const res = await fetch(`${supabaseUrl}/functions/v1/meta-credential-provider`, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "X-Internal-Secret": internalSecret,
    },
    body: JSON.stringify({
      connection_id:   connectionId,
      organization_id: organizationId,
      action:          "get_token",
    }),
  });

  if (!res.ok) {
    const err = await res.json() as { error?: string };
    throw new Error(err.error ?? "credential_provider_error");
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ── Normaliza status da Meta para nosso enum ──────────────────────────────────
function normalizeStatus(metaStatus: string): string {
  // Meta retorna: APPROVED, PENDING, REJECTED, PAUSED, DISABLED, IN_APPEAL, DELETED
  // Mantemos o valor original, apenas garantimos uppercase
  return (metaStatus ?? "PENDING").toUpperCase();
}

// ── Upsert template no banco local ────────────────────────────────────────────
async function upsertTemplate(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  connectionId: string,
  wabaId: string,
  tpl: Record<string, unknown>
) {
  const status = normalizeStatus(String(tpl.status ?? "PENDING"));

  await admin.from("whatsapp_templates").upsert({
    organization_id:  organizationId,
    connection_id:    connectionId,
    waba_id:          wabaId,
    meta_template_id: String(tpl.id ?? ""),
    name:             String(tpl.name ?? ""),
    category:         String(tpl.category ?? "UTILITY").toUpperCase(),
    language:         String(tpl.language ?? "pt_BR"),
    status:           status,
    status_meta:      String(tpl.status ?? ""),
    rejection_reason: (tpl.rejected_reason ?? null) as string | null,
    components:       (tpl.components ?? []) as unknown[],
    meta_payload:     tpl,
    last_synced_at:   new Date().toISOString(),
  }, {
    onConflict: "meta_template_id",
    ignoreDuplicates: false,
  });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleList(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  token: string,
  wabaId: string,
  organizationId: string,
  connectionId: string
) {
  // Busca templates da WABA na Meta
  const fields = "id,name,category,language,status,rejected_reason,components";
  const metaRes = await fetch(
    `${GRAPH_BASE}/${wabaId}/message_templates?fields=${fields}&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!metaRes.ok) {
    const err = await metaRes.json() as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Meta API error ${metaRes.status}`);
  }

  const metaData = await metaRes.json() as { data?: unknown[] };
  const templates = metaData.data ?? [];

  // Sincroniza com banco local
  for (const tpl of templates) {
    await upsertTemplate(admin, organizationId, connectionId, wabaId, tpl as Record<string, unknown>);
  }

  // Retorna templates do banco local (com campos extras como variable_mapping)
  const { data: localTemplates } = await admin
    .from("whatsapp_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  return json({ templates: localTemplates ?? [], synced: templates.length });
}

async function handleSync(
  admin: ReturnType<typeof createClient>,
  token: string,
  wabaId: string,
  organizationId: string,
  connectionId: string
) {
  // Busca todos os templates locais desta WABA
  const { data: localTemplates } = await admin
    .from("whatsapp_templates")
    .select("meta_template_id, name")
    .eq("organization_id", organizationId)
    .eq("waba_id", wabaId)
    .not("meta_template_id", "is", null);

  if (!localTemplates?.length) {
    return json({ synced: 0, message: "Nenhum template local para sincronizar" });
  }

  let synced = 0;

  // Para cada template, busca status atualizado na Meta
  for (const local of localTemplates) {
    try {
      const metaRes = await fetch(
        `${GRAPH_BASE}/${local.meta_template_id}?fields=id,name,status,rejected_reason`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!metaRes.ok) continue;

      const tpl = await metaRes.json() as Record<string, unknown>;
      const status = normalizeStatus(String(tpl.status ?? "PENDING"));

      await admin.from("whatsapp_templates")
        .update({
          status,
          status_meta:      String(tpl.status ?? ""),
          rejection_reason: (tpl.rejected_reason ?? null) as string | null,
          last_synced_at:   new Date().toISOString(),
        })
        .eq("meta_template_id", local.meta_template_id);

      synced++;
    } catch {
      // Continua com o próximo em caso de erro individual
    }
  }

  return json({ synced, total: localTemplates.length });
}

async function handleCreate(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  token: string,
  wabaId: string,
  organizationId: string,
  connectionId: string
) {
  const { name, category, language, components, variable_mapping, variable_examples } =
    body as {
      name: string;
      category: string;
      language: string;
      components: unknown[];
      variable_mapping?: Record<string, string>;
      variable_examples?: Record<string, string>;
    };

  if (!name || !category || !language || !components?.length) {
    return json({ error: "name, category, language e components são obrigatórios" }, 400);
  }

  // Valida nome (snake_case, sem espaços, sem caracteres especiais)
  if (!/^[a-z0-9_]+$/.test(name)) {
    return json({ error: "O nome do template deve conter apenas letras minúsculas, números e underscore" }, 400);
  }

  // Submete para a Meta
  const metaPayload = { name, category, language, components };
  const metaRes = await fetch(`${GRAPH_BASE}/${wabaId}/message_templates`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${token}`,
    },
    body: JSON.stringify(metaPayload),
  });

  const metaData = await metaRes.json() as Record<string, unknown>;

  if (!metaRes.ok) {
    const errMsg = (metaData.error as Record<string, unknown>)?.message
      ?? `Meta API error ${metaRes.status}`;
    return json({ error: String(errMsg), meta_error: metaData }, 400);
  }

  // Salva no banco local
  const { data: saved, error: dbErr } = await admin
    .from("whatsapp_templates")
    .insert({
      organization_id:   organizationId,
      connection_id:     connectionId,
      waba_id:           wabaId,
      meta_template_id:  String(metaData.id ?? ""),
      name,
      category:          String(category).toUpperCase(),
      language,
      status:            "PENDING",
      status_meta:       "PENDING",
      components,
      variable_mapping:  variable_mapping  ?? {},
      variable_examples: variable_examples ?? {},
      meta_payload:      { request: metaPayload, response: metaData },
      last_synced_at:    new Date().toISOString(),
    })
    .select()
    .single();

  if (dbErr) {
    console.error("[whatsapp-template-service] DB insert error:", dbErr);
    return json({ error: "Template submetido à Meta mas erro ao salvar localmente", meta_id: metaData.id }, 207);
  }

  return json({ template: saved, meta_response: metaData }, 201);
}

async function handleGet(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  organizationId: string
) {
  const { template_id } = body as { template_id: string };
  if (!template_id) return json({ error: "template_id obrigatório" }, 400);

  const { data, error } = await admin
    .from("whatsapp_templates")
    .select("*")
    .eq("id", template_id)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) return json({ error: "Template não encontrado" }, 404);
  return json({ template: data });
}

async function handleUpdateMapping(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  organizationId: string
) {
  const { template_id, variable_mapping, variable_examples } =
    body as { template_id: string; variable_mapping?: Record<string, string>; variable_examples?: Record<string, string> };

  if (!template_id) return json({ error: "template_id obrigatório" }, 400);

  const { data, error } = await admin
    .from("whatsapp_templates")
    .update({ variable_mapping, variable_examples, updated_at: new Date().toISOString() })
    .eq("id", template_id)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) return json({ error: "Template não encontrado" }, 404);
  return json({ template: data });
}

async function handleDelete(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  token: string,
  wabaId: string,
  organizationId: string
) {
  const { template_id } = body as { template_id: string };
  if (!template_id) return json({ error: "template_id obrigatório" }, 400);

  // Busca template local
  const { data: tpl } = await admin
    .from("whatsapp_templates")
    .select("meta_template_id, name")
    .eq("id", template_id)
    .eq("organization_id", organizationId)
    .single();

  if (!tpl) return json({ error: "Template não encontrado" }, 404);

  // Deleta na Meta (se tiver meta_template_id)
  if (tpl.meta_template_id && tpl.name) {
    await fetch(
      `${GRAPH_BASE}/${wabaId}/message_templates?hsm_id=${tpl.meta_template_id}&name=${tpl.name}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
  }

  // Remove do banco local
  await admin.from("whatsapp_templates").delete().eq("id", template_id).eq("organization_id", organizationId);

  return json({ deleted: true });
}

// ── Servidor principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL  = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Valida JWT do usuário
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado" }, 401);

  const userClient = createClient(SUPA_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sessão inválida" }, 401);

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const { action, connection_id, organization_id } = body as {
    action: string;
    connection_id: string;
    organization_id: string;
  };

  if (!action)          return json({ error: "action é obrigatório" }, 400);
  if (!connection_id)   return json({ error: "connection_id é obrigatório" }, 400);
  if (!organization_id) return json({ error: "organization_id é obrigatório" }, 400);

  // Valida que o usuário pertence à organização
  const { data: orgCheck } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!orgCheck || orgCheck.organization_id !== organization_id) {
    return json({ error: "Acesso negado" }, 403);
  }

  // Busca conexão para obter waba_id
  const { data: conn } = await admin
    .from("meta_connections")
    .select("waba_id, status, provider")
    .eq("id", connection_id)
    .eq("organization_id", organization_id)
    .single();

  if (!conn) return json({ error: "Conexão não encontrada" }, 404);
  if (conn.provider !== "whatsapp" && conn.provider !== "meta_multi") {
    return json({ error: "Conexão não é do tipo WhatsApp" }, 400);
  }
  if (!["active", "needs_reauthentication"].includes(conn.status)) {
    return json({ error: `Conexão inativa: ${conn.status}` }, 400);
  }
  if (!conn.waba_id) return json({ error: "WABA ID não configurado nesta conexão" }, 400);

  try {
    // Resolve token — nunca exposto ao frontend
    const token = await resolveToken(connection_id, organization_id, SUPA_URL, SVC_KEY);

    switch (action) {
      case "list":
        return await handleList(admin, body, token, conn.waba_id, organization_id, connection_id);
      case "sync":
        return await handleSync(admin, token, conn.waba_id, organization_id, connection_id);
      case "create":
        return await handleCreate(admin, body, token, conn.waba_id, organization_id, connection_id);
      case "get":
        return await handleGet(admin, body, organization_id);
      case "update_mapping":
        return await handleUpdateMapping(admin, body, organization_id);
      case "delete":
        return await handleDelete(admin, body, token, conn.waba_id, organization_id);
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[whatsapp-template-service] Error:", err);
    return json({ error: (err as Error).message ?? "Erro interno" }, 500);
  }
});
