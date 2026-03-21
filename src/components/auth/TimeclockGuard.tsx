import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTimeClockState } from "@/hooks/useTimeClock";
import { usePermissionForScope } from "@/hooks/usePermissions";

/**
 * Bloqueia acesso ao sistema para usuarios que:
 * 1. Ainda nao registraram entrada → /timeclock/entry
 * 2. Ja registraram saida final → /timeclock/locked
 * Usuarios com permissao "team/timeclock" sao isentos — nunca bloqueados.
 */
export function TimeclockGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: clockState, isLoading } = useTimeClockState();

  const { canView: isExempt, isLoading: permLoading } = usePermissionForScope("team", "timeclock");

  useEffect(() => {
    if (isExempt) return;
    if (isLoading || permLoading) return;
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
  }, [clockState, isLoading, permLoading, isExempt, navigate, location.pathname]);

  return <>{children}</>;
}
