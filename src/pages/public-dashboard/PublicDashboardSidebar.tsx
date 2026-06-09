/**
 * PublicDashboardSidebar — Fase 1/2 (T-2.12)
 *
 * Novos grupos:
 * - CRM: Clientes, Pipeline, Produtos (condicional: modules_config.crm_enabled)
 * - WhatsApp (condicional: modules_config.whatsapp_enabled)
 * - Bot toggle no footer (condicional: show_ia_content)
 */

import { useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BarChart3, MessageCircle, Tag, UtensilsCrossed,
  CalendarDays, Megaphone, Settings, Users, GitMerge, Package,
  Wifi, WifiOff, Bot, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Nav definitions ──────────────────────────────────────────────────────────

const RESULTADOS_NAV = [
  { title: "Dashboard Geral", url: "",            icon: LayoutDashboard },
  { title: "Performance",     url: "performance", icon: BarChart3 },
  { title: "Atendimento",     url: "atendimento", icon: MessageCircle },
];

const CRM_NAV = [
  { title: "Clientes",  url: "crm/clientes",  icon: Users },
  { title: "Pipeline",  url: "crm/pipeline",  icon: GitMerge },
  { title: "Produtos",  url: "crm/produtos",  icon: Package },
];

const IA_NAV = [
  { title: "Agenda",              url: "agenda",        icon: CalendarDays },
  { title: "Promoções",           url: "promocoes",     icon: Tag },
  { title: "Sugestões da Semana", url: "sugestoes",     icon: UtensilsCrossed },
  { title: "Avisos",              url: "avisos",        icon: Megaphone },
  { title: "Configurações",       url: "configuracoes", icon: Settings },
];

// ─── Bot Toggle ───────────────────────────────────────────────────────────────

function BotToggle({ slug }: { slug: string }) {
  const dc = useDynamicClient();
  const [active, setActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Carrega estado atual
  useState(() => {
    if (!dc) return;
    dc.from("ai_settings")
      .select("bot_active")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setActive(data?.bot_active ?? true);
      });
  });

  const toggle = useCallback(async () => {
    if (!dc || loading || active === null) return;
    setLoading(true);
    const next = !active;
    try {
      // Atualiza no banco B
      const { data: existing } = await dc
        .from("ai_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await dc.from("ai_settings").update({ bot_active: next }).eq("id", existing.id);
      } else {
        await dc.from("ai_settings").insert({ bot_active: next });
      }

      setActive(next);
      toast.success(next ? "Bot ativado — atendimento automático" : "Bot offline — atendimento manual via Chatwoot");
    } catch {
      toast.error("Erro ao alterar estado do bot.");
    } finally {
      setLoading(false);
    }
  }, [dc, active, loading]);

  if (active === null) return null;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-semibold transition-colors",
        active
          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
          : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
      )}
      title={active ? "Bot ativo — clique para colocar offline" : "Bot offline — clique para ativar"}
    >
      <Bot className={cn("h-3.5 w-3.5 shrink-0", loading && "animate-pulse")} />
      <span className="truncate">{active ? "Bot Online" : "Bot Offline"}</span>
      {active ? <Wifi className="h-3 w-3 ml-auto shrink-0" /> : <WifiOff className="h-3 w-3 ml-auto shrink-0" />}
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function PublicDashboardSidebar() {
  const { auth, slug } = useClientAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const [crmOpen, setCrmOpen] = useState(true);

  const modules = auth?.modules_config;
  const crmEnabled = modules?.crm_enabled !== false; // default true se não configurado
  const waEnabled = modules?.whatsapp_enabled === true;

  const isActive = (url: string) => {
    const full = `/public/dashboard/${slug}${url ? `/${url}` : ""}`;
    if (url === "") return location.pathname === `/public/dashboard/${slug}`;
    return location.pathname === full || location.pathname.startsWith(full + "/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-700 overflow-hidden">
            <img src="/icon.png" alt="C8 Logo" className="h-7 w-7 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold leading-tight text-sidebar-foreground truncate">
                {auth?.company || auth?.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {auth?.user?.full_name ?? auth?.user?.email ?? "Dashboard"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Resultados ── */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Resultados</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {RESULTADOS_NAV.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link
                      to={`/public/dashboard/${slug}${item.url ? `/${item.url}` : ""}`}
                      className="flex items-center gap-3"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── CRM (condicional) ── */}
        {crmEnabled && (
          <SidebarGroup>
            {!collapsed && (
              <button
                onClick={() => setCrmOpen(o => !o)}
                className="flex items-center justify-between w-full px-2 py-1"
              >
                <SidebarGroupLabel className="pointer-events-none">CRM</SidebarGroupLabel>
                {crmOpen
                  ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                }
              </button>
            )}
            {(crmOpen || collapsed) && (
              <SidebarGroupContent>
                <SidebarMenu>
                  {CRM_NAV.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                        <Link
                          to={`/public/dashboard/${slug}/${item.url}`}
                          className="flex items-center gap-3"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}

        {/* ── WhatsApp (condicional) ── */}
        {waEnabled && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>WhatsApp</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("whatsapp")} tooltip="WhatsApp">
                    <Link to={`/public/dashboard/${slug}/whatsapp`} className="flex items-center gap-3">
                      <MessageCircle className="h-4 w-4 text-green-500" />
                      <span>WhatsApp</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── Conteúdo IA (condicional) ── */}
        {auth?.show_ia_content === true && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Conteúdo IA</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {IA_NAV.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link
                        to={`/public/dashboard/${slug}/${item.url}`}
                        className="flex items-center gap-3"
                      >
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

      {/* Footer: bot toggle + usuário */}
      <SidebarFooter className="border-t border-sidebar-border space-y-2 py-3">
        {auth?.show_ia_content && !collapsed && (
          <div className="px-2">
            <BotToggle slug={slug} />
          </div>
        )}
        {!collapsed ? (
          <div className="flex items-center gap-2 px-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {auth?.user?.full_name || auth?.user?.email || auth?.name}
              </p>
              {auth?.user?.role && (
                <p className="text-[10px] text-muted-foreground/60 capitalize">{auth.user.role}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
