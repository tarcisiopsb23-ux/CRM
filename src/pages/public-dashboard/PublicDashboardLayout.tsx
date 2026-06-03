import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ClientAuthProvider } from "@/contexts/ClientAuthContext";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase } from "@/lib/supabase";
import { PublicDashboardSidebar } from "./PublicDashboardSidebar";
import { PublicDashboardHeader } from "./PublicDashboardHeader";

// ─── Rotas que exigem show_ia_content ─────────────────────────────────────────

const IA_ROUTES = [
  "/agenda",
  "/promocoes",
  "/sugestoes",
  "/avisos",
  "/configuracoes",
];

// ─── PublicDashboardLayoutInner ────────────────────────────────────────────────

function PublicDashboardLayoutInner({ slug }: { slug: string }) {
  const { auth, setAuth, logout } = useClientAuth();
  const location = useLocation();

  // Força tema dark permanentemente — sem restauração, pois rotas públicas ficam
  // fora do UserPreferencesProvider e não sofrem interferência de tema do CRM
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.removeAttribute("data-sidebar-color");
  }, []);

  // Guard de rota IA
  const isIaRoute = IA_ROUTES.some((r) => location.pathname.endsWith(r));
  if (isIaRoute && !auth?.show_ia_content) {
    return <Navigate to={`/public/dashboard/${slug}`} replace />;
  }

  // Re-fetch de dados frescos ao montar
  useEffect(() => {
    if (!auth) return;
    supabase.rpc("get_client_by_slug", { p_slug: slug }).then(({ data }) => {
      if (data && data.length > 0) {
        const fresh = data[0];
        setAuth({
          ...auth,
          show_ia_content: fresh.show_ia_content ?? false,
          client_supabase_url: fresh.client_supabase_url ?? null,
          client_supabase_anon_key: fresh.client_supabase_anon_key ?? null,
          favicon_url: fresh.favicon_url ?? auth.favicon_url,
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
  }, [slug]);

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

// ─── PublicDashboardLayout ─────────────────────────────────────────────────────

export function PublicDashboardLayout() {
  const { slug } = useParams<{ slug: string }>();

  // Auth guard: redireciona para login se não autenticado
  const stored = localStorage.getItem(`client_auth_${slug}`);
  if (!stored) {
    return <Navigate to={`/public/dashboard/${slug}/login`} replace />;
  }

  return (
    <ClientAuthProvider slug={slug!}>
      <PublicDashboardLayoutInner slug={slug!} />
    </ClientAuthProvider>
  );
}
