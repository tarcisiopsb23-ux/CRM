import { useModulePermission, type PermissionModule } from "@/hooks/usePermissions";

// Módulos "reais" que indicam que o usuário tem acesso ao sistema além do ponto/agenda
const WORK_MODULES: PermissionModule[] = [
  "dashboard",
  "kanban",
  "crm",
  "clients",
  "financial",
  "projects",
  "goals",
  "whatsapp",
  "meetings",
  "team",
  "reports",
  "campaigns",
  "audit",
  "sales_analytics",
  "performance",
  "integrations",
];

/**
 * Retorna o destino de navegação após um registro de ponto bem-sucedido.
 * Se o usuário não tiver acesso a nenhum módulo de trabalho, redireciona
 * para /team/me (Meu Perfil). Caso contrário, vai para /.
 */
export function usePostPunchRedirect(): string {
  // Checa cada módulo — se qualquer um tiver canView: true, o usuário tem acesso ao sistema
  const dashboard = useModulePermission("dashboard").canView;
  const kanban = useModulePermission("kanban").canView;
  const clients = useModulePermission("clients").canView;
  const financial = useModulePermission("financial").canView;
  const projects = useModulePermission("projects").canView;
  const goals = useModulePermission("goals").canView;
  const whatsapp = useModulePermission("whatsapp").canView;
  const meetings = useModulePermission("meetings").canView;
  const team = useModulePermission("team").canView;
  const reports = useModulePermission("reports").canView;
  const campaigns = useModulePermission("campaigns").canView;
  const audit = useModulePermission("audit").canView;
  const salesAnalytics = useModulePermission("sales_analytics").canView;
  const performance = useModulePermission("performance").canView;
  const integrations = useModulePermission("integrations").canView;

  const hasAnyAccess =
    dashboard || kanban || clients || financial || projects ||
    goals || whatsapp || meetings || team || reports ||
    campaigns || audit || salesAnalytics || performance || integrations;

  return hasAnyAccess ? "/" : "/team/me";
}
