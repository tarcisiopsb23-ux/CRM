/**
 * PublicDashboardSidebar
 *
 * Todos os grupos têm accordion expansível (clica no label, expande/recolhe).
 * CRM, Agenda, IA e Configurações começam abertos.
 * Resultados começa aberto e tem toggle.
 */

import { useState, useCallback, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BarChart3, MessageCircle, MessageSquare,
  Settings, Users, GitMerge, Package,
  Bot, ChevronDown, ChevronRight, Link2, CreditCard,
  ShieldCheck, CalendarCheck, ListChecks, Link as LinkIcon,
  Inbox, BookOpen, Instagram, Wifi, WifiOff,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarHeader,
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
  { title: "Conversas",       url: "atendimento", icon: MessageCircle },
];

const CRM_NAV = [
  { title: "Clientes",          url: "crm/clientes",  icon: Users },
  { title: "Funis de Vendas",   url: "crm/pipeline",  icon: GitMerge },
  { title: "Produtos/Serviços", url: "crm/produtos",  icon: Package },
  { title: "Campos",            url: "crm/campos",    icon: Settings },
];

const AGENDA_NAV = [
  { title: "Agendamentos", url: "agenda",               icon: CalendarCheck },
  { title: "Configurar",   url: "agenda/configuracoes", icon: ListChecks },
  { title: "Link Público", url: "agenda/link",          icon: LinkIcon },
];

const MENSAGENS_NAV = [
  { title: "Caixa de Entrada", url: "mensagens",           icon: Inbox },
  { title: "Histórico",        url: "mensagens/historico", icon: MessageSquare },
];

const CHATBOT_NAV = [
  { title: "Canais",       url: "chatbot/canais",       icon: Instagram },
  { title: "Meu Agente",   url: "chatbot/agente",       icon: Bot },
  { title: "Conhecimento", url: "chatbot/conhecimento", icon: BookOpen },
];

const CONFIG_NAV = [
  { title: "Configurações",     url: "configuracoes",                       icon: Settings },
  { title: "Usuários",          url: "configuracoes/usuarios",              icon: Users },
  { title: "Pagamentos",        url: "configuracoes/pagamentos",            icon: CreditCard },
  { title: "Integrações",       url: "configuracoes/integracoes",           icon: Link2 },
  { title: "Teste de Pixels",   url: "configuracoes/integracoes/testes",    icon: ShieldCheck },
  { title: "Formulários",       url: "configuracoes/formularios",           icon: ListChecks },
  { title: "Meta App Review",   url: "meta-review",                         icon: ShieldCheck },
];

// ─── Bot Toggle (footer rápido) ───────────────────────────────────────────────
// Toggle compacto no footer da sidebar — lê/escreve bot_active em client_ai_settings.
// Mantido para acesso rápido sem entrar em Chatbot → Meu Agente.

function BotToggle({ slug: _slug }: { slug: string }) {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? auth?.id ?? "";

  const TABLE  = "client_ai_settings";
  const FILTER = { col: "client_id", val: clientId };

  const [active, setActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dc || !clientId) return;
    if (clientId === "00000000-0000-0000-0000-000000000099" ||
        clientId === "00000000-0000-0000-0000-000000000000") {
      setActive(true);
      return;
    }
    dc.from(TABLE).select("bot_active").eq(FILTER.col, FILTER.val).limit(1)
      .maybeSingle()
      .then(({ data }) => setActive(data?.bot_active ?? true))
      .catch(() => setActive(true));
  }, [dc, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(async () => {
    if (!dc || loading || active === null || !clientId) return;
    if (clientId === "00000000-0000-0000-0000-000000000099" ||
        clientId === "00000000-0000-0000-0000-000000000000") return;
    setLoading(true);
    const next = !active;
    try {
      const { data: existing } = await dc.from(TABLE).select("id").eq(FILTER.col, FILTER.val).limit(1).maybeSingle();
      if (existing?.id) {
        await dc.from(TABLE).update({ bot_active: next }).eq("id", existing.id);
      } else {
        await dc.from(TABLE).insert({ client_id: clientId, bot_active: next });
      }
      setActive(next);
      toast.success(next ? "Bot ativado" : "Bot offline");
    } catch { toast.error("Erro ao alterar estado do bot."); }
    finally { setLoading(false); }
  }, [dc, active, loading, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (active === null) return null;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-semibold transition-colors",
        active ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
               : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
      )}
      title={active ? "Bot ativo — clique para colocar offline" : "Bot offline — clique para ativar"}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
          active ? "bg-emerald-500" : "bg-red-500")} />
        <span className={cn("relative inline-flex h-2 w-2 rounded-full",
          active ? "bg-emerald-500" : "bg-red-500")} />
      </span>
      <Bot className={cn("h-3.5 w-3.5 shrink-0", loading && "animate-pulse")} />
      <span className="truncate">{active ? "Bot Online" : "Bot Offline"}</span>
      {active
        ? <Wifi className="h-3 w-3 ml-auto shrink-0" />
        : <WifiOff className="h-3 w-3 ml-auto shrink-0" />}
    </button>
  );
}

// ─── AccordionGroup ───────────────────────────────────────────────────────────
// Grupo reutilizável com toggle accordion. Quando a sidebar está colapsada
// (modo ícone), sempre mostra os itens sem label.

interface AccordionGroupProps {
  label: string;
  collapsed: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function AccordionGroup({ label, collapsed, defaultOpen = true, children }: AccordionGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <SidebarGroup>
      {!collapsed && (
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center justify-between w-full px-2 py-1 group"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80 transition-colors">
            {label}
          </span>
          {open
            ? <ChevronDown className="h-3 w-3 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60 transition-colors" />
            : <ChevronRight className="h-3 w-3 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60 transition-colors" />
          }
        </button>
      )}
      {(open || collapsed) && (
        <SidebarGroupContent>
          {children}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function PublicDashboardSidebar() {
  const { auth, slug } = useClientAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location  = useLocation();

  const modules       = auth?.modules_config;
  const crmEnabled       = modules?.crm_enabled    !== false;
  const agendaEnabled    = modules?.agenda_enabled  !== false;
  const messagingEnabled = modules?.messaging_enabled === true;
  const chatbotEnabled   = modules?.automation_enabled === true;
  // Legado: mostrar grupo WhatsApp apenas se whatsapp_enabled=true E chatbot não estiver ativo
  const waLegacyEnabled  = modules?.whatsapp_enabled === true && !chatbotEnabled;
  // Legado: mostrar Conteúdo IA apenas se show_ia_content=true E chatbot não estiver ativo
  const iaLegacyEnabled  = auth?.show_ia_content === true && !chatbotEnabled;
  const userRole      = auth?.user?.role ?? "viewer";

  const isSupportUser = !!(auth?.user?.email?.match(/^[a-z0-9]{10}@[a-z0-9.-]+\.[a-z]{2,}$/));

  const isActive = (url: string) => {
    const full = `/${slug}${url ? `/${url}` : ""}`;
    if (url === "") return location.pathname === `/${slug}`;
    return location.pathname === full || location.pathname.startsWith(full + "/");
  };

  // Detecta qual grupo tem a rota ativa para abrir automaticamente
  const isInGroup = (urls: string[]) =>
    urls.some(url => isActive(url) || location.pathname.startsWith(`/${slug}/${url}`));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">

      {/* ── Header ── */}
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
        {isSupportUser && !collapsed && (
          <div className="mx-2 mb-2 flex items-center gap-2 rounded-md bg-violet-600/40 border border-violet-400/70 px-3 py-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-violet-200" />
            <p className="text-sm font-bold text-white tracking-wide">Acesso de Suporte</p>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>

        {/* ── Resultados ── */}
        <AccordionGroup label="Resultados" collapsed={collapsed} defaultOpen={true}>
          <SidebarMenu>
            {RESULTADOS_NAV.map(item => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                  <Link to={`/${slug}${item.url ? `/${item.url}` : ""}`} className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </AccordionGroup>

        {/* ── CRM ── */}
        {crmEnabled && (
          <AccordionGroup
            label="CRM"
            collapsed={collapsed}
            defaultOpen={isInGroup(CRM_NAV.map(i => i.url))}
          >
            <SidebarMenu>
              {CRM_NAV.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={`/${slug}/${item.url}`} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </AccordionGroup>
        )}

        {/* ── Agenda ── */}
        {agendaEnabled && (
          <AccordionGroup
            label="Agenda"
            collapsed={collapsed}
            defaultOpen={isInGroup(AGENDA_NAV.map(i => i.url))}
          >
            <SidebarMenu>
              {AGENDA_NAV.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={`/${slug}/${item.url}`} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </AccordionGroup>
        )}

        {/* ── WhatsApp (legado — exibido apenas quando chatbot não está ativo) ── */}
        {waLegacyEnabled && (
          <AccordionGroup label="WhatsApp" collapsed={collapsed} defaultOpen={true}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("whatsapp")} tooltip="WhatsApp">
                  <Link to={`/${slug}/whatsapp`} className="flex items-center gap-3">
                    <MessageCircle className="h-4 w-4 text-green-500" />
                    <span>WhatsApp</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </AccordionGroup>
        )}

        {/* ── Mensagens (novo) ── */}
        {messagingEnabled && (
          <AccordionGroup
            label="Mensagens"
            collapsed={collapsed}
            defaultOpen={isInGroup(MENSAGENS_NAV.map(i => i.url))}
          >
            <SidebarMenu>
              {MENSAGENS_NAV.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={`/${slug}/${item.url}`} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 text-emerald-400" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </AccordionGroup>
        )}

        {/* ── Chatbot (novo) ── */}
        {chatbotEnabled && (
          <AccordionGroup
            label="Chatbot"
            collapsed={collapsed}
            defaultOpen={isInGroup(CHATBOT_NAV.map(i => i.url))}
          >
            <SidebarMenu>
              {CHATBOT_NAV.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={`/${slug}/${item.url}`} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 text-violet-400" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </AccordionGroup>
        )}

        {/* ── Conteúdo IA (legado — exibido apenas quando chatbot não está ativo) ── */}
        {iaLegacyEnabled && (
          <AccordionGroup
            label="Conteúdo IA"
            collapsed={collapsed}
            defaultOpen={false}
          >
            <SidebarMenu>
              {[
                { title: "Eventos",    url: "eventos",   icon: LayoutDashboard },
                { title: "Promoções",  url: "promocoes", icon: LayoutDashboard },
                { title: "Sugestões",  url: "sugestoes", icon: LayoutDashboard },
                { title: "Avisos",     url: "avisos",    icon: LayoutDashboard },
              ].map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={`/${slug}/${item.url}`} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </AccordionGroup>
        )}

        {/* ── Configurações ── */}
        <AccordionGroup
          label="Configurações"
          collapsed={collapsed}
          defaultOpen={isInGroup(CONFIG_NAV.map(i => i.url))}
        >
          <SidebarMenu>
            {CONFIG_NAV.filter(item => {
              // Usuários e Pagamentos: apenas owner/admin
              if (item.url === "configuracoes/usuarios" || item.url === "configuracoes/pagamentos") {
                return ["owner", "admin"].includes(userRole);
              }
              // Meta App Review: apenas admin/owner
              if (item.url === "meta-review") {
                return ["owner", "admin"].includes(userRole);
              }
              return true;
            }).map(item => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                  <Link to={`/${slug}/${item.url}`} className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </AccordionGroup>

      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="border-t border-sidebar-border space-y-2 py-3">
        {/* Bot toggle rápido — visível quando chatbot ativo OU Conteúdo IA legado */}
        {(chatbotEnabled || iaLegacyEnabled) && !collapsed && (
          <div className="px-2">
            <BotToggle slug={slug} />
          </div>
        )}
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
