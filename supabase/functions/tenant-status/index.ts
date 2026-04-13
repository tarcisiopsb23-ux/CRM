/**
 * Edge Function: tenant-status
 *
 * Consulta o Maestr.ia via crm-tenant-api e atualiza o cache local
 * (tenant_config_cache) com o status atual do tenant.
 *
 * Chamada pelo frontend no login e a cada 30 minutos via useTenantStatus.
 * Nunca expõe a CRM_API_KEY ao frontend — toda comunicação com o Maestr.ia
 * ocorre server-side nesta função.
 *
 * O Support_User (role='support') não deve invocar esta função —
 * o frontend deve verificar o role antes de chamar.
 *
 * Required Supabase secrets:
 *   SUPABASE_URL              — CRM URL (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY — CRM service role key (auto-injected)
 *   MAESTRIA_CRM_API_URL      — URL da crm-tenant-api no Maestr.ia
 *   CRM_API_KEY               — Chave compartilhada com o Maestr.ia
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyJwt, JwtPayload } from "../_shared/jwt.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Autenticar o caller via JWT ──────────────────────────────────────────
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return jsonResponse({ error: "Não autorizado" }, 401);

    const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? "";
    let payload: JwtPayload;
    try {
      payload = await verifyJwt(token, jwtSecret);
    } catch {
      return jsonResponse({ error: "Token inválido ou expirado" }, 401);
    }

    const tenantId = payload.tenant_id ?? null;
    const role = payload.role ?? "member";

    // Usuários da agência (role='agency') não precisam de sincronização de status
    // pois não estão vinculados a nenhum tenant
    if (role === "agency" || role === "support") {
      return jsonResponse({ error: "Usuários da agência não requerem sincronização de status" }, 400);
    }

    if (!tenantId) {
      return jsonResponse({ error: "tenant_id não encontrado no token" }, 401);
    }

    // ── Consultar Maestr.ia via crm-tenant-api ───────────────────────────────
    const maestriaUrl = Deno.env.get("MAESTRIA_CRM_API_URL");
    const crmApiKey   = Deno.env.get("CRM_API_KEY");

    if (!maestriaUrl || !crmApiKey) {
      console.error("[tenant-status] MAESTRIA_CRM_API_URL ou CRM_API_KEY não configurados");
      return jsonResponse({ error: "Configuração de integração ausente" }, 503);
    }

    let maestriaData: {
      tenant_id?: string;
      status?: string;
      max_users?: number;
      plan_name?: string;
      blocked_reason?: string | null;
      contract_end?: string | null;
    };

    try {
      const res = await fetch(`${maestriaUrl}?tenant_id=${tenantId}`, {
        headers: { "x-crm-api-key": crmApiKey },
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (!res.ok) {
        console.error(`[tenant-status] crm-tenant-api retornou ${res.status}`);
        return jsonResponse({ error: "Serviço de configuração indisponível" }, 503);
      }

      maestriaData = await res.json();
    } catch (err: any) {
      console.error("[tenant-status] Falha ao consultar Maestr.ia:", err.message);
      // Não sobrescreve o cache em caso de falha — retorna 503
      return jsonResponse({ error: "Timeout ao consultar Maestr.ia" }, 503);
    }

    // ── Atualizar cache no CRM via service role key ──────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: upsertErr } = await supabase
      .from("tenant_config_cache")
      .upsert({
        tenant_id:      tenantId,
        status:         maestriaData.status         ?? "ativo",
        max_users:      maestriaData.max_users       ?? 3,
        plan_name:      maestriaData.plan_name       ?? "Starter",
        blocked_reason: maestriaData.blocked_reason  ?? null,
        contract_end:   maestriaData.contract_end    ?? null,
        synced_at:      new Date().toISOString(),
      }, { onConflict: "tenant_id" });

    if (upsertErr) {
      console.error("[tenant-status] Erro ao atualizar cache:", upsertErr.message);
      return jsonResponse({ error: "Erro ao atualizar cache local" }, 500);
    }

    return jsonResponse({
      tenant_id:      tenantId,
      status:         maestriaData.status         ?? "ativo",
      max_users:      maestriaData.max_users       ?? 3,
      plan_name:      maestriaData.plan_name       ?? "Starter",
      blocked_reason: maestriaData.blocked_reason  ?? null,
      contract_end:   maestriaData.contract_end    ?? null,
      synced_at:      new Date().toISOString(),
    });

  } catch (err: any) {
    console.error("[tenant-status] Erro não tratado:", err.message);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
