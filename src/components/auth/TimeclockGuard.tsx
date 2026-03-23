import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTimeClockState } from "@/hooks/useTimeClock";
import { usePermissionForScope } from "@/hooks/usePermissions";

/**
 * Bloqueia acesso ao sistema para usuarios que:
 * 1. Ainda nao registraram entrada → /timeclock/punch
 * 2. Ja registraram saida final E ainda nao passaram 12h → /timeclock/locked
 * Usuarios com permissao "team/timeclock" sao isentos — nunca bloqueados.
 *
 * Quando can_entry = true (12h já passaram), libera para /timeclock/punch.
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
    const isOnPunchPage  = path === "/timeclock/punch";
    const isOnLockedPage = path === "/timeclock/locked";

    // Saída final registrada
    if (clockState.has_final_exit) {
      // 12h já passaram (can_entry = true) → libera para nova entrada
      if (clockState.can_entry) {
        if (!isOnPunchPage) {
          navigate("/timeclock/punch", { replace: true });
        }
        return;
      }
      // Ainda dentro das 12h → mantém na tela bloqueada
      if (!isOnLockedPage) {
        navigate("/timeclock/locked", { replace: true });
      }
      return;
    }

    // Sem entrada hoje → tela de registro de ponto
    if (!clockState.has_entry && !isOnPunchPage) {
      navigate("/timeclock/punch", { replace: true });
    }
  }, [clockState, isLoading, permLoading, isExempt, navigate, location.pathname]);

  return <>{children}</>;
}
