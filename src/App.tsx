/**
 * App.tsx - C8 Control (build independente)
 *
 * Dominio de producao: app.c8control.com.br
 * Banco: Banco A (owwaulaenabbdalycusx) - compartilhado com Maestr.ia
 *
 * Rotas:
 *   /                      -> redireciona para /login
 *   /login                 -> login por e-mail (lookup automatico de slug)
 *   /:slug                 -> dashboard do cliente (index)
 *   /:slug/crm             -> CRM
 *   /:slug/agenda          -> Agenda
 *   /:slug/*               -> demais sub-rotas
 *   /:slug/login           -> login alternativo com slug explicito na URL
 *   /booking/:slug         -> agendamento publico (sem login)
 *   /form/:slug/:formSlug  -> formulario de leads publico (sem login)
 *   /r                     -> redirect rapido (UTMs)
 *   /google-calendar-callback -> OAuth Google Calendar
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";

import { PublicDashboardLayout }  from "@/pages/public-dashboard/PublicDashboardLayout";
import { PublicDashboardLoginPage } from "@/pages/PublicDashboardLoginPage";
import { RedirectPage }           from "@/pages/public-dashboard/RedirectPage";
import { SetPasswordPage as DashboardSetPasswordPage } from "@/pages/public-dashboard/SetPasswordPage";
import { GoogleCalendarCallbackPage } from "@/pages/public-dashboard/GoogleCalendarCallbackPage";
import BookingPage from "@/pages/BookingPage";
import { OAuthCallbackPage } from "@/pages/OAuthCallbackPage";

// --- Lazy pages --------------------------------------------------------------
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
const CrmCamposPage         = lazy(() => import("@/pages/public-dashboard/CrmCamposPage").then(m => ({ default: m.CrmCamposPage })));
// ── Módulo Mensagens ──────────────────────────────────────────────────────────
const MensagensPage            = lazy(() => import("@/pages/public-dashboard/MensagensPage").then(m => ({ default: m.MensagensPage })));
const MensagensHistoricoPage   = lazy(() => import("@/pages/public-dashboard/MensagensHistoricoPage").then(m => ({ default: m.MensagensHistoricoPage })));
// ── Módulo Chatbot ────────────────────────────────────────────────────────────
const ChatbotCanaisPage        = lazy(() => import("@/pages/public-dashboard/ChatbotCanaisPage").then(m => ({ default: m.ChatbotCanaisPage })));
const ChatbotAgentePage        = lazy(() => import("@/pages/public-dashboard/ChatbotAgentePage").then(m => ({ default: m.ChatbotAgentePage })));
const ChatbotConhecimentoPage  = lazy(() => import("@/pages/public-dashboard/ChatbotConhecimentoPage").then(m => ({ default: m.ChatbotConhecimentoPage })));
const PixelTestPage            = lazy(() => import("@/pages/PixelTestPage"));
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
const WhatsAppReviewHubPage    = lazy(() => import("@/pages/meta-review/whatsapp/WhatsAppReviewHubPage").then(m => ({ default: m.WhatsAppReviewHubPage })));
const WhatsAppManagementPage   = lazy(() => import("@/pages/meta-review/whatsapp/WhatsAppManagementPage").then(m => ({ default: m.WhatsAppManagementPage })));
const WhatsAppMessagingPage    = lazy(() => import("@/pages/meta-review/whatsapp/WhatsAppMessagingPage").then(m => ({ default: m.WhatsAppMessagingPage })));
const HumanAgentPage           = lazy(() => import("@/pages/meta-review/human-agent/HumanAgentPage").then(m => ({ default: m.HumanAgentPage })));
const AnalyticsAdsPage         = lazy(() => import("@/pages/meta-review/analytics/AnalyticsAdsPage").then(m => ({ default: m.AnalyticsAdsPage })));

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
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <UserPreferencesProvider>
            <Routes>

              {/* -- Raiz -> login -- */}
              <Route path="/" element={<Navigate to="/login" replace />} />

              {/* -- Login principal - slug resolvido pelo e-mail -- */}
              <Route path="/login" element={<PublicDashboardLoginPage />} />

              {/* -- Rotas publicas sem autenticacao -- */}
              <Route path="/booking/:slug"              element={<BookingPage />} />
              <Route path="/form/:slug/:formSlug"       element={<Suspense fallback={<PageLoader />}><LeadFormPage /></Suspense>} />
              <Route path="/pixel-test/:slug"           element={<Suspense fallback={<PageLoader />}><PixelTestPage /></Suspense>} />
              <Route path="/r"                          element={<RedirectPage />} />
              <Route path="/google-calendar-callback"   element={<GoogleCalendarCallbackPage />} />
              <Route path="/oauth/callback"             element={<OAuthCallbackPage />} />

              {/* -- Login/set-password com slug explicito -- */}
              <Route path="/:slug/login"        element={<PublicDashboardLoginPage />} />
              <Route path="/:slug/set-password" element={<DashboardSetPasswordPage />} />

              {/* -- Dashboard do cliente -- */}
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
                <Route path="mensagens"              element={<Suspense fallback={<PageLoader />}><MensagensPage /></Suspense>} />
                <Route path="mensagens/historico"    element={<Suspense fallback={<PageLoader />}><MensagensHistoricoPage /></Suspense>} />
                {/* ── Chatbot ── */}
                <Route path="chatbot/canais"         element={<Suspense fallback={<PageLoader />}><ChatbotCanaisPage /></Suspense>} />
                <Route path="chatbot/agente"         element={<Suspense fallback={<PageLoader />}><ChatbotAgentePage /></Suspense>} />
                <Route path="chatbot/conhecimento"   element={<Suspense fallback={<PageLoader />}><ChatbotConhecimentoPage /></Suspense>} />
                <Route path="configuracoes/usuarios"              element={<Suspense fallback={<PageLoader />}><ConfigUsuariosPage /></Suspense>} />
                <Route path="configuracoes/integracoes"           element={<Suspense fallback={<PageLoader />}><ConfigIntegracoesPage /></Suspense>} />
                <Route path="configuracoes/integracoes/testes"    element={<Suspense fallback={<PageLoader />}><TrackingTestPage /></Suspense>} />
                <Route path="configuracoes/formularios"           element={<Suspense fallback={<PageLoader />}><FormsConfigPage /></Suspense>} />
                <Route path="configuracoes/pagamentos"            element={<Suspense fallback={<PageLoader />}><ConfigPagamentosPage /></Suspense>} />
                <Route path="agenda/configuracoes" element={<Suspense fallback={<PageLoader />}><AgendaConfigPage /></Suspense>} />
                <Route path="agenda/link"          element={<Suspense fallback={<PageLoader />}><AgendaLinkPage /></Suspense>} />
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
                {/* ── Meta App Review — Grupo 3: Instagram via Facebook Login ── */}
                <Route path="meta-review/instagram-facebook-login"                    element={<Suspense fallback={<PageLoader />}><InstagramFacebookLoginHubPage /></Suspense>} />
                <Route path="meta-review/instagram-facebook-login/basic"              element={<Suspense fallback={<PageLoader />}><InstagramBasicPage /></Suspense>} />
                <Route path="meta-review/instagram-facebook-login/comments"           element={<Suspense fallback={<PageLoader />}><InstagramManageCommentsPage /></Suspense>} />
                <Route path="meta-review/instagram-facebook-login/messages"           element={<Suspense fallback={<PageLoader />}><InstagramManageMessagesPage /></Suspense>} />
                {/* ── Meta App Review — Grupo 4: Instagram Login direto ── */}
                <Route path="meta-review/instagram-login"                             element={<Suspense fallback={<PageLoader />}><InstagramLoginHubPage /></Suspense>} />
                <Route path="meta-review/instagram-login/basic"                       element={<Suspense fallback={<PageLoader />}><InstagramBusinessBasicPage /></Suspense>} />
                <Route path="meta-review/instagram-login/messages"                    element={<Suspense fallback={<PageLoader />}><InstagramBusinessMessagesPage /></Suspense>} />
                <Route path="meta-review/instagram-login/comments"                    element={<Suspense fallback={<PageLoader />}><InstagramBusinessCommentsPage /></Suspense>} />
                {/* ── Meta App Review — Grupo 5: WhatsApp ── */}
                <Route path="meta-review/whatsapp"              element={<Suspense fallback={<PageLoader />}><WhatsAppReviewHubPage /></Suspense>} />
                <Route path="meta-review/whatsapp/management"   element={<Suspense fallback={<PageLoader />}><WhatsAppManagementPage /></Suspense>} />
                <Route path="meta-review/whatsapp/messaging"    element={<Suspense fallback={<PageLoader />}><WhatsAppMessagingPage /></Suspense>} />
                {/* ── Meta App Review — Grupo 6: Human Agent ── */}
                <Route path="meta-review/human-agent"           element={<Suspense fallback={<PageLoader />}><HumanAgentPage /></Suspense>} />
                {/* ── Meta App Review — Grupo 8: Analytics/Ads ── */}
                <Route path="meta-review/analytics-ads"         element={<Suspense fallback={<PageLoader />}><AnalyticsAdsPage /></Suspense>} />
              </Route>

              {/* -- Fallback -- */}
              <Route path="*" element={<Navigate to="/login" replace />} />

            </Routes>
          </UserPreferencesProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
