// PublicDashboardLayout
import { useEffect, useMemo, useRef } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ClientAuthProvider } from "@/contexts/ClientAuthContext";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase } from "@/lib/supabase";
import { PublicDashboardSidebar } from "./PublicDashboardSidebar";
import { PublicDashboardHeader } from "./PublicDashboardHeader";
import type { ClientAuth, ModulesConfig } from "@/contexts/ClientAuthContext";


type Role = "owner" | "admin" | "manager" | "member" | "viewer";

/** Rotas que exigem pelo menos o role indicado */
const ROUTE_ROLE_MAP: Record<string, Role> = {
  "/configuracoes/usuarios":              "admin",
  "/configuracoes/pagamentos":            "owner",
  "/configuracoes/integracoes/testes":    "admin",
  "/configuracoes/integracoes":           "admin",
  "/configuracoes/formularios":           "admin",
  "/configuracoes":                       "manager",
  "/mensagens":                           "member",
  "/mensagens/historico":                 "member",
  "/chatbot/canais":                      "admin",
  "/chatbot/agente":                      "manager",
  "/chatbot/conhecimento":                "member",
  "/meta-review":                         "admin",   // Meta App Review — admin mínimo
  "/whatsapp":                            "member",
  "/crm":                                 "member",
  "/crm/clientes":                        "member",
  "/crm/pipeline":                        "member",
  "/crm/produtos":                        "member",
  "/agenda":                              "member",
  "/agenda/configuracoes":                "manager",
  "/agenda/link":                         "member",
};

const ROLE_ORDER: Role[] = ["viewer", "member", "manager", "admin", "owner"];

function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(requiredRole);
}

// --- Rotas que exigem show_ia_content OU automation_enabled ------------------
// Quando automation_enabled = true, o conteúdo IA está dentro de Chatbot → Conhecimento.
// Quando show_ia_content = true (legado), ainda acessível pelas rotas diretas.
// Nos dois casos as rotas diretas continuam funcionando como fallback.
const IA_ROUTES = ["/promocoes", "/sugestoes", "/avisos", "/eventos"];

// --- Inner Layout -------------------------------------------------------------

function PublicDashboardLayoutInner({ slug }: { slug: string }) {
  const { auth, setAuth, logout } = useClientAuth();
  const location = useLocation();

  // Força tema dark permanentemente
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.removeAttribute("data-sidebar-color");
  }, []);

  // Re-fetch de dados frescos ao montar (atualiza modules_config e flags)
  // get_client_by_slug é SECURITY DEFINER com GRANT TO anon — usa sempre supabase
  // (anon key) para evitar 401 causado pelo JWT do cliente sem o claim esperado.
  // Após busca bem-sucedida, atualiza o contexto com modules_config e flags frescos.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!auth || fetchedRef.current) return;
    if (!slug) return;
    fetchedRef.current = true;

    supabase.rpc("get_client_by_slug", { p_slug: slug })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const fresh = data[0];
          if (fresh.subscription_status === "cancelado" || fresh.subscription_status === "bloqueado") {
            logout();
            return;
          }
          setAuth({
            ...auth,
            show_ia_content: fresh.show_ia_content ?? false,
            client_supabase_url: fresh.client_supabase_url ?? null,
            client_supabase_anon_key: null,
            favicon_url: fresh.favicon_url ?? auth.favicon_url,
            modules_config: (fresh.modules_config as ModulesConfig) ?? auth.modules_config,
            metadata: {
              dashboard_performance: fresh.dashboard_performance ?? true,
              dashboard_atendimento: fresh.dashboard_atendimento ?? false,
              ...(fresh.conversion_metrics && Object.keys(fresh.conversion_metrics).length > 0
                ? { conversion_metrics: fresh.conversion_metrics }
                : auth.metadata?.conversion_metrics
                  ? { conversion_metrics: auth.metadata.conversion_metrics }
                  : {}),
              ...(Array.isArray(fresh.dashboard_kpis) && fresh.dashboard_kpis.length > 0
                ? { dashboard_kpis: fresh.dashboard_kpis }
                : auth.metadata?.dashboard_kpis?.length
                  ? { dashboard_kpis: auth.metadata.dashboard_kpis }
                  : {}),
              ...(Array.isArray(fresh.geral_dashboard_cards) && fresh.geral_dashboard_cards.length > 0
                ? { geral_dashboard_cards: fresh.geral_dashboard_cards }
                : auth.metadata?.geral_dashboard_cards?.length
                  ? { geral_dashboard_cards: auth.metadata.geral_dashboard_cards }
                  : {}),
            },
          });
        }
      }).catch(() => { /* silencioso — usa dados do sessionStorage */ });
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-logout por inatividade — 5 min para suporte, 30 min para usuários normais
  const isSupportUser = !!(auth?.user?.email?.match(/^[a-z0-9]{10}@[a-z0-9.-]+\.[a-z]{2,}$/));

  useEffect(() => {
    const TIMEOUT = isSupportUser ? 5 * 60 * 1000 : 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, TIMEOUT);
    };
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [logout, isSupportUser]);

  // Guards de rota — todos os hooks já foram chamados, safe para retornar aqui
  const userRole    = (auth?.user?.role ?? "viewer") as Role;
  const routeSuffix = location.pathname.replace(`/${slug}`, "") || "/";

  const isIaRoute = IA_ROUTES.some((r) => location.pathname.endsWith(r));
  // Permite acesso se show_ia_content (legado) OU automation_enabled (novo módulo Chatbot)
  if (isIaRoute && !auth?.show_ia_content && !auth?.modules_config?.automation_enabled) {
    return <Navigate to={`/${slug}`} replace />;
  }

  // Guard do módulo Agenda — redireciona se explicitamente desabilitado
  const isAgendaRoute = routeSuffix === "/agenda" || routeSuffix.startsWith("/agenda/");
  if (isAgendaRoute && auth?.modules_config?.agenda_enabled === false) {
    return <Navigate to={`/${slug}`} replace />;
  }

  // Guard do módulo Mensagens
  const isMensagensRoute = routeSuffix === "/mensagens" || routeSuffix.startsWith("/mensagens/");
  if (isMensagensRoute && auth?.modules_config?.messaging_enabled !== true) {
    return <Navigate to={`/${slug}`} replace />;
  }

  // Guard do módulo Chatbot
  const isChatbotRoute = routeSuffix.startsWith("/chatbot/");
  if (isChatbotRoute && auth?.modules_config?.automation_enabled !== true) {
    return <Navigate to={`/${slug}`} replace />;
  }

  const requiredRole = Object.entries(ROUTE_ROLE_MAP).find(([route]) =>
    routeSuffix === route || routeSuffix.startsWith(route + "/")
  )?.[1] as Role | undefined;

  if (requiredRole && !hasRole(userRole, requiredRole)) {
    return <Navigate to={`/${slug}`} replace />;
  }

  return (
    <SidebarProvider>
      <div className="public-dashboard-root flex min-w-0 w-full" style={{ minHeight: "100vh" }}>
        <PublicDashboardSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
          <PublicDashboardHeader />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

// --- Outer Layout -------------------------------------------------------------

export function PublicDashboardLayout() {
  const { slug } = useParams<{ slug: string }>();

  // Auth guard: verifica sessionStorage no formato v2 (JWT)
  const isAuthenticated = useMemo(() => {
    const key = `client_auth_v2_${slug}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as ClientAuth;
      if (!parsed?.authenticated || !parsed?.session?.access_token) return false;
      const exp = parsed.session.expires_at;
      if (exp && Date.now() / 1000 > exp) {
        sessionStorage.removeItem(key);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [slug]);

  if (!isAuthenticated) {
    return <Navigate to={`/${slug}/login`} replace />;
  }

  // Se o usuário ainda precisa definir senha permanente, bloqueia o dashboard
  const hasForcedChange = (() => {
    try {
      const raw = sessionStorage.getItem(`client_auth_v2_${slug}`);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.force_password_change === true;
    } catch { return false; }
  })();

  if (hasForcedChange) {
    return <Navigate to={`/${slug}/set-password`} replace />;
  }

  return (
    <ClientAuthProvider slug={slug!}>
      <AuthGuardInner slug={slug!} />
    </ClientAuthProvider>
  );
}

/**
 * Guard reativo — lê o estado do contexto diretamente.
 * Quando logout() chama setAuthState(null), este componente
 * re-renderiza imediatamente e redireciona para o login,
 * sem depender do useMemo externo (que não é reativo).
 */
function AuthGuardInner({ slug }: { slug: string }) {
  const { auth } = useClientAuth();

  if (!auth) {
    return <Navigate to={`/${slug}/login`} replace />;
  }

  if ((auth as any).force_password_change === true) {
    return <Navigate to={`/${slug}/set-password`} replace />;
  }

  return <PublicDashboardLayoutInner slug={slug} />;
}
