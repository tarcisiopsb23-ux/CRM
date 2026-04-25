import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRegisterPunch, useTimeClockState, type RepPPunchType } from "@/hooks/useTimeClock";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { usePostPunchRedirect } from "@/hooks/usePostPunchRedirect";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PinAuthDialog } from "@/components/shared/PinAuthDialog";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { LogOut } from "lucide-react";

const LABEL_BY_TYPE: Record<RepPPunchType, string> = {
  entrada: "Entrada",
  saida_intervalo: "Saída para intervalo",
  retorno_intervalo: "Retorno do intervalo",
  saida_final: "Saída final",
};

export function TimeClockPunchPage() {
  const { profile, signOut } = useAuth();
  const state = useTimeClockState();
  const register = useRegisterPunch();
  const navigate = useNavigate();
  const location = useLocation();
  const { canView: isTimeclockExempt } = usePermissionForScope("team", "timeclock");
  const postPunchRedirect = usePostPunchRedirect();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<RepPPunchType>("entrada");
  const [lateBreakAck, setLateBreakAck] = useState(false);

  const data = state.data;
  const todayLabel = format(data?.today_date ? new Date(data.today_date) : new Date(), "dd/MM/yyyy");
  const shouldForceEntry = !!data && !data.exempt && !data.has_entry && !data.has_final_exit;
  const allowedButtons = (() => {
    if (!data) return [] as RepPPunchType[];
    if (data.has_final_exit) return [] as RepPPunchType[];
    if (shouldForceEntry) return ["entrada"] as RepPPunchType[];
    return data.next_allowed ?? [];
  })();

  const openPunch = (type: RepPPunchType) => {
    const nextAllowed = data?.next_allowed ?? [];
    if (!nextAllowed.includes(type)) {
      toast.error(`Marcação "${LABEL_BY_TYPE[type]}" não permitida no momento.`);
      return;
    }

    // Valida restrições de tempo usando flags calculadas no banco (sem problema de fuso)
    if (type === "entrada" && data?.can_entry === false) {
      const at = data.entry_allowed_at ?? "?";
      const from = data.last_final_display ?? "?";
      toast.error(`Entrada autorizada a partir das ${at} — intervalo mínimo de 12h desde a última saída (saída às ${from})`);
      return;
    }

    if (type === "saida_intervalo" && data?.can_break === false) {
      const at = data.break_allowed_at ?? "?";
      const from = data.entry_time_display ?? "?";
      toast.error(`Saída para intervalo autorizada a partir das ${at} (entrada às ${from})`);
      return;
    }

    if (type === "retorno_intervalo" && data?.can_return === false) {
      const at = data.return_allowed_at ?? "?";
      const from = data.break_time_display ?? "?";
      toast.error(`Retorno autorizado a partir das ${at} (saída às ${from})`);
      return;
    }

    if (type === "saida_final" && data?.can_final === false) {
      const at = data.final_allowed_at ?? "?";
      const from = data.entry_time_display ?? "?";
      toast.error(`Saída final autorizada a partir das ${at} — prazo de 8h48 (entrada às ${from})`);
      return;
    }

    // Bloqueia entrada em dia especial sem autorização
    if (type === "entrada" && data?.special_day && !data?.has_special_day_auth) {
      const labels: Record<string, string> = { sabado: "sábado", domingo: "domingo", feriado: "feriado" };
      toast.error(`Hoje é ${labels[data.special_day] ?? data.special_day}. Solicite autorização de admin/owner para registrar ponto.`);
      return;
    }

    setSelectedType(type);
    setLateBreakAck(false);
    setDialogOpen(true);
  };

  const handlePinConfirm = async () => {
    try {
      await register.mutateAsync({ type: selectedType, ackLateBreak: lateBreakAck });
      setDialogOpen(false);
      setLateBreakAck(false);
      toast.success(`Marcação registrada: ${LABEL_BY_TYPE[selectedType]}`);

      if (selectedType === "saida_final") {
        navigate("/timeclock/locked", { replace: true });
        return;
      }
      navigate(postPunchRedirect, { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao registrar ponto";
      if (message.toLowerCase().includes("6h30") || message.toLowerCase().includes("confirma")) {
        setLateBreakAck(true);
      }
      throw err;
    }
  };

  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (state.data?.has_final_exit) {
    return <Navigate to="/timeclock/locked" replace />;
  }

  const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] space-y-6 max-w-3xl mx-auto px-4">
      <div className="text-center w-full">
        <h1 className="font-display text-3xl font-bold text-foreground">Registro de Ponto</h1>
        <p className="text-muted-foreground mt-2">
          {profile?.full_name ?? "Usuário"} • {todayLabel}
        </p>
        {shouldForceEntry && (
          <div className="mt-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg text-orange-600 dark:text-orange-400">
            <p className="text-sm font-medium">Atenção</p>
            <p className="text-xs mt-1">
              Você ainda não registrou sua entrada hoje. O acesso ao sistema está bloqueado até que o ponto seja registrado.
            </p>
          </div>
        )}
        {data?.special_day && !data?.has_special_day_auth && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400">
            <p className="text-sm font-medium">
              {data.special_day === "sabado" && "Hoje é sábado"}
              {data.special_day === "domingo" && "Hoje é domingo"}
              {data.special_day === "feriado" && "Hoje é feriado"}
            </p>
            <p className="text-xs mt-1">
              Registro de ponto em dias especiais requer autorização de admin/owner.
            </p>
          </div>
        )}
      </div>

      {!isTimeclockExempt && (state.data?.alerts ?? []).map((a) => (
        <Alert key={a} className="w-full">
          <AlertTitle>Aviso</AlertTitle>
          <AlertDescription>{a}</AlertDescription>
        </Alert>
      ))}

      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Ações disponíveis</p>
              <p className="text-xs text-muted-foreground">
                {shouldForceEntry ? "Registre sua entrada para liberar o acesso" : "Siga o fluxo padrão do dia"}
              </p>
            </div>
            {!shouldForceEntry && (
              <Button variant="outline" onClick={() => navigate(postPunchRedirect, { replace: true })}>
                Ir para o sistema
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            {allowedButtons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ação disponível no momento.</p>
            ) : (
              allowedButtons.map((t) => (
                <Button key={t} size="lg" className="flex-1 sm:flex-none" onClick={() => openPunch(t)}>
                  {LABEL_BY_TYPE[t]}
                </Button>
              ))
            )}
          </div>

          <div className="border-t pt-4 mt-2">
            <Button 
              variant="ghost" 
              className="w-full text-muted-foreground hover:text-destructive"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair do sistema
            </Button>
          </div>
        </CardContent>
      </Card>

      <PinAuthDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Confirmar marcação"
        description={`${LABEL_BY_TYPE[selectedType]} — digite seu PIN de 8 dígitos para registrar.`}
        onConfirm={handlePinConfirm}
        loading={register.isPending}
      />
    </div>
  );
}
