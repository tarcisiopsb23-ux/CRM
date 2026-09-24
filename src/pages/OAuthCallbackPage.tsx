import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/**
 * Handles OAuth callback from Google and Meta.
 * Exchanges the authorization code for tokens via a Supabase Edge Function,
 * then stores the tokens in oauth_tokens table.
 *
 * URL: /oauth/callback?code=...&state=...
 * State encodes: { provider, clientId, slug }
 * After success: redirects to /:slug/configuracoes/integracoes
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Processando autorizacao...");

  // Resolve destino de redirect a partir do state
  function resolveRedirect(slug?: string) {
    if (slug) return `/${slug}/configuracoes/integracoes`;
    return "/login";
  }

  useEffect(() => {
    const code     = params.get("code");
    const stateRaw = params.get("state");
    const error    = params.get("error");

    let state: { provider: string; clientId: string; slug?: string } = { provider: "", clientId: "" };
    if (stateRaw) {
      try { state = JSON.parse(atob(stateRaw)); } catch { /* ignora */ }
    }

    const dest = resolveRedirect(state.slug);

    if (error) {
      setStatus("error");
      setMessage(`Autorizacao negada: ${error}`);
      setTimeout(() => navigate(dest), 3000);
      return;
    }

    if (!code || !stateRaw) {
      setStatus("error");
      setMessage("Parametros invalidos na URL de callback.");
      setTimeout(() => navigate(dest), 3000);
      return;
    }

    if (!state.provider || !state.clientId) {
      setStatus("error");
      setMessage("State invalido.");
      setTimeout(() => navigate(dest), 3000);
      return;
    }

    exchangeCode(code, state.provider, state.clientId, dest);
  }, []);

  async function exchangeCode(code: string, provider: string, clientId: string, dest: string) {
    try {
      const { data, error } = await supabase.functions.invoke("oauth-exchange", {
        body: {
          code,
          provider,
          clientId,
          redirectUri: `${window.location.origin}/oauth/callback`,
        },
      });

      if (error) throw error;

      setStatus("success");
      setMessage(`${provider === "google" ? "Google" : "Meta"} conectado com sucesso!`);
      setTimeout(() => navigate(dest), 2000);
    } catch (err: any) {
      setStatus("error");
      setMessage(`Erro ao conectar: ${err?.message ?? "Tente novamente."}`);
      setTimeout(() => navigate(dest), 4000);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
      <div className="text-center space-y-4">
        {status === "processing" && (
          <div className="h-10 w-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        )}
        {status === "success" && (
          <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
            <span className="text-emerald-400 text-2xl">&#10003;</span>
          </div>
        )}
        {status === "error" && (
          <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <span className="text-red-400 text-2xl">&#10005;</span>
          </div>
        )}
        <p className="text-white font-bold">{message}</p>
        <p className="text-slate-500 text-sm">Redirecionando para as configuracoes...</p>
      </div>
    </div>
  );
}
