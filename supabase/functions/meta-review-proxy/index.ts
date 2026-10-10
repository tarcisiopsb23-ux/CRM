/**
 * meta-review-proxy
 *
 * Proxy seguro para chamadas à Meta Graph API durante testes de App Review.
 *
 * Responsabilidades:
 *   - Verificar JWT do chamador (organização autenticada)
 *   - Buscar o access_token real de oauth_tokens (nunca expõe ao frontend)
 *   - Executar a chamada à Meta API com o token armazenado
 *   - Registrar a chamada em meta_review_api_logs (sem token, sem secret)
 *   - Retornar resultado sem incluir o token na resposta
 *
 * NÃO registra: access_token, app_secret, signed_request, Authorization header.
 *
 * Secrets necessários:
 *   SUPABASE_URL              (auto-injetado)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-injetado)
 *   SAAS_JWT_SECRET           — para verificar o JWT
 *
 * Body esperado:
 * {
 *   permission:          string;   // ex: "pages_show_list"
 *   group_name?:         string;   // ex: "GRUPO 2 — FACEBOOK PAGES"
 *   endpoint:            string;   // ex: "/me/accounts"
 *   method?:             string;   // GET | POST | DELETE | PATCH (default: GET)
 *   params?:             object;   // query params ou body params
 *   meta_connection_id?: string;   // UUID da conexão de review (opcional)
 *   client_id?:          string;   // UUID do cliente C8 (opcional)
 *   use_page_token?:     boolean;  // se true, busca page access token para page_id
 *   page_id?:            string;   // necessário se use_page_token = true
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── 1. Verificar JWT e resolver organization_id ──────────────────────────
  // O JWT do C8 Control é emitido pelo Supabase Auth (padrão) e NÃO contém
  // organization_id como claim. Usamos o admin client para verificar a sessão
  // e buscar o organization_id via dashboard_users.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Não autorizado" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let organizationId: string;
  try {
    // Verifica o JWT com o admin client (verifica assinatura Supabase)
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user?.id) throw new Error("Token inválido");

    // Busca o organization_id do usuário via dashboard_users
    const { data: duRow, error: duErr } = await admin
      .from("dashboard_users")
      .select("organization_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (duErr || !duRow?.organization_id) {
      throw new Error("Usuário não encontrado ou sem organização");
    }

    organizationId = duRow.organization_id;
  } catch (e) {
    return json({ error: "Token inválido ou usuário não encontrado" }, 401);
  }

  // ── 2. Parse do body ──────────────────────────────────────────────────────
  let body: {
    permission: string;
    group_name?: string;
    endpoint: string;
    method?: string;
    params?: Record<string, unknown>;
    meta_connection_id?: string;
    client_id?: string;
    use_page_token?: boolean;
    page_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const {
    permission,
    group_name,
    endpoint,
    method = "GET",
    params = {},
    meta_connection_id,
    client_id,
    use_page_token = false,
    page_id,
  } = body;

  if (!permission || !endpoint) {
    return json({ error: "permission e endpoint são obrigatórios" }, 400);
  }

  // ── 3. Buscar access_token de oauth_tokens ────────────────────────────────
  // admin já foi criado no passo 1 — reutiliza a mesma instância

  // Busca pelo organization_id via clients (org → client_id → oauth_tokens)
  const { data: tokenRows, error: tokenErr } = await admin
    .from("oauth_tokens")
    .select("access_token, expires_at")
    .eq("provider", "meta")
    .in(
      "tenant_id",
      // Subquery: client_ids pertencentes a essa organização
      (await admin
        .from("clients")
        .select("id")
        .eq("organization_id", organizationId)
        .then(({ data }) => (data ?? []).map((r: { id: string }) => r.id))
      )
    )
    .not("access_token", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (tokenErr || !tokenRows || tokenRows.length === 0) {
    await logApiCall(admin, {
      organization_id: organizationId,
      client_id: client_id ?? null,
      permission,
      group_name: group_name ?? null,
      endpoint,
      http_method: method,
      response_status: 401,
      response_summary: "Token Meta não encontrado. Conecte o Meta nas Configurações.",
      is_live_test: false,
      meta_connection_id: meta_connection_id ?? null,
    });
    return json({
      error: "Token Meta não encontrado. Conecte sua conta Meta nas Configurações → Integrações.",
      code: "NO_META_TOKEN",
    }, 401);
  }

  let accessToken: string = tokenRows[0].access_token;

  // ── 4. Se page token solicitado, trocar pelo page access token ────────────
  if (use_page_token && page_id) {
    try {
      const pageTokenRes = await fetch(
        `${GRAPH_BASE}/${page_id}?fields=access_token&access_token=${accessToken}`
      );
      const pageTokenData = await pageTokenRes.json();
      if (pageTokenData.access_token) {
        accessToken = pageTokenData.access_token;
      }
    } catch {
      // Continua com o user token se não conseguir o page token
    }
  }

  // ── 5. Executar chamada à Meta API ────────────────────────────────────────
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  let metaUrl: string;
  let fetchOptions: RequestInit;

  if (method === "GET") {
    const urlParams = new URLSearchParams();
    urlParams.set("access_token", accessToken);
    for (const [k, v] of Object.entries(params)) {
      urlParams.set(k, String(v));
    }
    metaUrl = `${GRAPH_BASE}${normalizedEndpoint}?${urlParams.toString()}`;
    fetchOptions = { method: "GET" };
  } else {
    metaUrl = `${GRAPH_BASE}${normalizedEndpoint}`;
    fetchOptions = {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, access_token: accessToken }),
    };
  }

  let responseStatus = 0;
  let responseData: unknown = null;
  let responseSummary = "";
  let isLiveTest = true;

  try {
    const metaRes = await fetch(metaUrl, fetchOptions);
    responseStatus = metaRes.status;
    responseData = await metaRes.json();

    // Summarize sem expor dados sensíveis
    if (metaRes.ok) {
      const data = responseData as Record<string, unknown>;
      if (Array.isArray(data.data)) {
        responseSummary = `Success — ${(data.data as unknown[]).length} item(s) returned`;
      } else if (data.id) {
        responseSummary = `Success — resource ID: ${data.id}`;
      } else {
        responseSummary = `Success — status ${responseStatus}`;
      }
    } else {
      const errData = responseData as Record<string, unknown>;
      const metaErr = errData.error as Record<string, unknown> | undefined;
      responseSummary = metaErr
        ? `Error ${metaErr.code}: ${metaErr.message}`
        : `HTTP ${responseStatus}`;
    }
  } catch (fetchErr) {
    responseStatus = 0;
    responseSummary = `Network error: ${(fetchErr as Error).message}`;
    isLiveTest = false;
  }

  // ── 6. Registrar em meta_review_api_logs ──────────────────────────────────
  await logApiCall(admin, {
    organization_id: organizationId,
    client_id: client_id ?? null,
    permission,
    group_name: group_name ?? null,
    endpoint: normalizedEndpoint,
    http_method: method,
    response_status: responseStatus,
    response_summary: responseSummary,
    is_live_test: isLiveTest,
    meta_connection_id: meta_connection_id ?? null,
  });

  // ── 7. Retornar resultado (sem token) ─────────────────────────────────────
  if (responseStatus >= 200 && responseStatus < 300) {
    return json({
      success: true,
      data: sanitizeResponse(responseData),
      meta: {
        status: responseStatus,
        is_live_test: isLiveTest,
        endpoint: normalizedEndpoint,
        permission,
      },
    });
  }

  return json({
    success: false,
    error: responseSummary,
    meta: {
      status: responseStatus,
      is_live_test: isLiveTest,
      endpoint: normalizedEndpoint,
      permission,
    },
  }, responseStatus || 500);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Remove campos sensíveis da resposta antes de enviar ao frontend */
function sanitizeResponse(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitizeResponse);

  const obj = { ...(data as Record<string, unknown>) };

  // Remove campos sensíveis
  const sensitiveKeys = [
    "access_token", "app_secret", "signed_request",
    "client_secret", "secret", "token", "password",
  ];
  for (const key of sensitiveKeys) {
    if (key in obj) {
      delete obj[key];
    }
  }

  // Recursivo para objetos aninhados
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") {
      obj[k] = sanitizeResponse(v);
    }
  }

  return obj;
}

/** Registra a chamada no log de auditoria */
async function logApiCall(
  admin: ReturnType<typeof createClient>,
  entry: {
    organization_id: string;
    client_id: string | null;
    permission: string;
    group_name: string | null;
    endpoint: string;
    http_method: string;
    response_status: number;
    response_summary: string;
    is_live_test: boolean;
    meta_connection_id: string | null;
  }
): Promise<void> {
  try {
    await admin.from("meta_review_api_logs").insert(entry);
  } catch {
    // Log silencioso — não interrompe o fluxo principal
  }
}
