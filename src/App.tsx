import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";
import { PendingAuthProvider } from "@/contexts/PendingAuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ModuleGuard } from "@/components/auth/ModuleGuard";
import { TimeclockGuard } from "@/components/auth/TimeclockGuard";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { CompleteRegistrationPage } from "@/pages/CompleteRegistrationPage";
import { SetPasswordPage } from "@/pages/SetPasswordPage";
import { ProfileSetupPage } from "@/pages/ProfileSetupPage";
import { EditCollaboratorPage } from "@/pages/EditCollaboratorPage";
import MyProfilePage from "@/pages/MyProfilePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadsKanbanPage } from "./pages/LeadsKanbanPage";
import ClientsPage from "./pages/ClientsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import FinancialPage from "./pages/FinancialPage";
import Agenda from "./pages/Agenda";
import ProjectsPage from "./pages/ProjectsPage";
import { ProjectDetailsPage } from "./pages/ProjectDetailsPage";
import GoalsPage from "./pages/GoalsPage";
import WhatsApp from "./pages/WhatsApp";
import Meetings from "./pages/Meetings";
import TeamPage from "./pages/TeamPage";
import Avaliacao360Page from "./pages/Avaliacao360Page";
import CampaignReports from "./pages/CampaignReports";
import GeneralReports from "./pages/GeneralReports";
import { SalesDashboardPage } from "./pages/SalesDashboardPage";
import AuditPage from "./pages/AuditPage";
import NotFound from "./pages/NotFound";
import ReportsPage from "./pages/ReportsPage";
import { TimeClockPunchPage } from "./pages/TimeClockPunchPage";
import { TimeClockLockedPage } from "./pages/TimeClockLockedPage";
import { TimeclockEntryPage } from "./pages/TimeclockEntryPage";
import { PublicDashboardPage } from "./pages/PublicDashboardPage";
import { PublicDashboardLoginPage } from "./pages/PublicDashboardLoginPage";
import { C8ControlLoginPage } from "./pages/C8ControlLoginPage";
import { C8ControlPage } from "./pages/C8ControlPage";
import { DynamicFavicon } from "@/components/layout/DynamicFavicon";
import { DynamicTitle } from "@/components/layout/DynamicTitle";
import { PublicDemoDashboardPage } from "./pages/PublicDemoDashboardPage";
import SuppliersModulePage from "@/pages/SuppliersModulePage";
import FiscalPage from "@/pages/FiscalPage";
import AuthorizationsPage from "@/pages/AuthorizationsPage";
import { PublicVagasRouter } from "@/router/PublicVagasRouter";
import { PublicDashboardLayout } from "./pages/public-dashboard/PublicDashboardLayout";
import { RedirectPage } from "./pages/public-dashboard/RedirectPage";

const DashboardGeralPage  = lazy(() => import("./pages/public-dashboard/DashboardGeralPage").then(m => ({ default: m.DashboardGeralPage })));
const PerformancePage     = lazy(() => import("./pages/public-dashboard/PerformancePage").then(m => ({ default: m.PerformancePage })));
const AtendimentoPage     = lazy(() => import("./pages/public-dashboard/AtendimentoPage").then(m => ({ default: m.AtendimentoPage })));
const AgendaPage          = lazy(() => import("./pages/public-dashboard/AgendaPage").then(m => ({ default: m.AgendaPage })));
const PromocoesPage       = lazy(() => import("./pages/public-dashboard/PromocoesPage").then(m => ({ default: m.PromocoesPage })));
const SugestoesPage       = lazy(() => import("./pages/public-dashboard/SugestoesPage").then(m => ({ default: m.SugestoesPage })));
const AvisosPage          = lazy(() => import("./pages/public-dashboard/AvisosPage").then(m => ({ default: m.AvisosPage })));
const ConfiguracoesPage   = lazy(() => import("./pages/public-dashboard/ConfiguracoesPage").then(m => ({ default: m.ConfiguracoesPage })));
// Fase 2 — CRM e WhatsApp
const CrmPage             = lazy(() => import("./pages/public-dashboard/CrmPage").then(m => ({ default: m.CrmPage })));
const CrmPipelinePage     = lazy(() => import("./pages/public-dashboard/CrmPipelinePage").then(m => ({ default: m.CrmPipelinePage })));
const CrmProdutosPage     = lazy(() => import("./pages/public-dashboard/CrmProdutosPage").then(m => ({ default: m.CrmProdutosPage })));
const WhatsAppPage        = lazy(() => import("./pages/public-dashboard/WhatsAppPage").then(m => ({ default: m.WhatsAppPage })));
// Fase 4 — Configurações expandidas
const ConfigUsuariosPage  = lazy(() => import("./pages/public-dashboard/ConfigUsuariosPage").then(m => ({ default: m.ConfigUsuariosPage })));
const ConfigIntegracoesPage = lazy(() => import("./pages/public-dashboard/ConfigIntegracoesPage").then(m => ({ default: m.ConfigIntegracoesPage })));
const ConfigPagamentosPage  = lazy(() => import("./pages/public-dashboard/ConfigPagamentosPage").then(m => ({ default: m.ConfigPagamentosPage })));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] bg-[#0F172A]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2D8CC7] border-t-transparent" />
    </div>
  );
}

function App() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isVagasSubdomain = hostname.startsWith("vagas.");

  if (isVagasSubdomain) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <PublicVagasRouter />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PendingAuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter
              future={{ 
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <DynamicFavicon />
              <DynamicTitle />
              <UserPreferencesProvider>
                <Routes>
                  {/* ── Rotas do Dashboard Público — sempre dark (forçado via index.html + useEffect) ── */}
                  <Route path="/demo/dashboard" element={<PublicDemoDashboardPage />} />
                  {/* Redirecionamento instantâneo — sem banco, destino na query string (?to=url) */}
                  <Route path="/r" element={<RedirectPage />} />
                  <Route path="/public/dashboard/:slug" element={<PublicDashboardLayout />}>
                    <Route index element={<Suspense fallback={<PageLoader />}><DashboardGeralPage /></Suspense>} />
                    <Route path="performance" element={<Suspense fallback={<PageLoader />}><PerformancePage /></Suspense>} />
                    <Route path="atendimento" element={<Suspense fallback={<PageLoader />}><AtendimentoPage /></Suspense>} />
                    <Route path="agenda" element={<Suspense fallback={<PageLoader />}><AgendaPage /></Suspense>} />
                    <Route path="promocoes" element={<Suspense fallback={<PageLoader />}><PromocoesPage /></Suspense>} />
                    <Route path="sugestoes" element={<Suspense fallback={<PageLoader />}><SugestoesPage /></Suspense>} />
                    <Route path="avisos" element={<Suspense fallback={<PageLoader />}><AvisosPage /></Suspense>} />
                    <Route path="configuracoes" element={<Suspense fallback={<PageLoader />}><ConfiguracoesPage /></Suspense>} />
                    {/* Fase 2 — CRM */}
                    <Route path="crm" element={<Suspense fallback={<PageLoader />}><CrmPage /></Suspense>} />
                    <Route path="crm/clientes" element={<Suspense fallback={<PageLoader />}><CrmPage /></Suspense>} />
                    <Route path="crm/pipeline" element={<Suspense fallback={<PageLoader />}><CrmPipelinePage /></Suspense>} />
                    <Route path="crm/produtos" element={<Suspense fallback={<PageLoader />}><CrmProdutosPage /></Suspense>} />
                    {/* Fase 2 — WhatsApp */}
                    <Route path="whatsapp" element={<Suspense fallback={<PageLoader />}><WhatsAppPage /></Suspense>} />
                    {/* Fase 4 — Configurações expandidas */}
                    <Route path="configuracoes/usuarios"    element={<Suspense fallback={<PageLoader />}><ConfigUsuariosPage /></Suspense>} />
                    <Route path="configuracoes/integracoes" element={<Suspense fallback={<PageLoader />}><ConfigIntegracoesPage /></Suspense>} />
                    <Route path="configuracoes/pagamentos"  element={<Suspense fallback={<PageLoader />}><ConfigPagamentosPage /></Suspense>} />
                  </Route>
                  <Route path="/public/dashboard/:slug/login" element={<PublicDashboardLoginPage />} />
                  <Route path="/public/dashboard/:slug/crm/login" element={<C8ControlLoginPage />} />
                  <Route path="/vagas/*" element={<PublicVagasRouter />} />
                  {/* ── Rotas internas ── */}
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
                  <Route path="/set-password" element={<SetPasswordPage />} />
                  <Route path="/profile-setup" element={<ProtectedRoute><ProfileSetupPage /></ProtectedRoute>} />
                  <Route path="/timeclock/entry" element={<ProtectedRoute><TimeclockEntryPage /></ProtectedRoute>} />
                  <Route path="/timeclock/locked" element={<ProtectedRoute><TimeClockLockedPage /></ProtectedRoute>} />
                  <Route element={<ProtectedRoute><TimeclockGuard><AppLayout /></TimeclockGuard></ProtectedRoute>}>
                    <Route path="/timeclock/punch" element={<TimeClockPunchPage />} />
                    <Route path="/team/me" element={<MyProfilePage />} />
                    <Route element={<ModuleGuard />}>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/performance" element={<Navigate to="/?tab=performance" replace />} />
                      <Route path="/kanban" element={<LeadsKanbanPage />} />
                      <Route path="/leads" element={<Navigate to="/kanban" replace />} />
                      <Route path="/clients" element={<ClientsPage />} />
                      <Route path="/clients/:clientId" element={<ClientsPage />} />
                      <Route path="/integrations" element={<IntegrationsPage />} />
                      <Route path="/suppliers" element={<SuppliersModulePage />} />
                      <Route path="/financial" element={<FinancialPage />} />
                      <Route path="/agenda" element={<Agenda />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/projects/:projectId" element={<ProjectDetailsPage />} />
                      <Route path="/goals" element={<GoalsPage />} />
                      <Route path="/whatsapp" element={<WhatsApp />} />
                      <Route path="/meetings" element={<Navigate to="/" replace />} />
                      <Route path="/team" element={<TeamPage />} />
                      <Route path="/team/360" element={<Avaliacao360Page />} />
                      <Route path="/team/edit/:id" element={<EditCollaboratorPage />} />
                      <Route path="/team/employees/:profileId" element={<TeamPage />} />
                      <Route path="/campaign-reports" element={<CampaignReports />} />
                      <Route path="/general-reports" element={<GeneralReports />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/sales-analytics" element={<SalesDashboardPage />} />
                      <Route path="/audit" element={<AuditPage />} />
                      <Route path="/fiscal" element={<Navigate to="/financial?tab=nfse" replace />} />
                      <Route path="/recruitment" element={<Navigate to="/team" replace />} />
                      <Route path="/authorizations" element={<AuthorizationsPage />} />
                      <Route path="/c8control" element={<C8ControlPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Route>
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </UserPreferencesProvider>
            </BrowserRouter>
          </TooltipProvider>
        </PendingAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
