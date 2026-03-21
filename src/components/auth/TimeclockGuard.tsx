import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeClockState } from "@/hooks/useTimeClock";

/**
 * Bloqueia acesso ao sistema para usuarios que:
 * 1. Ainda nao registraram entrada → /timeclock/entry
 * 2. Ja registraram saida final → /timeclock/locked
 * Admin e owner sao isentos — nunca bloqueados.
 */
export function TimeclockGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { data: clockState, isLoading } = useTimeClockState();

  const isExempt = profile?.role === "owner" || profile?.role === "admin";

  useEffect(() => {
    if (isExempt) return;
    if (isLoading) return;
    if (!clockState) return;

    const path = location.pathname;
    const isOnEntryPage  = path === "/timeclock/entry";
    const isOnLockedPage = path === "/timeclock/locked";

    // Sem entrada → tela de registro
    if (!clockState.has_entry && !isOnEntryPage) {
      navigate("/timeclock/entry", { replace: true });
      return;
    }

    // Saida final registrada → tela bloqueada
    if (clockState.has_final_exit && !isOnLockedPage && !isOnEntryPage) {
      navigate("/timeclock/locked", { replace: true });
    }
  }, [clockState, isLoading, isExempt, navigate, location.pathname]);

  return <>{children}</>;
}
