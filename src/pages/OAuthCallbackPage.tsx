import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/**
 * Handles OAuth callback from Google and Meta.
 * Exchanges the authorization code for tokens via a Supabase Edge Function,
 * then stores the tokens in oauth_tokens table.
 *
 * URL: /oauth/callback?code=...&state=...
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Processando autorização...");

  useEffect(() => {
    const code = params.get("code");
    const stateRaw = params.get("state");
    const error = params.get("error");

    if (error) {
      setStatus("error");
      setMessage(`Autorização negada: ${error}`);
      setTimeout(() => navigate("/dashboard/profile"), 3000);
      return;
    }

    if (!code || !stateRaw) {
      setStatus("error");
      setMessage("Parâmetros inválidos na URL de callback.");
      setTimeout(() => navigate("/dashboard/profile"), 3000);
      return;
    }

    let state: { provider: string; clientId: string };
    try {
      state = JSON.parse(atob(stateRaw));
    } catch {
      setStatus("error");
      setMessage("State inválido.");
      setTimeout(() => navigate("/dashboard/profile"), 3000);
      return;
    }

    exchangeCode(code, state.provider, state.clientId);
  }, []);

  async function exchangeCode(code: string, provider: string, clientId: string) {
    try {
      // Call Supabase Edge Function to exchange code for tokens server-side
      // (client_secret must never be exposed in the browser)
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
      setTimeout(() => navigate("/dashboard/profile"), 2000);
    } catch (err: any) {
      setStatus("error");
      setMessage(`Erro ao conectar: ${err?.message ?? "Tente novamente."}`);
      setTimeout(() => navigate("/dashboard/profile"), 4000);
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
            <span className="text-emerald-400 text-2xl">✓</span>
          </div>
        )}
        {status === "error" && (
          <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <span className="text-red-400 text-2xl">✕</span>
          </div>
        )}
        <p className="text-white font-bold">{message}</p>
        <p className="text-slate-500 text-sm">Redirecionando para as configurações...</p>
      </div>
    </div>
  );
}
