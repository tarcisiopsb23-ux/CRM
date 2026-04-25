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
import RecruitmentPage from "@/pages/recruitment/RecruitmentPage";
import AuthorizationsPage from "@/pages/AuthorizationsPage";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

function App() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isVagasSubdomain = hostname.startsWith("vagas.");

  if (isVagasSubdomain) {
    const { PublicVagasRouter } = require("@/router/PublicVagasRouter");
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
      <UserPreferencesProvider>
        <AuthProvider>
          <PendingAuthProvider>
          <DynamicFavicon />
          <DynamicTitle />
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter
              future={{ 
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <Routes>
                {/* Rotas Públicas - Devem vir PRIMEIRO para evitar conflitos */}
                <Route path="/demo/dashboard" element={<PublicDemoDashboardPage />} />
                <Route path="/public/dashboard/:slug" element={<PublicDashboardPage />} />
                <Route path="/public/dashboard/:slug/login" element={<PublicDashboardLoginPage />} />
                <Route path="/public/dashboard/:slug/crm/login" element={<C8ControlLoginPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
                <Route path="/set-password" element={<SetPasswordPage />} />
                <Route path="/profile-setup" element={
                  <ProtectedRoute>
                    <ProfileSetupPage />
                  </ProtectedRoute>
                } />
                {/* Tela de registro de ponto — fora do AppLayout, sem sidebar */}
                <Route path="/timeclock/entry" element={
                  <ProtectedRoute>
                    <TimeclockEntryPage />
                  </ProtectedRoute>
                } />
                {/* Tela de ponto encerrado — fora do AppLayout, sem sidebar */}
                <Route path="/timeclock/locked" element={
                  <ProtectedRoute>
                    <TimeClockLockedPage />
                  </ProtectedRoute>
                } />
                <Route
                  element={ 
                    <ProtectedRoute>
                      <TimeclockGuard>
                        <AppLayout />
                      </TimeclockGuard>
                    </ProtectedRoute>
                  }
                >
                  {/* Rotas pessoais/operacionais — sem verificação de módulo */}
                  <Route path="/timeclock/punch" element={<TimeClockPunchPage />} />
                  <Route
                    path="/team/me"
                    element={<MyProfilePage />}
                  />

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
                    <Route path="/meetings" element={<Meetings />} />
                    <Route path="/team" element={<TeamPage />} />
                    <Route path="/team/360" element={<Avaliacao360Page />} />
                    <Route path="/team/edit/:id" element={<EditCollaboratorPage />} />
                    <Route path="/team/employees/:profileId" element={<TeamPage />} />
                    <Route path="/campaign-reports" element={<CampaignReports />} />
                    <Route path="/general-reports" element={<GeneralReports />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/sales-analytics" element={<SalesDashboardPage />} />
                    <Route path="/audit" element={<AuditPage />} />
                    <Route path="/fiscal" element={<FiscalPage />} />
                    <Route path="/recruitment" element={<RecruitmentPage />} />
                    <Route path="/authorizations" element={<AuthorizationsPage />} />
                    <Route path="/c8control" element={<C8ControlPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </PendingAuthProvider>
        </AuthProvider>
      </UserPreferencesProvider>
    </QueryClientProvider>
  );
}

export default App;
