import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeClockState } from "@/hooks/useTimeClock";
import { Button } from "@/components/ui/button";

const ALLOWED_PATHS = new Set<string>(["/timeclock/punch", "/timeclock/locked"]);

function isExemptFallback(profile: { role?: string; metadata?: Record<string, unknown> } | null) {
  if (!profile) return false;
  // Owner, admin e manager não têm restrição de acesso por falta de ponto
  if (profile.role === "owner" || profile.role === "admin" || profile.role === "manager") return true;
  const meta = profile.metadata ?? {};
  const raw = String((meta as Record<string, unknown>)["job_title"] ?? (meta as Record<string, unknown>)["cargo"] ?? "").toUpperCase();
  return ["CEO", "CFO", "COO", "CMO", "GERENTE", "GERENTES"].includes(raw);
}

export function TimeclockGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  const state = useTimeClockState();

  if (loading || !profile) return children;
  if (ALLOWED_PATHS.has(location.pathname)) return children;
  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Verificando registro de ponto...</p>
      </div>
    );
  }
  if (state.isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <p className="text-muted-foreground">Não foi possível verificar seu registro de ponto.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recarregar
        </Button>
      </div>
    );
  }

  const s = state.data;
  const exempt = (s?.exempt ?? false) || isExemptFallback(profile);

  if (s?.has_final_exit) {
    return <Navigate to="/timeclock/locked" replace />;
  }

  if (!exempt && s && !s.has_entry) {
    return <Navigate to="/timeclock/punch" state={{ from: location }} replace />;
  }

  return children;
}
