import { useLocation, Outlet } from "react-router-dom";
import { getModuleForRoute, useModulePermission } from "@/hooks/usePermissions";

/** Envolve o Outlet e bloqueia acesso se o usuário não tiver can_view no módulo da rota atual. */
export function ModuleGuard() {
  const location = useLocation();
  const module = getModuleForRoute(location.pathname);
  const { canView } = useModulePermission(module);

  if (module && !canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <h2 className="text-xl font-semibold text-foreground">Acesso negado</h2>
        <p className="text-muted-foreground">
          Você não tem permissão para acessar este módulo.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
