import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SuppliersDashboardTab } from "@/components/suppliers/SuppliersDashboardTab";
import SuppliersPage from "@/pages/SuppliersPage";
import { SupplierExpensesView } from "@/components/suppliers/SupplierExpensesView";

type TabValue = "dashboard" | "cadastro" | "financeiro";

const VALID_TABS = new Set<TabValue>(["dashboard", "cadastro", "financeiro"]);

export default function SuppliersModulePage() {
  const organizationId = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab = useMemo<TabValue>(
    () => (tabParam && VALID_TABS.has(tabParam as TabValue) ? (tabParam as TabValue) : "cadastro"),
    [tabParam]
  );

  const setTab = (next: TabValue) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Fornecedores</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie fornecedores, despesas e visualize métricas consolidadas.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabValue)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <SuppliersDashboardTab organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="cadastro">
          <SuppliersPage />
        </TabsContent>

        <TabsContent value="financeiro">
          <SupplierExpensesView organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
