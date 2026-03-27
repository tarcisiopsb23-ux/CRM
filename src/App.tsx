import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { PublicDashboardLoginPage } from "@/pages/PublicDashboardLoginPage";
import { PublicDashboardPage } from "@/pages/PublicDashboardPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { CsvImportPage } from "@/pages/CsvImportPage";
import { CrmPage } from "@/pages/CrmPage";
import { CatalogPage } from "@/pages/CatalogPage";
import { WhatsAppSyncPage } from "@/pages/WhatsAppSyncPage";
import { WhatsAppRedirectPage } from "@/pages/WhatsAppRedirectPage";

const queryClient = new QueryClient();

export function ProtectedRoute() {
  try {
    const raw = localStorage.getItem("client_auth");
    if (!raw) return <Navigate to="/login" replace />;
    const session = JSON.parse(raw);
    if (!session?.client_id) return <Navigate to="/login" replace />;
  } catch {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<PublicDashboardLoginPage />} />

          {/* Rotas protegidas */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<PublicDashboardPage />} />
            <Route path="/dashboard/profile" element={<ProfilePage />} />
            <Route path="/dashboard/import" element={<CsvImportPage />} />
            <Route path="/dashboard/catalog" element={<CatalogPage />} />
            <Route path="/dashboard/whatsapp-sync" element={<WhatsAppSyncPage />} />
          </Route>

          {/* CRM standalone */}
          <Route path="/crm" element={<CrmPage />} />

          {/* Redirect de anúncios — captura UTMs e redireciona para WhatsApp */}
          <Route path="/wa" element={<WhatsAppRedirectPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
