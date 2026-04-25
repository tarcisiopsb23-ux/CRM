import {
  LayoutDashboard,
  Kanban,
  UserCheck,
  DollarSign,
  Calendar,
  FolderKanban,
  Target,
  MessageCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  UsersRound,
  Megaphone,
  FileBarChart,
  BarChart3,
  History,
  Share2,
  CircleUserRound,
  Package,
  Truck,
  FileText,
  ShieldCheck,
  BriefcaseBusiness,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useModulePermission } from "@/hooks/usePermissions";
import { useOrganization, useOrganizationData } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { usePendingAuthorizations } from "@/hooks/usePendingAuthorizations";

const navItems: {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  module: string | null;
}[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, module: "dashboard" },
  { title: "CRM", url: "/kanban", icon: Kanban, module: "kanban" },
  { title: "Analytics Vendas", url: "/sales-analytics", icon: BarChart3, module: "sales_analytics" },
  { title: "Clientes", url: "/clients", icon: UserCheck, module: "clients" },
  { title: "C8 Control", url: "/c8control", icon: Package, module: "c8control" },
  { title: "Fornecedores", url: "/suppliers", icon: Truck, module: "clients" },
  { title: "Financeiro", url: "/financial", icon: DollarSign, module: "financial" },
  { title: "Fiscal / NFS-e", url: "/fiscal", icon: FileText, module: "fiscal" },
  { title: "Agenda", url: "/agenda", icon: Calendar, module: "agenda" },
  { title: "Projetos", url: "/projects", icon: FolderKanban, module: "projects" },
  { title: "Metas", url: "/goals", icon: Target, module: "goals" },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle, module: "whatsapp" },
  { title: "Reuniões IA", url: "/meetings", icon: Sparkles, module: "meetings" },
  { title: "Gestão de Pessoas", url: "/team", icon: UsersRound, module: "team" },
  { title: "Recrutamento", url: "/recruitment", icon: BriefcaseBusiness, module: "recruitment" },
  { title: "Campanhas", url: "/campaign-reports", icon: Megaphone, module: "campaigns" },
  { title: "Relatórios", url: "/reports", icon: FileBarChart, module: "reports" },
  { title: "Auditoria", url: "/audit", icon: History, module: "audit" },
  { title: "Meu Perfil", url: "/team/me", icon: CircleUserRound, module: null },
  { title: "Configurações", url: "/settings", icon: Settings, module: "settings" },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const orgId = useOrganization();
  const { data: orgData } = useOrganizationData(orgId);
  const { profile } = useAuth();
  const { pending } = usePendingAuthorizations();
  const isAdminOrOwner = profile?.role === "admin" || profile?.role === "owner";

  const { canView: canViewDashboard } = useModulePermission("dashboard");
  const { canView: canViewKanban } = useModulePermission("kanban");
  const { canView: canViewSalesAnalytics } = useModulePermission("sales_analytics");
  const { canView: canViewClients } = useModulePermission("clients");
  const { canView: canViewFinancial } = useModulePermission("financial");
  const { canView: canViewAgenda } = useModulePermission("agenda");
  const { canView: canViewProjects } = useModulePermission("projects");
  const { canView: canViewGoals } = useModulePermission("goals");
  const { canView: canViewWhatsApp } = useModulePermission("whatsapp");
  const { canView: canViewMeetings } = useModulePermission("meetings");
  const { canView: canViewTeam } = useModulePermission("team");
  const { canView: canViewSettings } = useModulePermission("settings");
  const { canView: canViewReports } = useModulePermission("reports");
  const { canView: canViewCampaigns } = useModulePermission("campaigns");
  const { canView: canViewAudit } = useModulePermission("audit");
  const { canView: canViewIntegrations } = useModulePermission("integrations");
  const { canView: canViewC8Control } = useModulePermission("c8control" as any);
  const { canView: canViewFiscal } = useModulePermission("fiscal" as any);
  const { canView: canViewRecruitment } = useModulePermission("recruitment" as any);

  const canViewByModule: Record<string, boolean> = {
    dashboard: canViewDashboard,
    kanban: canViewKanban,
    sales_analytics: canViewSalesAnalytics,
    clients: canViewClients,
    financial: canViewFinancial,
    agenda: canViewAgenda,
    projects: canViewProjects,
    goals: canViewGoals,
    whatsapp: canViewWhatsApp,
    meetings: canViewMeetings,
    team: canViewTeam,
    settings: canViewSettings,
    reports: canViewReports,
    campaigns: canViewCampaigns,
    audit: canViewAudit,
    integrations: canViewIntegrations,
    c8control: canViewC8Control,
    fiscal: canViewFiscal,
    recruitment: canViewRecruitment,
  };

  const visibleItems = navItems.filter((item) => {
    if (item.url === "/team/360") return isAdminOrOwner && canViewTeam;
    if (item.module === "settings") return canViewSettings;
    if (item.url === "/team") return canViewTeam;
    return !item.module || canViewByModule[item.module];
  });

  return (
    <aside
      className={cn(
        "gradient-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-sidebar-border">
        {orgData?.logo_url ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
            <img src={orgData.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
          </div>
        ) : (
          <div className="gradient-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
        {!collapsed && (
          <span className="font-display text-lg font-bold text-sidebar-primary-foreground tracking-tight truncate">
            {orgData?.name || "Maestr.IA"}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.url;
          return (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
              activeClassName="bg-sidebar-accent text-sidebar-primary-foreground"
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
              {!collapsed && item.url === "/authorizations" && pending.length > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {pending.length}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex h-12 items-center justify-center border-t border-sidebar-border text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
