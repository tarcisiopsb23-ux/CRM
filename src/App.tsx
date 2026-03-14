import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ModuleGuard } from "@/components/auth/ModuleGuard";
import { TimeclockGuard } from "@/components/auth/TimeclockGuard";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { CompleteRegistrationPage } from "@/pages/CompleteRegistrationPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadsKanbanPage } from "./pages/LeadsKanbanPage";
import ClientsPage from "./pages/ClientsPage";
import FinancialPage from "./pages/FinancialPage";
import Agenda from "./pages/Agenda";
import ProjectsPage from "./pages/ProjectsPage";
import { ProjectDetailsPage } from "./pages/ProjectDetailsPage";
import GoalsPage from "./pages/GoalsPage";
import WhatsApp from "./pages/WhatsApp";
import Meetings from "./pages/Meetings";
import TeamPage from "./pages/TeamPage";
import CampaignReports from "./pages/CampaignReports";
import GeneralReports from "./pages/GeneralReports";
import { SalesDashboardPage } from "./pages/SalesDashboardPage";
import AuditPage from "./pages/AuditPage";
import NotFound from "./pages/NotFound";
import ReportsPage from "./pages/ReportsPage";
import { TimeClockPunchPage } from "./pages/TimeClockPunchPage";
import { TimeClockLockedPage } from "./pages/TimeClockLockedPage";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
              <Route path="/login" element={<LoginPage />} />
              <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <TimeclockGuard>
                      <AppLayout />
                    </TimeclockGuard>
                  </ProtectedRoute>
                }
              >
                <Route element={<ModuleGuard />}>
                  <Route path="/timeclock/punch" element={<TimeClockPunchPage />} />
                  <Route path="/timeclock/locked" element={<TimeClockLockedPage />} />
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/kanban" element={<LeadsKanbanPage />} />
                  <Route path="/leads" element={<Navigate to="/kanban" replace />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/clients/:clientId" element={<ClientsPage />} />
                  <Route path="/suppliers" element={<Navigate to="/financial?tab=suppliers" replace />} />
                  <Route path="/financial" element={<FinancialPage />} />
                  <Route path="/agenda" element={<Agenda />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailsPage />} />
                  <Route path="/goals" element={<GoalsPage />} />
                  <Route path="/whatsapp" element={<WhatsApp />} />
                  <Route path="/meetings" element={<Meetings />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/team/employees/:profileId" element={<TeamPage />} />
                  <Route path="/campaign-reports" element={<CampaignReports />} />
                  <Route path="/general-reports" element={<GeneralReports />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/sales-analytics" element={<SalesDashboardPage />} />
                  <Route
                    path="/audit"
                    element={
                      <ProtectedRoute requireRole="manager">
                        <AuditPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute requireRole="admin">
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
