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
  ChevronDown,
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
  TrendingUp,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useModulePermission } from "@/hooks/usePermissions";
import { useOrganization, useOrganizationData } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { usePendingAuthorizations } from "@/hooks/usePendingAuthorizations";

const navItems: (
  | { type: "collapsible"; label: string; icon: typeof LayoutDashboard; children: Array<{ title: string; url: string; icon: typeof LayoutDashboard; module: string | null }> }
  | { type: "item"; title: string; url: string; icon: typeof LayoutDashboard; module: string | null }
)[] = [
  { type: "item", title: "Dashboard", url: "/", icon: LayoutDashboard, module: "dashboard" },
  { 
    type: "collapsible", 
    label: "Comercial", 
    icon: TrendingUp, 
    children: [
      { title: "Desempenho", url: "/comercial/dashboard", icon: TrendingUp, module: "comercial" },
      { title: "CRM", url: "/kanban", icon: Kanban, module: "kanban" },
      { title: "Clientes", url: "/clients", icon: UserCheck, module: "clients" },
      { title: "Propostas", url: "/comercial/propostas", icon: FileText, module: "comercial" },
    ] 
  },
  { type: "item", title: "C8 Control", url: "/c8control", icon: Package, module: "c8control" },
  { type: "item", title: "Fornecedores", url: "/suppliers", icon: Truck, module: "clients" },
  { type: "item", title: "Financeiro", url: "/financial", icon: DollarSign, module: "financial" },
  { type: "item", title: "Agenda", url: "/agenda", icon: Calendar, module: "agenda" },
  { type: "item", title: "Projetos", url: "/projects", icon: FolderKanban, module: "projects" },
  { type: "item", title: "Metas", url: "/goals", icon: Target, module: "goals" },
  { type: "item", title: "Conversas", url: "/whatsapp", icon: MessageCircle, module: "whatsapp" },
  // { type: "item", title: "Reuniões IA", url: "/meetings", icon: Sparkles, module: "meetings" }, // módulo desativado
  { type: "item", title: "Gestão de Pessoas", url: "/team", icon: UsersRound, module: "team" },
  { type: "item", title: "Campanhas", url: "/campaign-reports", icon: Megaphone, module: "campaigns" },
  { type: "item", title: "Relatórios", url: "/reports", icon: FileBarChart, module: "reports" },
  { type: "item", title: "Auditoria", url: "/audit", icon: History, module: "audit" },
  { type: "item", title: "Meu Perfil", url: "/team/me", icon: CircleUserRound, module: null },
  { type: "item", title: "Configurações", url: "/settings", icon: Settings, module: "settings" },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [comercialExpanded, setComercialExpanded] = useState(true);
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
  const { canView: canViewComercial } = useModulePermission("comercial");

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
    comercial: canViewComercial,
  };

  const visibleItems = navItems.filter((item) => {
    if (item.type === "collapsible") return true;
    
    if (item.url === "/team/360") return isAdminOrOwner && canViewTeam;
    if (item.module === "settings") return canViewSettings;
    if (item.url === "/team") return canViewTeam;
    return !item.module || canViewByModule[item.module];
  });

  return (
    <aside
      className={cn(
        "gradient-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300 shrink-0 shadow-md",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
        {orgData?.logo_url ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sidebar-border bg-sidebar-accent shadow-sm">
            <img src={orgData.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
          </div>
        ) : (
          <div className="gradient-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-lg shadow-primary/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
        )}
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-display text-base font-bold text-sidebar-foreground tracking-tight">
              {orgData?.name || "Maestr.IA"}
            </span>
            <span className="text-[11px] text-sidebar-foreground/70 font-medium">Gestão inteligente</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-0.5 sidebar-scroll">
        {visibleItems.map((item, index) => {
          if (item.type === "collapsible") {
            const isActive = item.children.some(child => location.pathname.startsWith(child.url));
            return (
              <div key={item.label} className="mb-1">
                <button
                  onClick={() => setComercialExpanded(!comercialExpanded)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 group relative overflow-hidden",
                    "text-sidebar-foreground/80 hover:text-sidebar-foreground",
                    "hover:bg-sidebar-accent",
                    collapsed && "justify-center px-3",
                    isActive && "bg-sidebar-accent text-white"
                  )}
                >
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sidebar-primary rounded-r-full" />}
                  <item.icon className={cn("h-5 w-5 shrink-0 transition-colors", isActive && "text-white")} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        className={cn("h-4 w-4 transition-all duration-300 text-sidebar-foreground/50 group-hover:text-sidebar-foreground", comercialExpanded && "rotate-180")}
                      />
                    </>
                  )}
                </button>
                <div 
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-out",
                    !collapsed && comercialExpanded ? "max-h-96 opacity-100 mt-1.5" : "max-h-0 opacity-0 mt-0"
                  )}
                >
                  <div className="space-y-0.5 pl-1 border-l-2 border-sidebar-primary/40 ml-3">
                    {item.children.map(child => {
                      const canView = !child.module || canViewByModule[child.module];
                      if (!canView) return null;
                      const isChildActive = location.pathname === child.url;
                      return (
                        <NavLink
                          key={child.url}
                          to={child.url}
                          end
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 relative overflow-hidden",
                            "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                            "hover:bg-sidebar-accent/50",
                            isChildActive && "bg-sidebar-accent text-white font-semibold"
                          )}
                          activeClassName="bg-sidebar-accent text-white font-semibold"
                        >
                          {isChildActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-sidebar-primary rounded-r-full -ml-2" />}
                          <child.icon className={cn("h-4 w-4 shrink-0", isChildActive && "text-white")} />
                          <span className="truncate">{child.title}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }
          
          const isItemActive = location.pathname === item.url || (item.url !== "/" && location.pathname.startsWith(item.url));
          return (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 group relative overflow-hidden mb-1",
                "text-sidebar-foreground/80 hover:text-sidebar-foreground",
                "hover:bg-sidebar-accent",
                collapsed && "justify-center px-3",
                isItemActive && "bg-sidebar-accent text-white"
              )}
              activeClassName="bg-sidebar-accent text-white"
            >
              {isItemActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sidebar-primary rounded-r-full" />}
              <item.icon className={cn("h-5 w-5 shrink-0 transition-colors", isItemActive && "text-white")} />
              {!collapsed && <span className="truncate">{item.title}</span>}
              {!collapsed && item.url === "/authorizations" && pending.length > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-[11px] font-bold rounded-full px-2 py-0.5 shadow-sm">
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
        className="flex h-14 items-center justify-center border-t border-sidebar-border text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200"
      >
        {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
      </button>
    </aside>
  );
}
