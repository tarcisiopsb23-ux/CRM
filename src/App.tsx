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
import { OAuthCallbackPage } from "@/pages/OAuthCallbackPage";
import { TenantUsersPage } from "@/pages/TenantUsersPage";
import { DemoPage } from "@/pages/DemoPage";
import { AuditLogsPage } from "@/pages/AuditLogsPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { SupportLayout } from "@/components/auth/SupportLayout";
import { useAuth } from "@/hooks/useAuth";

const queryClient = new QueryClient();

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RootRedirect() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={session ? "/dashboard" : "/login"} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<PublicDashboardLoginPage />} />

          {/* Rotas protegidas */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<SupportLayout><PublicDashboardPage /></SupportLayout>} />
            <Route path="/dashboard/profile" element={<SupportLayout><ProfilePage /></SupportLayout>} />
            <Route path="/dashboard/import" element={<SupportLayout><CsvImportPage /></SupportLayout>} />
            <Route path="/dashboard/catalog" element={<SupportLayout><CatalogPage /></SupportLayout>} />
            <Route path="/dashboard/whatsapp-sync" element={<SupportLayout><WhatsAppSyncPage /></SupportLayout>} />
            <Route path="/dashboard/users" element={<SupportLayout><TenantUsersPage /></SupportLayout>} />
            <Route path="/dashboard/logs" element={<SupportLayout><AuditLogsPage /></SupportLayout>} />
            <Route path="/dashboard/payments" element={<SupportLayout><PaymentsPage /></SupportLayout>} />
          </Route>

          {/* CRM standalone */}
          <Route path="/crm" element={<CrmPage />} />

          {/* Demo — sem login */}
          <Route path="/demo" element={<DemoPage />} />

          {/* Redirect de anúncios — captura UTMs e redireciona para WhatsApp */}
          <Route path="/wa" element={<WhatsAppRedirectPage />} />

          {/* OAuth callback — Google e Meta */}
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
