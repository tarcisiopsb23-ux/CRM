/**
 * App.tsx - C8 Control (build independente)
 *
 * Dominio de producao: app.c8control.com.br
 * Banco: Banco A (owwaulaenabbdalycusx) - compartilhado com Maestr.ia
 *
 * Rotas públicas (Maestr.IA — dashboard do cliente):
 *   /login                 -> login por e-mail (lookup automatico de slug)
 *   /:slug                 -> dashboard do cliente (index)
 *   /:slug/*               -> demais sub-rotas do cliente
 *   /booking/:slug         -> agendamento publico (sem login)
 *   /form/:slug/:formSlug  -> formulario de leads publico (sem login)
 *   /r                     -> redirect rapido (UTMs)
 *   /google-calendar-callback -> OAuth Google Calendar
 *
 * Rotas internas (C8 Control admin — equipe da agência):
 *   /admin/login           -> login do time interno
 *   /                      -> Dashboard interno
 *   /kanban                -> CRM / Kanban
 *   /clients               -> Clientes
 *   /financial             -> Financeiro
 *   /flow-builder          -> Flow Builder
 *   ...demais rotas do admin
 */

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
import { DynamicFavicon } from "@/components/layout/DynamicFavicon";
import { DynamicTitle } from "@/components/layout/DynamicTitle";

// ── Auth / Account ────────────────────────────────────────────────────────────
import { LoginPage } from "@/pages/LoginPage";
import { CompleteRegistrationPage } from "@/pages/CompleteRegistrationPage";
import { SetPasswordPage } from "@/pages/SetPasswordPage";
import { ProfileSetupPage } from "@/pages/ProfileSetupPage";
import { EditCollaboratorPage } from "@/pages/EditCollaboratorPage";
import MyProfilePage from "@/pages/MyProfilePage";
import NotFound from "@/pages/NotFound";

// ── Maestr.IA (Public Dashboard) ─────────────────────────────────────────────
import { PublicDashboardLayout }    from "@/pages/public-dashboard/PublicDashboardLayout";
import { PublicDashboardLoginPage } from "@/pages/PublicDashboardLoginPage";
import { RedirectPage }             from "@/pages/public-dashboard/RedirectPage";
import { SetPasswordPage as DashboardSetPasswordPage } from "@/pages/public-dashboard/SetPasswordPage";
import { GoogleCalendarCallbackPage } from "@/pages/public-dashboard/GoogleCalendarCallbackPage";
import BookingPage from "@/pages/BookingPage";
import { OAuthCallbackPage } from "@/pages/OAuthCallbackPage";

// ── Admin pages (eager — used by AppLayout shell) ────────────────────────────
import { DashboardPage }      from "@/pages/DashboardPage";
import { LeadsKanbanPage }    from "@/pages/LeadsKanbanPage";
import ClientsPage            from "@/pages/ClientsPage";
import IntegrationsPage       from "@/pages/IntegrationsPage";
import FinancialPage          from "@/pages/FinancialPage";
import Agenda                 from "@/pages/Agenda";
import ProjectsPage           from "@/pages/ProjectsPage";
import { ProjectDetailsPage } from "@/pages/ProjectDetailsPage";
import GoalsPage              from "@/pages/GoalsPage";
import WhatsApp               from "@/pages/WhatsApp";
import TeamPage               from "@/pages/TeamPage";
import Avaliacao360Page       from "@/pages/Avaliacao360Page";
import CampaignReports        from "@/pages/CampaignReports";
import GeneralReports         from "@/pages/GeneralReports";
import { SalesDashboardPage } from "@/pages/SalesDashboardPage";
import AuditPage              from "@/pages/AuditPage";
import ReportsPage            from "@/pages/ReportsPage";
import { SettingsPage }       from "@/pages/SettingsPage";
import { C8ControlPage }      from "@/pages/C8ControlPage";
import AuthorizationsPage     from "@/pages/AuthorizationsPage";
import SuppliersModulePage    from "@/pages/SuppliersModulePage";
import PropostasPage          from "@/pages/PropostasPage";
import { TimeClockPunchPage } from "@/pages/TimeClockPunchPage";
import { TimeClockLockedPage } from "@/pages/TimeClockLockedPage";
import { TimeclockEntryPage } from "@/pages/TimeclockEntryPage";
import { PublicVagasRouter }  from "@/router/PublicVagasRouter";

// ── Admin pages (lazy) ────────────────────────────────────────────────────────
const PropostaEditorPage     = lazy(() => import("@/pages/PropostaEditorPage"));
const PropostaWizardPage     = lazy(() => import("@/pages/PropostaWizardPage"));
const PropostaDetalhesPage   = lazy(() => import("@/pages/PropostaDetalhesPage"));
const ContractTemplatePage   = lazy(() => import("@/pages/ContractTemplatePage"));
const ComercialDashboardPage = lazy(() => import("@/pages/ComercialDashboardPage"));
const FlowBuilderPage        = lazy(() => import("@/pages/FlowBuilderPage"));

// ── Admin — Content Operations ────────────────────────────────────────────────
const ContentItensPage        = lazy(() => import("@/pages/content/ContentItensPage").then(m => ({ default: m.ContentItensPage })));
const ContentItemDetailPage   = lazy(() => import("@/pages/content/ContentItemDetailPage").then(m => ({ default: m.ContentItemDetailPage })));
const ContentCampanhasPage    = lazy(() => import("@/pages/content/ContentCampanhasPage").then(m => ({ default: m.ContentCampanhasPage })));
const ContentPlanejamentoPage = lazy(() => import("@/pages/content/ContentPlanejamentoPage").then(m => ({ default: m.ContentPlanejamentoPage })));
const ContentBriefingPage     = lazy(() => import("@/pages/content/ContentBriefingPage").then(m => ({ default: m.ContentBriefingPage })));
const ContentEntregaveisPage  = lazy(() => import("@/pages/content/ContentEntregaveisPage").then(m => ({ default: m.ContentEntregaveisPage })));
const ContentParceirosPage    = lazy(() => import("@/pages/content/ContentParceirosPage").then(m => ({ default: m.ContentParceirosPage })));
const ContentIndexPage        = lazy(() => import("@/pages/content/ContentIndexPage").then(m => ({ default: m.ContentIndexPage })));
const ContentClientPage       = lazy(() => import("@/pages/content/ContentClientPage").then(m => ({ default: m.ContentClientPage })));

// ── Módulo Content Operations (Maestr.IA — portal do cliente) ────────────────
const ContentPortalIndexPage        = lazy(() => import("@/pages/public-dashboard/content/ContentPortalIndexPage").then(m => ({ default: m.ContentPortalIndexPage })));
const ContentApprovalsPage          = lazy(() => import("@/pages/public-dashboard/content/ContentApprovalsPage").then(m => ({ default: m.ContentApprovalsPage })));
const ContentCalendarClientPage     = lazy(() => import("@/pages/public-dashboard/content/ContentCalendarClientPage").then(m => ({ default: m.ContentCalendarClientPage })));
const ContentBriefingsClientPage    = lazy(() => import("@/pages/public-dashboard/content/ContentBriefingsPage").then(m => ({ default: m.ContentBriefingsPage })));
const ContentDeliverablesClientPage = lazy(() => import("@/pages/public-dashboard/content/ContentDeliverablesPage").then(m => ({ default: m.ContentDeliverablesPage })));

// ── Maestr.IA pages (lazy) ────────────────────────────────────────────────────
const DashboardGeralPage    = lazy(() => import("@/pages/public-dashboard/DashboardGeralPage").then(m => ({ default: m.DashboardGeralPage })));
const PerformancePage       = lazy(() => import("@/pages/public-dashboard/PerformancePage").then(m => ({ default: m.PerformancePage })));
const AtendimentoPage       = lazy(() => import("@/pages/public-dashboard/AtendimentoPage").then(m => ({ default: m.AtendimentoPage })));
const PromocoesPage         = lazy(() => import("@/pages/public-dashboard/PromocoesPage").then(m => ({ default: m.PromocoesPage })));
const SugestoesPage         = lazy(() => import("@/pages/public-dashboard/SugestoesPage").then(m => ({ default: m.SugestoesPage })));
const AvisosPage            = lazy(() => import("@/pages/public-dashboard/AvisosPage").then(m => ({ default: m.AvisosPage })));
const EventosPage           = lazy(() => import("@/pages/public-dashboard/EventosPage").then(m => ({ default: m.EventosPage })));
const ConfiguracoesPage     = lazy(() => import("@/pages/public-dashboard/ConfiguracoesPage").then(m => ({ default: m.ConfiguracoesPage })));
const ConfigUsuariosPage    = lazy(() => import("@/pages/public-dashboard/ConfigUsuariosPage").then(m => ({ default: m.ConfigUsuariosPage })));
const ConfigIntegracoesPage = lazy(() => import("@/pages/public-dashboard/ConfigIntegracoesPage").then(m => ({ default: m.ConfigIntegracoesPage })));
const ConfigPagamentosPage  = lazy(() => import("@/pages/public-dashboard/ConfigPagamentosPage").then(m => ({ default: m.ConfigPagamentosPage })));
const TrackingTestPage      = lazy(() => import("@/pages/public-dashboard/TrackingTestPage").then(m => ({ default: m.TrackingTestPage })));
const FormsConfigPage       = lazy(() => import("@/pages/public-dashboard/FormsConfigPage").then(m => ({ default: m.FormsConfigPage })));
const LeadFormPage          = lazy(() => import("@/pages/LeadFormPage").then(m => ({ default: m.LeadFormPage })));
const CrmPage               = lazy(() => import("@/pages/public-dashboard/CrmPage").then(m => ({ default: m.CrmPage })));
const CrmPipelinePage       = lazy(() => import("@/pages/public-dashboard/CrmPipelinePage").then(m => ({ default: m.CrmPipelinePage })));
const CrmProdutosPage       = lazy(() => import("@/pages/public-dashboard/CrmProdutosPage").then(m => ({ default: m.CrmProdutosPage })));
const AgendaMainPage        = lazy(() => import("@/pages/public-dashboard/AgendaPage").then(m => ({ default: m.AgendaPage })));
const AgendaConfigPage      = lazy(() => import("@/pages/public-dashboard/AgendaConfigPage").then(m => ({ default: m.AgendaConfigPage })));
const AgendaLinkPage        = lazy(() => import("@/pages/public-dashboard/AgendaLinkPage").then(m => ({ default: m.AgendaLinkPage })));
const WhatsAppTemplatesPage = lazy(() => import("@/pages/public-dashboard/WhatsAppTemplatesPage").then(m => ({ default: m.WhatsAppTemplatesPage })));
const BookingActionPage     = lazy(() => import("@/pages/BookingActionPage").then(m => ({ default: m.BookingActionPage })));
const CrmCamposPage         = lazy(() => import("@/pages/public-dashboard/CrmCamposPage").then(m => ({ default: m.CrmCamposPage })));
// ── Módulo Mensagens ──────────────────────────────────────────────────────────
const MensagensPage          = lazy(() => import("@/pages/public-dashboard/MensagensPage").then(m => ({ default: m.MensagensPage })));
const MensagensHistoricoPage = lazy(() => import("@/pages/public-dashboard/MensagensHistoricoPage").then(m => ({ default: m.MensagensHistoricoPage })));
// ── Módulo Chatbot ────────────────────────────────────────────────────────────
const ChatbotCanaisPage       = lazy(() => import("@/pages/public-dashboard/ChatbotCanaisPage").then(m => ({ default: m.ChatbotCanaisPage })));
const ChatbotAgentePage       = lazy(() => import("@/pages/public-dashboard/ChatbotAgentePage").then(m => ({ default: m.ChatbotAgentePage })));
const ChatbotConhecimentoPage = lazy(() => import("@/pages/public-dashboard/ChatbotConhecimentoPage").then(m => ({ default: m.ChatbotConhecimentoPage })));
const ChatbotFluxosPage       = lazy(() => import("@/pages/public-dashboard/ChatbotFluxosPage").then(m => ({ default: m.ChatbotFluxosPage })));
const PixelTestPage           = lazy(() => import("@/pages/PixelTestPage"));
// ── Meta App Review ───────────────────────────────────────────────────────────
const MetaReviewIndexPage        = lazy(() => import("@/pages/meta-review/MetaReviewIndexPage").then(m => ({ default: m.MetaReviewIndexPage })));
const FacebookLoginDemoPage      = lazy(() => import("@/pages/meta-review/facebook/FacebookLoginDemoPage").then(m => ({ default: m.FacebookLoginDemoPage })));
const FacebookPagesHubPage       = lazy(() => import("@/pages/meta-review/facebook/FacebookPagesHubPage").then(m => ({ default: m.FacebookPagesHubPage })));
const PagesShowListPage          = lazy(() => import("@/pages/meta-review/facebook/PagesShowListPage").then(m => ({ default: m.PagesShowListPage })));
const PagesReadEngagementPage    = lazy(() => import("@/pages/meta-review/facebook/PagesReadEngagementPage").then(m => ({ default: m.PagesReadEngagementPage })));
const PagesReadUserContentPage   = lazy(() => import("@/pages/meta-review/facebook/PagesReadUserContentPage").then(m => ({ default: m.PagesReadUserContentPage })));
const PagesManageMetadataPage    = lazy(() => import("@/pages/meta-review/facebook/PagesManageMetadataPage").then(m => ({ default: m.PagesManageMetadataPage })));
const PagesManageEngagementPage  = lazy(() => import("@/pages/meta-review/facebook/PagesManageEngagementPage").then(m => ({ default: m.PagesManageEngagementPage })));
const PagesMessagingPage         = lazy(() => import("@/pages/meta-review/facebook/PagesMessagingPage").then(m => ({ default: m.PagesMessagingPage })));
// ── Meta App Review — Instagram (Fase B) ─────────────────────────────────────
const InstagramFacebookLoginHubPage  = lazy(() => import("@/pages/meta-review/instagram/InstagramFacebookLoginHubPage").then(m => ({ default: m.InstagramFacebookLoginHubPage })));
const InstagramBasicPage             = lazy(() => import("@/pages/meta-review/instagram/InstagramBasicPage").then(m => ({ default: m.InstagramBasicPage })));
const InstagramManageCommentsPage    = lazy(() => import("@/pages/meta-review/instagram/InstagramManageCommentsPage").then(m => ({ default: m.InstagramManageCommentsPage })));
const InstagramManageMessagesPage    = lazy(() => import("@/pages/meta-review/instagram/InstagramManageMessagesPage").then(m => ({ default: m.InstagramManageMessagesPage })));
const InstagramLoginHubPage          = lazy(() => import("@/pages/meta-review/instagram/InstagramLoginHubPage").then(m => ({ default: m.InstagramLoginHubPage })));
const InstagramBusinessBasicPage     = lazy(() => import("@/pages/meta-review/instagram/InstagramBusinessBasicPage").then(m => ({ default: m.InstagramBusinessBasicPage })));
const InstagramBusinessMessagesPage  = lazy(() => import("@/pages/meta-review/instagram/InstagramBusinessMessagesPage").then(m => ({ default: m.InstagramBusinessMessagesPage })));
const InstagramBusinessCommentsPage  = lazy(() => import("@/pages/meta-review/instagram/InstagramBusinessCommentsPage").then(m => ({ default: m.InstagramBusinessCommentsPage })));
// ── Meta App Review — Fase C ─────────────────────────────────────────────────
const WhatsAppReviewHubPage  = lazy(() => import("@/pages/meta-review/whatsapp/WhatsAppReviewHubPage").then(m => ({ default: m.WhatsAppReviewHubPage })));
const WhatsAppManagementPage = lazy(() => import("@/pages/meta-review/whatsapp/WhatsAppManagementPage").then(m => ({ default: m.WhatsAppManagementPage })));
const WhatsAppMessagingPage  = lazy(() => import("@/pages/meta-review/whatsapp/WhatsAppMessagingPage").then(m => ({ default: m.WhatsAppMessagingPage })));
const HumanAgentPage         = lazy(() => import("@/pages/meta-review/human-agent/HumanAgentPage").then(m => ({ default: m.HumanAgentPage })));
const AnalyticsAdsPage       = lazy(() => import("@/pages/meta-review/analytics/AnalyticsAdsPage").then(m => ({ default: m.AnalyticsAdsPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0F172A]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PendingAuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <DynamicFavicon />
              <DynamicTitle />
              <UserPreferencesProvider>
                <Routes>

                  {/* ── Admin Login ── */}
                  <Route path="/admin/login" element={<LoginPage />} />
                  <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
                  <Route path="/set-password" element={<SetPasswordPage />} />
                  <Route path="/profile-setup" element={<ProtectedRoute><ProfileSetupPage /></ProtectedRoute>} />

                  {/* ── Timeclock ── */}
                  <Route path="/timeclock/entry"  element={<ProtectedRoute><TimeclockEntryPage /></ProtectedRoute>} />
                  <Route path="/timeclock/locked" element={<ProtectedRoute><TimeClockLockedPage /></ProtectedRoute>} />

                  {/* ── Admin Shell (AppLayout) ── */}
                  <Route element={<ProtectedRoute><TimeclockGuard><AppLayout /></TimeclockGuard></ProtectedRoute>}>
                    <Route path="/timeclock/punch" element={<TimeClockPunchPage />} />
                    <Route path="/team/me"         element={<MyProfilePage />} />
                    <Route element={<ModuleGuard />}>
                      <Route path="/"                    element={<DashboardPage />} />
                      <Route path="/performance"         element={<Navigate to="/?tab=performance" replace />} />
                      <Route path="/kanban"              element={<LeadsKanbanPage />} />
                      <Route path="/leads"               element={<Navigate to="/kanban" replace />} />
                      <Route path="/listas"              element={<Navigate to="/kanban?tab=listas" replace />} />
                      <Route path="/leads-pending"       element={<Navigate to="/kanban?tab=pendentes" replace />} />
                      <Route path="/closers-performance" element={<Navigate to="/kanban?tab=performance" replace />} />
                      <Route path="/clients"             element={<ClientsPage />} />
                      <Route path="/clients/:clientId"   element={<ClientsPage />} />
                      <Route path="/integrations"        element={<IntegrationsPage />} />
                      <Route path="/suppliers"           element={<SuppliersModulePage />} />
                      <Route path="/financial"           element={<FinancialPage />} />
                      <Route path="/agenda"              element={<Agenda />} />
                      <Route path="/projects"            element={<ProjectsPage />} />
                      <Route path="/projects/:projectId" element={<ProjectDetailsPage />} />
                      <Route path="/goals"               element={<GoalsPage />} />
                      <Route path="/whatsapp"            element={<WhatsApp />} />
                      <Route path="/meetings"            element={<Navigate to="/" replace />} />
                      <Route path="/team"                element={<TeamPage />} />
                      <Route path="/team/360"            element={<Avaliacao360Page />} />
                      <Route path="/team/edit/:id"       element={<EditCollaboratorPage />} />
                      <Route path="/team/employees/:profileId" element={<TeamPage />} />
                      <Route path="/campaign-reports"    element={<CampaignReports />} />
                      <Route path="/general-reports"     element={<GeneralReports />} />
                      <Route path="/reports"             element={<ReportsPage />} />
                      <Route path="/sales-analytics"     element={<SalesDashboardPage />} />
                      <Route path="/audit"               element={<AuditPage />} />
                      <Route path="/fiscal"              element={<Navigate to="/financial?tab=nfse" replace />} />
                      <Route path="/recruitment"         element={<Navigate to="/team" replace />} />
                      <Route path="/authorizations"      element={<AuthorizationsPage />} />
                      <Route path="/c8control"           element={<C8ControlPage />} />
                      <Route path="/settings"            element={<SettingsPage />} />
                      {/* ── Flow Builder ── */}
                      <Route path="/flow-builder"        element={<Suspense fallback={<PageLoader />}><FlowBuilderPage /></Suspense>} />
                      {/* ── Comercial ── */}
                      <Route path="/comercial/propostas"        element={<PropostasPage />} />
                      <Route path="/comercial/propostas/nova"   element={<Suspense fallback={<PageLoader />}><PropostaWizardPage /></Suspense>} />
                      <Route path="/comercial/propostas/:id"    element={<Suspense fallback={<PageLoader />}><PropostaEditorPage /></Suspense>} />
                      <Route path="/comercial/propostas/:id/detalhes" element={<Suspense fallback={<PageLoader />}><PropostaDetalhesPage /></Suspense>} />
                      <Route path="/comercial/dashboard"        element={<Suspense fallback={<PageLoader />}><ComercialDashboardPage /></Suspense>} />
                      <Route path="/comercial/configuracoes/contratos" element={<Suspense fallback={<PageLoader />}><ContractTemplatePage /></Suspense>} />
                      {/* ── Content Operations (admin) ── */}
                      <Route path="/content"                   element={<Suspense fallback={<PageLoader />}><ContentIndexPage /></Suspense>} />
                      <Route path="/content/cliente/:clientId" element={<Suspense fallback={<PageLoader />}><ContentClientPage /></Suspense>} />
                      <Route path="/content/itens"             element={<Suspense fallback={<PageLoader />}><ContentItensPage /></Suspense>} />
                      <Route path="/content/itens/:itemId"     element={<Suspense fallback={<PageLoader />}><ContentItemDetailPage /></Suspense>} />
                      <Route path="/content/campanhas"         element={<Suspense fallback={<PageLoader />}><ContentCampanhasPage /></Suspense>} />
                      <Route path="/content/planejamento"      element={<Suspense fallback={<PageLoader />}><ContentPlanejamentoPage /></Suspense>} />
                      <Route path="/content/briefing"          element={<Suspense fallback={<PageLoader />}><ContentBriefingPage /></Suspense>} />
                      <Route path="/content/entregaveis"       element={<Suspense fallback={<PageLoader />}><ContentEntregaveisPage /></Suspense>} />
                      <Route path="/content/parceiros"         element={<Suspense fallback={<PageLoader />}><ContentParceirosPage /></Suspense>} />
                    </Route>
                  </Route>

                  {/* ── Maestr.IA — Login (por slug ou por e-mail) ── */}
                  <Route path="/login"               element={<PublicDashboardLoginPage />} />
                  <Route path="/:slug/login"         element={<PublicDashboardLoginPage />} />
                  <Route path="/:slug/set-password"  element={<DashboardSetPasswordPage />} />

                  {/* ── Maestr.IA — Rotas públicas sem autenticação ── */}
                  <Route path="/booking/:slug"                   element={<BookingPage />} />
                  <Route path="/booking/:slug/action/:token"     element={<Suspense fallback={<PageLoader />}><BookingActionPage /></Suspense>} />
                  <Route path="/form/:slug/:formSlug"            element={<Suspense fallback={<PageLoader />}><LeadFormPage /></Suspense>} />
                  <Route path="/pixel-test/:slug"                element={<Suspense fallback={<PageLoader />}><PixelTestPage /></Suspense>} />
                  <Route path="/r"                               element={<RedirectPage />} />
                  <Route path="/google-calendar-callback"        element={<GoogleCalendarCallbackPage />} />
                  <Route path="/oauth/callback"                  element={<OAuthCallbackPage />} />
                  <Route path="/vagas/*"                         element={<PublicVagasRouter />} />

                  {/* ── Maestr.IA — Dashboard do cliente ── */}
                  <Route path="/:slug" element={<PublicDashboardLayout />}>
                    <Route index element={<Suspense fallback={<PageLoader />}><DashboardGeralPage /></Suspense>} />
                    <Route path="performance"   element={<Suspense fallback={<PageLoader />}><PerformancePage /></Suspense>} />
                    <Route path="atendimento"   element={<Suspense fallback={<PageLoader />}><AtendimentoPage /></Suspense>} />
                    <Route path="agenda"        element={<Suspense fallback={<PageLoader />}><AgendaMainPage /></Suspense>} />
                    <Route path="promocoes"     element={<Suspense fallback={<PageLoader />}><PromocoesPage /></Suspense>} />
                    <Route path="sugestoes"     element={<Suspense fallback={<PageLoader />}><SugestoesPage /></Suspense>} />
                    <Route path="avisos"        element={<Suspense fallback={<PageLoader />}><AvisosPage /></Suspense>} />
                    <Route path="eventos"       element={<Suspense fallback={<PageLoader />}><EventosPage /></Suspense>} />
                    <Route path="configuracoes" element={<Suspense fallback={<PageLoader />}><ConfiguracoesPage /></Suspense>} />
                    <Route path="crm"           element={<Suspense fallback={<PageLoader />}><CrmPage /></Suspense>} />
                    <Route path="crm/clientes"  element={<Suspense fallback={<PageLoader />}><CrmPage /></Suspense>} />
                    <Route path="crm/pipeline"  element={<Suspense fallback={<PageLoader />}><CrmPipelinePage /></Suspense>} />
                    <Route path="crm/produtos"  element={<Suspense fallback={<PageLoader />}><CrmProdutosPage /></Suspense>} />
                    <Route path="crm/campos"    element={<Suspense fallback={<PageLoader />}><CrmCamposPage /></Suspense>} />
                    <Route path="whatsapp"      element={<Suspense fallback={<PageLoader />}><ChatbotCanaisPage /></Suspense>} />
                    {/* ── Mensagens ── */}
                    <Route path="mensagens"           element={<Suspense fallback={<PageLoader />}><MensagensPage /></Suspense>} />
                    <Route path="mensagens/historico" element={<Suspense fallback={<PageLoader />}><MensagensHistoricoPage /></Suspense>} />
                    <Route path="mensagens/templates" element={<Suspense fallback={<PageLoader />}><WhatsAppTemplatesPage /></Suspense>} />
                    {/* ── Chatbot ── */}
                    <Route path="chatbot/canais"       element={<Suspense fallback={<PageLoader />}><ChatbotCanaisPage /></Suspense>} />
                    <Route path="chatbot/agente"       element={<Suspense fallback={<PageLoader />}><ChatbotAgentePage /></Suspense>} />
                    <Route path="chatbot/conhecimento" element={<Suspense fallback={<PageLoader />}><ChatbotConhecimentoPage /></Suspense>} />
                    <Route path="chatbot/fluxos"       element={<Suspense fallback={<PageLoader />}><ChatbotFluxosPage /></Suspense>} />
                    {/* ── Content Operations (cliente) ── */}
                    <Route path="conteudo"              element={<Suspense fallback={<PageLoader />}><ContentPortalIndexPage /></Suspense>} />
                    <Route path="conteudo/aprovacoes"   element={<Suspense fallback={<PageLoader />}><ContentApprovalsPage /></Suspense>} />
                    <Route path="conteudo/calendario"   element={<Suspense fallback={<PageLoader />}><ContentCalendarClientPage /></Suspense>} />
                    <Route path="conteudo/briefings"    element={<Suspense fallback={<PageLoader />}><ContentBriefingsClientPage /></Suspense>} />
                    <Route path="conteudo/entregaveis"  element={<Suspense fallback={<PageLoader />}><ContentDeliverablesClientPage /></Suspense>} />
                    <Route path="configuracoes/usuarios"             element={<Suspense fallback={<PageLoader />}><ConfigUsuariosPage /></Suspense>} />
                    <Route path="configuracoes/integracoes"          element={<Suspense fallback={<PageLoader />}><ConfigIntegracoesPage /></Suspense>} />
                    <Route path="configuracoes/integracoes/testes"   element={<Suspense fallback={<PageLoader />}><TrackingTestPage /></Suspense>} />
                    <Route path="configuracoes/formularios"          element={<Suspense fallback={<PageLoader />}><FormsConfigPage /></Suspense>} />
                    <Route path="configuracoes/pagamentos"           element={<Suspense fallback={<PageLoader />}><ConfigPagamentosPage /></Suspense>} />
                    <Route path="agenda/configuracoes"  element={<Suspense fallback={<PageLoader />}><AgendaConfigPage /></Suspense>} />
                    <Route path="agenda/link"           element={<Suspense fallback={<PageLoader />}><AgendaLinkPage /></Suspense>} />
                    {/* ── Meta App Review ── */}
                    <Route path="meta-review"                                element={<Suspense fallback={<PageLoader />}><MetaReviewIndexPage /></Suspense>} />
                    <Route path="meta-review/facebook-login"                 element={<Suspense fallback={<PageLoader />}><FacebookLoginDemoPage /></Suspense>} />
                    <Route path="meta-review/facebook"                       element={<Suspense fallback={<PageLoader />}><FacebookPagesHubPage /></Suspense>} />
                    <Route path="meta-review/pages-show-list"                element={<Suspense fallback={<PageLoader />}><PagesShowListPage /></Suspense>} />
                    <Route path="meta-review/pages-read-engagement"          element={<Suspense fallback={<PageLoader />}><PagesReadEngagementPage /></Suspense>} />
                    <Route path="meta-review/pages-read-user-content"        element={<Suspense fallback={<PageLoader />}><PagesReadUserContentPage /></Suspense>} />
                    <Route path="meta-review/pages-manage-metadata"          element={<Suspense fallback={<PageLoader />}><PagesManageMetadataPage /></Suspense>} />
                    <Route path="meta-review/pages-manage-engagement"        element={<Suspense fallback={<PageLoader />}><PagesManageEngagementPage /></Suspense>} />
                    <Route path="meta-review/pages-messaging"                element={<Suspense fallback={<PageLoader />}><PagesMessagingPage /></Suspense>} />
                    <Route path="meta-review/instagram-facebook-login"                   element={<Suspense fallback={<PageLoader />}><InstagramFacebookLoginHubPage /></Suspense>} />
                    <Route path="meta-review/instagram-facebook-login/basic"             element={<Suspense fallback={<PageLoader />}><InstagramBasicPage /></Suspense>} />
                    <Route path="meta-review/instagram-facebook-login/comments"          element={<Suspense fallback={<PageLoader />}><InstagramManageCommentsPage /></Suspense>} />
                    <Route path="meta-review/instagram-facebook-login/messages"          element={<Suspense fallback={<PageLoader />}><InstagramManageMessagesPage /></Suspense>} />
                    <Route path="meta-review/instagram-login"                            element={<Suspense fallback={<PageLoader />}><InstagramLoginHubPage /></Suspense>} />
                    <Route path="meta-review/instagram-login/basic"                      element={<Suspense fallback={<PageLoader />}><InstagramBusinessBasicPage /></Suspense>} />
                    <Route path="meta-review/instagram-login/messages"                   element={<Suspense fallback={<PageLoader />}><InstagramBusinessMessagesPage /></Suspense>} />
                    <Route path="meta-review/instagram-login/comments"                   element={<Suspense fallback={<PageLoader />}><InstagramBusinessCommentsPage /></Suspense>} />
                    <Route path="meta-review/whatsapp"            element={<Suspense fallback={<PageLoader />}><WhatsAppReviewHubPage /></Suspense>} />
                    <Route path="meta-review/whatsapp/management" element={<Suspense fallback={<PageLoader />}><WhatsAppManagementPage /></Suspense>} />
                    <Route path="meta-review/whatsapp/messaging"  element={<Suspense fallback={<PageLoader />}><WhatsAppMessagingPage /></Suspense>} />
                    <Route path="meta-review/human-agent"         element={<Suspense fallback={<PageLoader />}><HumanAgentPage /></Suspense>} />
                    <Route path="meta-review/analytics-ads"       element={<Suspense fallback={<PageLoader />}><AnalyticsAdsPage /></Suspense>} />
                  </Route>

                  {/* ── Fallback ── */}
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
