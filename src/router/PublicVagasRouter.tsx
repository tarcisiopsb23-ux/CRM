import { Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const VagasPage = lazy(() => import("@/pages/VagasPage"));
const VagaDetailPage = lazy(() => import("@/pages/VagaDetailPage"));

function PageLoader() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#f97316" }} />
    </div>
  );
}

export function PublicVagasRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<VagasPage />} />
        <Route path="/:jobOpeningId" element={<VagaDetailPage />} />
      </Routes>
    </Suspense>
  );
}
