/**
 * Edge Function: c8-delete-user
 * Projeto: Maestr.ia
 *
 * Remove o usuário do auth.users do Banco B de um cliente específico.
 * Recebe client_id para buscar as credenciais do Banco B correto.
 *
 * Não usa mais C8_SUPABASE_URL, C8_SUPABASE_SERVICE_KEY.
 *
 * Secrets necessários:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Banco A (injetados automaticamente)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { data: { user: caller }, error: jwtErr } = await maestriaAdmin.auth.getUser(jwt);
    if (jwtErr || !caller) return json({ error: "Sessão inválida" }, 401);

    const { data: callerProfile } = await maestriaAdmin
      .from("profiles").select("role").eq("id", caller.id).single();
    if (!["owner", "admin"].includes(callerProfile?.role ?? ""))
      return json({ error: "Apenas owner/admin podem excluir usuários" }, 403);

    const body = await req.json() as { client_id: string; email: string };
    const { client_id, email } = body;

    if (!client_id) return json({ error: "client_id é obrigatório" }, 400);
    if (!email?.includes("@")) return json({ error: "E-mail inválido" }, 400);

    // ── Busca credenciais do Banco B ──────────────────────────────────────────
    const { data: clientRow, error: clientErr } = await maestriaAdmin
      .from("clients")
      .select("name, client_supabase_url, client_supabase_service_key")
      .eq("id", client_id)
      .maybeSingle();

    if (clientErr || !clientRow) return json({ error: "Cliente não encontrado" }, 404);

    const bankBUrl = (clientRow as Record<string, unknown>).client_supabase_url as string | null;
    const bankBKey = (clientRow as Record<string, unknown>).client_supabase_service_key as string | null;

    if (!bankBUrl || !bankBKey) {
      // Banco B não configurado — nada a deletar lá, retorna sucesso
      console.log("[c8-delete-user] Banco B não configurado para cliente:", client_id);
      return json({ success: true, message: "Banco B não configurado — nada a remover." });
    }

    const bankBAdmin = createClient(bankBUrl, bankBKey, { auth: { persistSession: false } });

    // ── Localiza usuário pelo e-mail ──────────────────────────────────────────
    const { data: usersPage } = await bankBAdmin.auth.admin.listUsers({ perPage: 1000 });
    const target = usersPage?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!target) {
      console.log("[c8-delete-user] usuário não encontrado no Banco B:", email, client_id);
      return json({ success: true, message: "Usuário não encontrado no Banco B (já removido ou nunca criado)." });
    }

    // ── Remove do auth.users do Banco B ───────────────────────────────────────
    const { error: deleteErr } = await bankBAdmin.auth.admin.deleteUser(target.id);
    if (deleteErr) {
      console.error("[c8-delete-user] erro ao deletar:", deleteErr);
      return json({ error: `Erro ao excluir usuário: ${deleteErr.message}` }, 500);
    }

    console.log("[c8-delete-user] usuário removido:", target.id, email, "client:", client_id);
    return json({ success: true, message: `Usuário ${email} removido do Banco B.` });

  } catch (err) {
    console.error("[c8-delete-user]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
