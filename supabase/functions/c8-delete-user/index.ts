/**
 * Edge Function: c8-delete-user
 * Projeto: Maestr.ia
 *
 * Exclui o usuário do auth.users do C8 Control pelo e-mail.
 * Chamada pelo Maestr.ia ao deletar um tenant do C8 Control.
 *
 * Secrets necessários:
 *   C8_SUPABASE_URL         — URL do projeto C8 Control
 *   C8_SUPABASE_SERVICE_KEY — Service role key do C8 Control
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── 1. Autenticar chamador (owner/admin do Maestr.ia) ─────────────────────
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
      .from("profiles")
      .select("role")
      .eq("id", callerUser.id)
      .single();

    if (!["owner", "admin"].includes(callerProfile?.role ?? "")) {
      return json({ error: "Apenas owner/admin podem excluir usuários do C8 Control" }, 403);
    }

    // ── 2. Payload ────────────────────────────────────────────────────────────
    const body = await req.json() as { email: string };
    const { email } = body;
    if (!email?.includes("@")) return json({ error: "E-mail inválido" }, 400);

    // ── 3. Conectar ao C8 Control ─────────────────────────────────────────────
    const c8Url = Deno.env.get("C8_SUPABASE_URL");
    const c8ServiceKey = Deno.env.get("C8_SUPABASE_SERVICE_KEY");
    if (!c8Url || !c8ServiceKey) {
      return json({ error: "C8_SUPABASE_URL ou C8_SUPABASE_SERVICE_KEY não configurados" }, 500);
    }

    const c8Admin = createClient(c8Url, c8ServiceKey, {
      auth: { persistSession: false },
    });

    // ── 4. Buscar usuário pelo e-mail ─────────────────────────────────────────
    const { data: usersPage } = await c8Admin.auth.admin.listUsers({ perPage: 1000 });
    const c8User = usersPage?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!c8User) {
      // Usuário não existe no C8 Control — não é erro, apenas log
      console.log("[c8-delete-user] user not found in C8 Control:", email);
      return json({ success: true, message: "Usuário não encontrado no C8 Control (já removido ou nunca criado)" });
    }

    // ── 5. Excluir do auth.users do C8 Control ────────────────────────────────
    const { error: deleteErr } = await c8Admin.auth.admin.deleteUser(c8User.id);
    if (deleteErr) {
      console.error("[c8-delete-user] delete error:", deleteErr);
      return json({ error: `Erro ao excluir usuário: ${deleteErr.message}` }, 500);
    }

    console.log("[c8-delete-user] user deleted:", c8User.id, email);
    return json({ success: true, message: `Usuário ${email} excluído do C8 Control` });

  } catch (err) {
    console.error("[c8-delete-user] unexpected error:", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
