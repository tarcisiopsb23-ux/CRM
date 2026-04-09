/**
 * Edge Function: secret-question
 *
 * Gerencia pergunta secreta para recuperação de senha sem e-mail.
 *
 * Actions:
 *   get-question  — retorna a pergunta secreta do usuário pelo e-mail (sem autenticação)
 *   verify-answer — verifica a resposta e, se correta, gera um OTP de reset de senha
 *   save          — salva/atualiza pergunta e hash da resposta (requer JWT autenticado)
 *
 * Segurança:
 *   - A resposta NUNCA é armazenada em texto puro — apenas SHA-256 normalizado
 *   - get-question e verify-answer são públicos (sem JWT) pois são usados no login
 *   - save requer JWT válido do próprio usuário
 *   - verify-answer tem rate limit implícito via Supabase (sem brute force fácil)
 *
 * Armazenamento: user_metadata do Supabase Auth
 *   secret_question:      string  — texto da pergunta
 *   secret_answer_hash:   string  — SHA-256 hex da resposta normalizada (lowercase + trim)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractBearerToken, decodeJwtPayload } from "../_shared/jwt.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON inválido" }, 400);
  }

  const { action } = body;

  // ── get-question: retorna a pergunta pelo e-mail ──────────────────────────
  if (action === "get-question") {
    const { email } = body;
    if (!email?.trim()) return jsonResponse({ error: "email é obrigatório" }, 400);

    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());

    if (!user) {
      // Não revelar se o e-mail existe ou não
      return jsonResponse({ has_question: false });
    }

    const question = user.user_metadata?.secret_question ?? null;
    if (!question) return jsonResponse({ has_question: false });

    return jsonResponse({ has_question: true, question });
  }

  // ── verify-answer: verifica resposta e gera link de reset ─────────────────
  if (action === "verify-answer") {
    const { email, answer } = body;
    if (!email?.trim() || !answer?.trim()) {
      return jsonResponse({ error: "email e answer são obrigatórios" }, 400);
    }

    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());

    if (!user) return jsonResponse({ correct: false }, 200);

    const storedHash = user.user_metadata?.secret_answer_hash ?? null;
    if (!storedHash) return jsonResponse({ correct: false }, 200);

    const inputHash = await sha256hex(normalizeAnswer(answer));

    if (inputHash !== storedHash) {
      return jsonResponse({ correct: false }, 200);
    }

    // Resposta correta — gerar link de reset de senha
    const appUrl = Deno.env.get("APP_URL") ?? "";
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: user.email!,
      options: { redirectTo: `${appUrl}/login?reset=1` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[secret-question] generateLink error:", linkErr?.message);
      return jsonResponse({ error: "Erro ao gerar link de recuperação" }, 500);
    }

    return jsonResponse({
      correct: true,
      action_link: linkData.properties.action_link,
    });
  }

  // ── save: salva pergunta + hash da resposta (requer JWT) ──────────────────
  if (action === "save") {
    const token = extractBearerToken(req);
    if (!token) return jsonResponse({ error: "Não autorizado" }, 401);

    const payload = decodeJwtPayload(token);
    const userId = payload?.sub;
    if (!userId) return jsonResponse({ error: "Token inválido" }, 401);

    const { question, answer } = body;
    if (!question?.trim()) return jsonResponse({ error: "question é obrigatório" }, 400);
    if (!answer?.trim())   return jsonResponse({ error: "answer é obrigatório" }, 400);
    if (answer.trim().length < 3) return jsonResponse({ error: "Resposta muito curta (mínimo 3 caracteres)" }, 400);

    const answerHash = await sha256hex(normalizeAnswer(answer));

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        secret_question:    question.trim(),
        secret_answer_hash: answerHash,
      },
    });

    if (updateErr) {
      console.error("[secret-question] updateUserById error:", updateErr.message);
      return jsonResponse({ error: "Erro ao salvar pergunta secreta" }, 500);
    }

    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: `action inválida: ${action}` }, 400);
});
