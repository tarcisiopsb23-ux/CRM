/**
 * BookingActionPage — /booking/:slug/action/:token
 *
 * Página pública processada quando o paciente/cliente clica em
 * Confirmar / Reagendar / Cancelar no e-mail ou WhatsApp de lembrete.
 *
 * Fluxo:
 *   1. Carrega dados do agendamento via GET ?action_token=<token>
 *   2. Exibe resumo do agendamento + botão de confirmação da ação
 *   3. POST action=confirm|cancel|reschedule com o token
 *   4. Exibe resultado:
 *      - confirm    → tela de confirmação ✅
 *      - cancel     → tela de cancelado com link para reagendar
 *      - reschedule → redireciona para /booking/:slug com telefone pré-preenchido
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2, XCircle, CalendarDays, Loader2,
  Clock, User, Scissors, AlertCircle, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agenda-booking`;

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ActionType = "confirm" | "cancel" | "reschedule";

interface AppointmentData {
  action_type:       ActionType;
  appointment_id:    string;
  slug:              string;
  customer_name:     string;
  service_name:      string;
  appt_status:       string;
  start_at:          string;
  end_at:            string | null;
  professional_name: string | null;
  date_formatted:    string;
  time_formatted:    string;
}

type Phase = "loading" | "confirm_screen" | "processing" | "success" | "error";

// ── Labels e cores por ação ───────────────────────────────────────────────────

const ACTION_CONFIG: Record<ActionType, {
  label:       string;
  btnLabel:    string;
  btnColor:    string;
  icon:        string;
  description: string;
}> = {
  confirm: {
    label:       "Confirmar presença",
    btnLabel:    "Sim, vou comparecer",
    btnColor:    "#10b981",
    icon:        "✅",
    description: "Confirme que você comparecerá ao agendamento abaixo.",
  },
  cancel: {
    label:       "Cancelar agendamento",
    btnLabel:    "Confirmar cancelamento",
    btnColor:    "#ef4444",
    icon:        "❌",
    description: "Ao cancelar, o horário será liberado para outros clientes.",
  },
  reschedule: {
    label:       "Reagendar",
    btnLabel:    "Liberar horário e reagendar",
    btnColor:    "#f59e0b",
    icon:        "📅",
    description: "O horário atual será liberado e você poderá escolher um novo horário.",
  },
};

// ── Componente ────────────────────────────────────────────────────────────────

export function BookingActionPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const navigate         = useNavigate();

  const [phase,       setPhase]       = useState<Phase>("loading");
  const [apptData,    setApptData]    = useState<AppointmentData | null>(null);
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);
  const [resultData,  setResultData]  = useState<Record<string, string> | null>(null);

  // ── Carrega dados do token ───────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setPhase("error"); setErrorMsg("Link inválido."); return; }

    fetch(`${EDGE_URL}?action_token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (data.error) {
          const msg =
            data.error === "token_not_found"       ? "Este link não é válido." :
            data.error === "token_already_used"     ? "Este link já foi utilizado anteriormente." :
            data.error === "token_expired"          ? "Este link expirou. Solicite um novo lembrete." :
            data.error === "appointment_already_cancelled" ? "Este agendamento já foi cancelado." :
            "Link inválido ou expirado.";
          setErrorMsg(msg);
          setPhase("error");
          return;
        }
        setApptData(data as unknown as AppointmentData);
        setPhase("confirm_screen");
      })
      .catch(() => { setErrorMsg("Não foi possível carregar os dados. Tente novamente."); setPhase("error"); });
  }, [token]);

  // ── Executa a ação ───────────────────────────────────────────────────────
  const handleAction = async () => {
    if (!apptData || !token) return;
    setPhase("processing");

    try {
      const res = await fetch(EDGE_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: apptData.action_type, token }),
      });
      const data = await res.json() as Record<string, unknown>;

      if (!res.ok || data.error) {
        const errCode = data.error as string;
        const msg =
          errCode === "token_already_used" ? "Este link já foi utilizado." :
          errCode === "token_expired"      ? "Este link expirou." :
          errCode === "token_not_found"    ? "Link inválido." :
          (data.message as string) ?? "Erro ao processar. Tente novamente.";
        setErrorMsg(msg);
        setPhase("error");
        return;
      }

      // Reagendar → redireciona para booking com telefone pré-preenchido
      if (apptData.action_type === "reschedule" && data.reschedule_url) {
        const rescheduleUrl = data.reschedule_url as string;
        // Redireciona para a URL de reagendamento (mesmo domínio)
        const urlObj = new URL(rescheduleUrl);
        navigate(urlObj.pathname + urlObj.search);
        return;
      }

      setResultData({
        message:        (data.message as string) ?? "Ação realizada com sucesso.",
        reschedule_url: (data.reschedule_url as string) ?? "",
      });
      setPhase("success");
    } catch {
      setErrorMsg("Erro de conexão. Verifique sua internet e tente novamente.");
      setPhase("error");
    }
  };

  const cfg = apptData ? ACTION_CONFIG[apptData.action_type] : null;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // ── Erro ─────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Link inválido</h1>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          {slug && (
            <Button variant="outline" onClick={() => navigate(`/booking/${slug}`)}>
              Fazer novo agendamento
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Processando ──────────────────────────────────────────────────────────
  if (phase === "processing") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Processando...</p>
        </div>
      </div>
    );
  }

  // ── Sucesso ──────────────────────────────────────────────────────────────
  if (phase === "success" && apptData && resultData) {
    const isCancel = apptData.action_type === "cancel";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-5">
          <div className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto border ${
            isCancel
              ? "bg-red-500/10 border-red-500/20"
              : "bg-emerald-500/10 border-emerald-500/20"
          }`}>
            {isCancel
              ? <XCircle className="h-8 w-8 text-red-500" />
              : <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            }
          </div>

          <div>
            <h1 className="text-lg font-bold text-foreground">
              {isCancel ? "Agendamento cancelado" : "Presença confirmada!"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{resultData.message}</p>
          </div>

          {/* Card de resumo */}
          {!isCancel && (
            <div className="bg-muted/30 rounded-xl border border-border p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Scissors className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">{apptData.service_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span>{apptData.date_formatted}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>{apptData.time_formatted}</span>
              </div>
              {apptData.professional_name && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4 shrink-0" />
                  <span>{apptData.professional_name}</span>
                </div>
              )}
            </div>
          )}

          {/* Botão de reagendar após cancelamento */}
          {isCancel && slug && (
            <Button
              className="w-full gap-2"
              onClick={() => navigate(`/booking/${slug}`)}
            >
              Fazer novo agendamento <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Tela de confirmação da ação ──────────────────────────────────────────
  if (phase === "confirm_screen" && apptData && cfg) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header mínimo */}
        <header className="border-b border-border/40 px-4 py-4">
          <p className="text-sm font-semibold text-foreground text-center">
            {cfg.icon} {cfg.label}
          </p>
        </header>

        <main className="max-w-md mx-auto px-4 py-8 space-y-6">
          {/* Descrição da ação */}
          <div className="text-center space-y-1">
            <p className="text-sm text-muted-foreground">{cfg.description}</p>
          </div>

          {/* Card do agendamento */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Seu agendamento
            </p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <Scissors className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{apptData.service_name}</p>
                  {apptData.professional_name && (
                    <p className="text-xs text-muted-foreground">com {apptData.professional_name}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm text-foreground capitalize">{apptData.date_formatted}</p>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm text-foreground">{apptData.time_formatted}</p>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm text-foreground">{apptData.customer_name}</p>
              </div>
            </div>
          </div>

          {/* Aviso para cancelar/reagendar */}
          {(apptData.action_type === "cancel" || apptData.action_type === "reschedule") && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                {apptData.action_type === "cancel"
                  ? "Esta ação é irreversível. O horário será liberado para outros clientes."
                  : "O horário atual será cancelado. Você receberá um link para escolher um novo horário."
                }
              </p>
            </div>
          )}

          {/* Botão de ação principal */}
          <Button
            className="w-full py-6 text-base font-semibold gap-2"
            style={{ backgroundColor: cfg.btnColor, color: "#fff" }}
            onClick={handleAction}
          >
            {cfg.icon} {cfg.btnLabel}
          </Button>

          {/* Link de volta */}
          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/booking/${slug}`)}
          >
            Voltar à página de agendamento
          </button>
        </main>
      </div>
    );
  }

  return null;
}
