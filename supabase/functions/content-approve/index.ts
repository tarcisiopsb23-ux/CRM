/**
 * content-approve
 *
 * Registra a decisão de aprovação, reprovação ou solicitação de alteração
 * de um item de conteúdo pelo cliente (C8 Control) ou pelo parceiro (C8 Parceiro).
 *
 * Usa SECURITY DEFINER (via RPC approve_content_item) para:
 *   - Atualizar content_items.status e approval_status
 *   - Inserir em content_approval_history (tabela imutável)
 *   - Criar notificação para a agência
 *
 * A RLS impede que cliente e parceiro façam estas operações diretamente.
 *
 * Autenticação: JWT Supabase do cliente (C8 Control) ou parceiro (C8 Parceiro)
 *
 * POST application/json:
 * {
 *   content_item_id: UUID,
 *   decision:        "aprovado" | "reprovado" | "alteracao_solicitada",
 *   notes?:          string
 * }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Valida JWT ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ error: "Token de autenticação obrigatório" }, 401);

  const userClient = createClient(SUPA_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Token inválido ou expirado" }, 401);

  // ── Extrai claims do JWT ───────────────────────────────────────────────────
  const jwt          = JSON.parse(atob(token.split(".")[1]));
  const userType     = jwt.user_type as string | undefined;

  // Só clientes e parceiros podem chamar esta função
  if (userType !== "client" && userType !== "partner") {
    return json({ error: "Apenas clientes ou parceiros podem aprovar conteúdo" }, 403);
  }

  // Determina o id e o nome do decisor
  let deciderId:   string;
  let deciderName: string;

  if (userType === "client") {
    // client_user_id é o id em dashboard_users
    deciderId   = (jwt.client_user_id as string) ?? user.id;
    deciderName = (jwt.full_name      as string) ?? "Cliente";
  } else {
    // partner_user_id é o id em partner_users
    deciderId   = (jwt.partner_user_id as string) ?? user.id;
    deciderName = (jwt.full_name       as string) ?? "Parceiro";
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { content_item_id?: string; decision?: string; notes?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Body JSON inválido" }, 400); }

  const { content_item_id, decision, notes } = body;

  if (!content_item_id) return json({ error: "content_item_id obrigatório" }, 400);
  if (!decision)        return json({ error: "decision obrigatório" }, 400);

  if (!["aprovado", "reprovado", "alteracao_solicitada"].includes(decision)) {
    return json({ error: "decision deve ser: aprovado | reprovado | alteracao_solicitada" }, 400);
  }

  // ── Executa a RPC SECURITY DEFINER ────────────────────────────────────────
  // A RPC valida que o item está em 'aguardando_aprovacao' antes de agir.
  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: result, error: rpcErr } = await admin
    .rpc("approve_content_item", {
      p_item_id:      content_item_id,
      p_decision:     decision,
      p_decider_id:   deciderId,
      p_decider_type: userType,
      p_decider_name: deciderName,
      p_notes:        notes ?? null,
    });

  if (rpcErr) {
    console.error("[content-approve] RPC error:", rpcErr);
    return json({ error: "Falha ao registrar decisão" }, 500);
  }

  if (result && !result.success) {
    return json({ error: result.error }, 400);
  }

  return json({
    success:    true,
    decision,
    new_status: result?.new_status,
  });
});
