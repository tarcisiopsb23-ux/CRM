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
  Wifi, WifiOff, Bot, ChevronDown, ChevronRight, Link2, CreditCard, ShieldCheck,
  CalendarCheck, ListChecks, Link as LinkIcon,
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
  { title: "Dashboard Geral",      url: "",            icon: LayoutDashboard },
  { title: "Performance",          url: "performance", icon: BarChart3 },
  { title: "Atendimento",          url: "atendimento", icon: MessageCircle },
];

const CRM_NAV = [
  { title: "Clientes",          url: "crm/clientes",          icon: Users },
  { title: "Pipeline",          url: "crm/pipeline",          icon: GitMerge },
  { title: "Produtos/Serviços", url: "crm/produtos",          icon: Package },
  { title: "Formulários",       url: "configuracoes/formularios", icon: ListChecks },
];

const AGENDA_NAV = [
  { title: "Agendamentos",  url: "agenda",                icon: CalendarCheck },
  { title: "Configurar",    url: "agenda/configuracoes",  icon: ListChecks },
  { title: "Link Público",  url: "agenda/link",           icon: LinkIcon },
];

const IA_NAV = [
  { title: "Eventos",             url: "eventos",      icon: CalendarDays },
  { title: "Promoções",           url: "promocoes",    icon: Tag },
  { title: "Sugestões da Semana", url: "sugestoes",    icon: UtensilsCrossed },
  { title: "Avisos",              url: "avisos",       icon: Megaphone },
];

const CONFIG_NAV = [
  { title: "Configurações",  url: "configuracoes",              icon: Settings },
  { title: "Usuários",       url: "configuracoes/usuarios",     icon: Users },
  { title: "Pagamentos",     url: "configuracoes/pagamentos",   icon: CreditCard },
  { title: "Integrações",    url: "configuracoes/integracoes",  icon: Link2 },
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
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
          active ? "bg-emerald-500" : "bg-red-500"
        )} />
        <span className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          active ? "bg-emerald-500" : "bg-red-500"
        )} />
      </span>
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

  const modules    = auth?.modules_config;
  const crmEnabled    = modules?.crm_enabled    === true;
  const demographicsEnabled = modules?.demographics_enabled === true;
  const agendaEnabled = modules?.agenda_enabled   === true;
  const userRole   = auth?.user?.role ?? "viewer";

  // Detecta usuário de suporte pelo padrão de email {10chars}@dominio
  const isSupportUser = !!(
    auth?.user?.email?.match(/^[a-z0-9]{10}@[a-z0-9.-]+\.[a-z]{2,}$/)
  );

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
              {!isSupportUser && (
                <p className="truncate text-xs text-muted-foreground">
                  {auth?.user?.full_name ?? auth?.user?.email ?? "Dashboard"}
                </p>
              )}
            </div>
          )}
        </div>
        {/* Banner de acesso de suporte no cabeçalho */}
        {isSupportUser && !collapsed && (
          <div className="mx-2 mb-2 flex items-center gap-2 rounded-md bg-violet-600/40 border border-violet-400/70 px-3 py-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-violet-200" />
            <p className="text-sm font-bold text-white tracking-wide">
              Acesso de Suporte
            </p>
          </div>
        )}
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
              {demographicsEnabled && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("performance?tab=audiencia")} tooltip="Audiência Demográfica">
                    <Link to={`/public/dashboard/${slug}/performance?tab=audiencia`} className="flex items-center gap-3">
                      <BarChart3 className="h-4 w-4" />
                      <span>Audiência Demográfica</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
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

        {/* ── Agenda (condicional) ── */}
        {agendaEnabled && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Agenda</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {AGENDA_NAV.map((item) => (
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

        {/* ── Configurações ── */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Configurações</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {CONFIG_NAV.filter(item =>
                // Usuários e Pagamentos: só owner/admin
                (item.url !== "configuracoes/usuarios" && item.url !== "configuracoes/pagamentos")
                || ["owner","admin"].includes(userRole)
              ).map((item) => (
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
      </SidebarContent>

      {/* Footer: bot toggle + indicador de sessão */}
      <SidebarFooter className="border-t border-sidebar-border space-y-2 py-3">
        {auth?.show_ia_content && !collapsed && (
          <div className="px-2">
            <BotToggle slug={slug} />
          </div>
        )}

        {/* Banner de suporte — mesmo estilo do BotToggle */}
        {isSupportUser ? (
          !collapsed ? (
            <div className="px-2">
              <div className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-semibold bg-violet-500/15 text-violet-400">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{auth?.user?.full_name || "Suporte"}</span>
                <ShieldCheck className="h-3 w-3 ml-auto shrink-0 opacity-60" />
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-violet-400" title="Acesso de Suporte" />
            </div>
          )
        ) : (
          /* Usuário normal — indicador de online */
          !collapsed ? (
            <div className="flex items-center gap-2 px-4">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <p className="text-[10px] text-muted-foreground/60 capitalize truncate">
                {auth?.user?.role}
              </p>
            </div>
          ) : (
            <div className="flex justify-center py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          )
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
