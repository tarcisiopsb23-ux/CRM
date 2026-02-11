import { 
  LayoutDashboard, Users, Kanban, UserCheck, Package, 
  DollarSign, Calendar, FolderKanban, Target, MessageCircle, 
  Settings, ChevronLeft, ChevronRight, Sparkles, UsersRound, Megaphone, FileBarChart
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Kanban", url: "/kanban", icon: Kanban },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Clientes", url: "/clients", icon: UserCheck },
  { title: "Fornecedores", url: "/suppliers", icon: Package },
  { title: "Financeiro", url: "/financial", icon: DollarSign },
  { title: "Agenda", url: "/agenda", icon: Calendar },
  { title: "Projetos", url: "/projects", icon: FolderKanban },
  { title: "Metas", url: "/goals", icon: Target },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
  { title: "Reuniões IA", url: "/meetings", icon: Sparkles },
  { title: "Equipe", url: "/team", icon: UsersRound },
  { title: "Campanhas", url: "/campaign-reports", icon: Megaphone },
  { title: "Relatórios", url: "/general-reports", icon: FileBarChart },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={cn(
        "gradient-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-sidebar-border">
        <div className="gradient-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-display text-lg font-bold text-sidebar-primary-foreground tracking-tight">
            Maestr.IA
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => {
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
