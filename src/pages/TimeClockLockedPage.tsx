import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Lock, LogOut } from "lucide-react";

export function TimeClockLockedPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Acesso bloqueado • Ponto";
  }, []);

  const handleExit = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

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
          <p className="text-sm text-muted-foreground">
            Sua saída final já foi registrada. O acesso ao sistema está encerrado para hoje.
          </p>
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
