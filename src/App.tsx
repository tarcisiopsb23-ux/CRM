import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import KanbanPage from "./pages/KanbanPage";
import Leads from "./pages/Leads";
import Clients from "./pages/Clients";
import Suppliers from "./pages/Suppliers";
import Financial from "./pages/Financial";
import Agenda from "./pages/Agenda";
import Projects from "./pages/Projects";
import Goals from "./pages/Goals";
import WhatsApp from "./pages/WhatsApp";
import Meetings from "./pages/Meetings";
import SettingsPage from "./pages/SettingsPage";
import TeamPage from "./pages/TeamPage";
import CampaignReports from "./pages/CampaignReports";
import GeneralReports from "./pages/GeneralReports";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/financial" element={<Financial />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/whatsapp" element={<WhatsApp />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/campaign-reports" element={<CampaignReports />} />
            <Route path="/general-reports" element={<GeneralReports />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
