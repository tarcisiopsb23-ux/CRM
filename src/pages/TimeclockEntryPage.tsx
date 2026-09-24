import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { useTimeClockState, useRegisterPunch } from "@/hooks/useTimeClock";
import { usePostPunchRedirect } from "@/hooks/usePostPunchRedirect";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn, LogOut, Clock } from "lucide-react";
import { toast } from "sonner";

const PUNCH_LABELS: Record<string, string> = {
  entrada: "Registrar Entrada",
  saida_intervalo: "Saída para Intervalo",
  retorno_intervalo: "Retorno do Intervalo",
  saida_final: "Registrar Saída",
};

/**
 * Tela intermediária exibida após o login quando o colaborador
 * ainda não registrou a entrada do dia.
 * Admin e owner são isentos e nunca chegam aqui.
 */
export function TimeclockEntryPage() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const { data: clockState, isLoading: clockLoading } = useTimeClockState();
  const registerPunch = useRegisterPunch();

  const { canView: isExempt } = usePermissionForScope("team", "timeclock");
  const postPunchRedirect = usePostPunchRedirect();

  // Se isento ou já tem entrada, vai direto para o destino correto
  useEffect(() => {
    if (authLoading || clockLoading) return;
    if (isExempt) { navigate(postPunchRedirect, { replace: true }); return; }
    if (clockState?.has_entry) { navigate(postPunchRedirect, { replace: true }); return; }
  }, [authLoading, clockLoading, isExempt, clockState, navigate, postPunchRedirect]);

  const nextAllowed = clockState?.next_allowed ?? [];
  const nextType = nextAllowed[0] ?? null;

  const handlePunch = async () => {
    if (!nextType) return;
    try {
      await registerPunch.mutateAsync({ type: nextType });
      toast.success("Entrada registrada! Bem-vindo.");
      navigate(postPunchRedirect, { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar ponto");
    }
  };

  if (authLoading || clockLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / ícone */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Clock className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Registro de Ponto</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Olá, <span className="font-medium text-foreground">{profile?.full_name}</span>
            </p>
          </div>
        </div>

        {/* Card de ação */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          {/* Aviso de dia especial */}
          {clockState?.special_day && !clockState?.has_special_day_auth && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <p className="font-medium">
                {clockState.special_day === "sabado" && "Hoje é sábado"}
                {clockState.special_day === "domingo" && "Hoje é domingo"}
                {clockState.special_day === "feriado" && "Hoje é feriado"}
              </p>
              <p className="mt-1 text-xs">
                Registro de ponto requer autorização de admin/owner.
              </p>
            </div>
          )}
          {nextType ? (
            <>
              <p className="text-sm text-center text-muted-foreground">
                Para acessar o sistema, registre sua entrada no ponto.
              </p>
              <Button
                className="w-full h-12 text-base gap-2"
                onClick={handlePunch}
                disabled={registerPunch.isPending}
              >
                {registerPunch.isPending
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <LogIn className="h-5 w-5" />}
                {registerPunch.isPending ? "Registrando..." : (PUNCH_LABELS[nextType] ?? "Registrar")}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-center text-muted-foreground">
                Nenhuma batida disponível no momento. Entre em contato com o administrador.
              </p>
              <Button variant="outline" className="w-full" onClick={() => navigate("/", { replace: true })}>
                <LogOut className="h-4 w-4 mr-2" /> Continuar mesmo assim
              </Button>
            </>
          )}
        </div>

        {/* Alertas do sistema de ponto */}
        {!isExempt && (clockState?.alerts ?? []).length > 0 && (
          <div className="space-y-2">
            {clockState!.alerts.map((alert, i) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {alert}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
