/**
 * GoogleCalendarCallbackPage
 *
 * Página intermediária para o callback OAuth2 do Google Calendar.
 * Recebe os parâmetros via query string (?success=true|false&message=...&client_id=...),
 * dispara postMessage para a janela pai (useGoogleCalendar) e fecha o popup.
 *
 * Rota: /public/dashboard/google-calendar-callback
 * Chamada pela Edge Function google-calendar-oauth/callback via redirect.
 */

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export function GoogleCalendarCallbackPage() {
  const [searchParams] = useSearchParams();

  const success  = searchParams.get("success") === "true";
  const message  = searchParams.get("message")  ?? (success ? "Conectado com sucesso!" : "Erro na conexão.");
  const clientId = searchParams.get("client_id") ?? undefined;

  useEffect(() => {
    // Envia resultado para a janela pai (useGoogleCalendar → handleMessage)
    try {
      window.opener?.postMessage(
        { type: "GOOGLE_CALENDAR_AUTH", success, message, clientId },
        "*"
      );
    } catch { /* janela pai pode ter sido fechada */ }

    // Fecha o popup após breve delay para o usuário ver o resultado
    const timer = setTimeout(() => {
      try { window.close(); } catch { /* ignorado */ }
    }, 1500);

    return () => clearTimeout(timer);
  }, [success, message, clientId]);

  return (
    <div className="min-h-screen bg-[#0B1118] flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        {success ? (
          <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto" />
        ) : (
          <XCircle className="h-14 w-14 text-red-400 mx-auto" />
        )}

        <p className={`text-lg font-bold ${success ? "text-emerald-400" : "text-red-400"}`}>
          {success ? "Google Calendar conectado!" : "Erro na conexão"}
        </p>

        <p className="text-sm text-slate-400">{message}</p>

        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Esta janela fechará automaticamente...
        </div>
      </div>
    </div>
  );
}
