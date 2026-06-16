/**
 * PublicDashboardLayout — Fase 1 (T-1.7)
 *
 * Mudanças vs versão anterior:
 * - Auth guard lê sessionStorage (formato v2 com JWT) em vez de localStorage
 * - Anon key do Banco B é injetada em memória no contexto após verificação
 * - Guards de role por rota (viewer não acessa configurações, etc.)
 * - Mantém tema dark forçado e auto-logout por inatividade
 */

import { useEffect, useMemo, useRef } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ClientAuthProvider } from "@/contexts/ClientAuthContext";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { supabase } from "@/lib/supabase";
import { PublicDashboardSidebar } from "./PublicDashboardSidebar";
import { PublicDashboardHeader } from "./PublicDashboardHeader";
import type { ClientAuth, ModulesConfig } from "@/contexts/ClientAuthContext";


type Role = "owner" | "admin" | "manager" | "member" | "viewer";

/** Rotas que exigem pelo menos o role indicado */
const ROUTE_ROLE_MAP: Record<string, Role> = {
  "/configuracoes/usuarios":     "admin",
  "/configuracoes/pagamentos":   "owner",
  "/configuracoes/integracoes":  "admin",
  "/configuracoes":              "manager",
  "/whatsapp":                   "member",
  "/crm":                        "member",
  "/crm/clientes":               "member",
  "/crm/pipeline":               "member",
  "/crm/produtos":               "member",
};

const ROLE_ORDER: Role[] = ["viewer", "member", "manager", "admin", "owner"];

function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(requiredRole);
}

// ─── Rotas que exigem show_ia_content ─────────────────────────────────────────

const IA_ROUTES = ["/agenda", "/promocoes", "/sugestoes", "/avisos", "/eventos"];

// ─── Inner Layout ─────────────────────────────────────────────────────────────

function PublicDashboardLayoutInner({ slug }: { slug: string }) {
  const { auth, setAuth, logout } = useClientAuth();
  const dc = useDynamicClient();
  const location = useLocation();

  // Força tema dark permanentemente
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.removeAttribute("data-sidebar-color");
  }, []);

  // Re-fetch de dados frescos ao montar (atualiza modules_config e flags)
  useEffect(() => {
    if (!auth) return;
    supabase.rpc("get_client_by_slug", { p_slug: slug }).then(({ data }) => {
      if (data && data.length > 0) {
        const fresh = data[0];
        setAuth({
          ...auth,
          show_ia_content: fresh.show_ia_content ?? false,
          client_supabase_url: fresh.client_supabase_url ?? null,
          // Mantém anon_key null no contexto — fica só em sessionStorage temporário
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
    });
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-logout por inatividade (30 min)
  useEffect(() => {
    const TIMEOUT = 30 * 60 * 1000;
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
  }, [logout]);

  // Guards de rota — todos os hooks já foram chamados, safe para retornar aqui
  const isIaRoute = IA_ROUTES.some((r) => location.pathname.endsWith(r));
  if (isIaRoute && !auth?.show_ia_content) {
    return <Navigate to={`/public/dashboard/${slug}`} replace />;
  }

  const userRole = (auth?.user?.role ?? "viewer") as Role;
  const routeSuffix = location.pathname.replace(`/public/dashboard/${slug}`, "") || "/";
  const requiredRole = Object.entries(ROUTE_ROLE_MAP).find(([route]) =>
    routeSuffix === route || routeSuffix.startsWith(route + "/")
  )?.[1] as Role | undefined;

  if (requiredRole && !hasRole(userRole, requiredRole)) {
    return <Navigate to={`/public/dashboard/${slug}`} replace />;
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

// ─── Outer Layout ─────────────────────────────────────────────────────────────

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
    return <Navigate to={`/public/dashboard/${slug}/login`} replace />;
  }

  return (
    <ClientAuthProvider slug={slug!}>
      <PublicDashboardLayoutInner slug={slug!} />
    </ClientAuthProvider>
  );
}
