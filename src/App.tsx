import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ModuleGuard } from "@/components/auth/ModuleGuard";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { CompleteRegistrationPage } from "@/pages/CompleteRegistrationPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadsKanbanPage } from "./pages/LeadsKanbanPage";
import ClientsPage from "./pages/ClientsPage";
import SuppliersPage from "./pages/SuppliersPage";
import FinancialPage from "./pages/FinancialPage";
import Agenda from "./pages/Agenda";
import ProjectsPage from "./pages/ProjectsPage";
import GoalsPage from "./pages/GoalsPage";
import WhatsApp from "./pages/WhatsApp";
import Meetings from "./pages/Meetings";
import TeamPage from "./pages/TeamPage";
import CampaignReports from "./pages/CampaignReports";
import GeneralReports from "./pages/GeneralReports";
import { SalesDashboardPage } from "./pages/SalesDashboardPage";
import AuditPage from "./pages/AuditPage";
import NotFound from "./pages/NotFound";

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
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route element={<ModuleGuard />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/kanban" element={<LeadsKanbanPage />} />
                  <Route path="/leads" element={<Navigate to="/kanban" replace />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/suppliers" element={<SuppliersPage />} />
                  <Route path="/financial" element={<FinancialPage />} />
                  <Route path="/agenda" element={<Agenda />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/goals" element={<GoalsPage />} />
                  <Route path="/whatsapp" element={<WhatsApp />} />
                  <Route path="/meetings" element={<Meetings />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/campaign-reports" element={<CampaignReports />} />
                  <Route path="/general-reports" element={<GeneralReports />} />
                  <Route path="/sales-analytics" element={<SalesDashboardPage />} />
                  <Route
                    path="/audit"
                    element={
                      <ProtectedRoute requireRole="admin">
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
