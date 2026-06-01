import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  MessageCircle,
  Tag,
  UtensilsCrossed,
  CalendarDays,
  Megaphone,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useClientAuth } from "@/hooks/useClientAuth";

const RESULTADOS_NAV = [
  { title: "Dashboard Geral", url: "",            icon: LayoutDashboard },
  { title: "Performance",     url: "performance", icon: BarChart3 },
  { title: "Atendimento",     url: "atendimento", icon: MessageCircle },
];

const IA_NAV = [
  { title: "Agenda",               url: "agenda",        icon: CalendarDays },
  { title: "Promoções",            url: "promocoes",     icon: Tag },
  { title: "Sugestões da Semana",  url: "sugestoes",     icon: UtensilsCrossed },
  { title: "Avisos",               url: "avisos",        icon: Megaphone },
  { title: "Configurações",        url: "configuracoes", icon: Settings },
];

export function PublicDashboardSidebar() {
  const { auth, slug } = useClientAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (url: string) => {
    const full = `/public/dashboard/${slug}${url ? `/${url}` : ""}`;
    return location.pathname === full;
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          {/* Logo C8 fixa */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-700 overflow-hidden">
            <img
              src="/icon.png"
              alt="C8 Logo"
              className="h-7 w-7 object-contain"
            />
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold leading-tight text-sidebar-foreground truncate">
                {auth?.company || auth?.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">Dashboard</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Grupo Resultados */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Resultados</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {RESULTADOS_NAV.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={`/public/dashboard/${slug}${item.url ? `/${item.url}` : ""}`} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Grupo Conteúdo IA — condicional */}
        {auth?.show_ia_content === true && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Conteúdo IA</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {IA_NAV.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={`/public/dashboard/${slug}/${item.url}`} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed ? (
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="text-xs text-muted-foreground truncate">{auth?.name}</span>
          </div>
        ) : (
          <div className="flex justify-center py-2">
            <span className="h-2 w-2 rounded-full bg-success" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
