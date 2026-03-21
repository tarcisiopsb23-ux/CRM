import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeClockState } from "@/hooks/useTimeClock";
import { Button } from "@/components/ui/button";
import { Lock, LogOut } from "lucide-react";
import { format, addHours, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function TimeClockLockedPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  // refetchInterval já está em 30s no hook — suficiente para detectar liberação
  const { data: clockState } = useTimeClockState();

  useEffect(() => {
    document.title = "Acesso bloqueado • Ponto";
  }, []);

  // Quando can_entry virar true (12h passaram), redireciona para registrar nova entrada
  useEffect(() => {
    if (clockState?.has_final_exit && clockState?.can_entry) {
      navigate("/timeclock/punch", { replace: true });
    }
  }, [clockState, navigate]);

  const handleExit = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  // Horário de liberação: last_punch_at da saída final + 12h
  // Preferimos usar entry_allowed_at do banco quando disponível (já formatado e no fuso correto)
  const releaseInfo = (() => {
    // entry_allowed_at já vem formatado do banco (ex: "08:30h")
    if (clockState?.entry_allowed_at) {
      // Precisamos também da data — calcular a partir de last_punch_at
      const lastFinalAt = clockState.last_punch_type === "saida_final"
        ? clockState.last_punch_at
        : null;
      if (lastFinalAt) {
        try {
          const releaseDate = addHours(parseISO(lastFinalAt), 12);
          return {
            time: clockState.entry_allowed_at,
            date: format(releaseDate, "dd/MM/yyyy", { locale: ptBR }),
          };
        } catch { /* fallback abaixo */ }
      }
    }

    // Fallback: calcular no frontend
    const lastFinalAt = clockState?.last_punch_type === "saida_final"
      ? clockState.last_punch_at
      : null;
    if (!lastFinalAt) return null;
    try {
      const releaseDate = addHours(parseISO(lastFinalAt), 12);
      return {
        time: format(releaseDate, "HH:mm'h'", { locale: ptBR }),
        date: format(releaseDate, "dd/MM/yyyy", { locale: ptBR }),
      };
    } catch {
      return null;
    }
  })();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Jornada encerrada</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Olá, <span className="font-medium text-foreground">{profile?.full_name}</span>
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
          {releaseInfo ? (
            <p className="text-sm text-muted-foreground">
              Sua saída final já foi registrada. O acesso ao sistema será liberado a partir das{" "}
              <span className="font-semibold text-foreground">{releaseInfo.time}</span>{" "}
              do dia{" "}
              <span className="font-semibold text-foreground">{releaseInfo.date}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sua saída final já foi registrada. O acesso ao sistema está encerrado para hoje.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Se precisar continuar trabalhando, solicite autorização a um administrador.
          </p>
          <Button variant="destructive" className="w-full gap-2" onClick={handleExit}>
            <LogOut className="h-4 w-4" /> Sair do sistema
          </Button>
        </div>
      </div>
    </div>
  );
}
