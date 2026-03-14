import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function TimeClockLockedPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Acesso bloqueado • Ponto";
  }, []);

  const handleExit = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-xl w-full">
        <CardHeader>
          <h1 className="font-display text-2xl font-bold text-foreground">Acesso bloqueado</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sua saída final já foi registrada. O uso do sistema está encerrado.
          </p>
        </CardHeader>
        <CardContent className="flex items-center justify-end gap-2">
          <Button onClick={handleExit}>Sair do sistema</Button>
        </CardContent>
      </Card>
    </div>
  );
}

