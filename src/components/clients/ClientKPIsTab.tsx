import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings2, History, LineChart as ChartIcon, Target, TrendingUp } from "lucide-react";
import { KPIConfigs } from "./kpi-subtabs/KPIConfigs";
import { KPIPreviousHistory } from "./kpi-subtabs/KPIPreviousHistory";
import { KPIActiveMonitoring } from "./kpi-subtabs/KPIActiveMonitoring";
import { KPIGoals } from "./kpi-subtabs/KPIGoals";
import { ConversionMetrics } from "./kpi-subtabs/ConversionMetrics";
import { useContractsByClient } from "@/hooks/useContracts";
import { startOfMonth, parseISO } from "date-fns";

// ClientKPIsTab — gerenciamento de KPIs do cliente
export function ClientKPIsTab({ organizationId, clientId, clientName = "" }: { organizationId: string; clientId: string; clientName?: string }) {
  const [activeSubTab, setActiveSubTab] = useState("indicadores");
  
  // Buscar contratos para determinar a data de início (regra de negócio)
  const { data: contracts = [] } = useContractsByClient(organizationId, clientId);
  
  const contractStartDate = useMemo(() => {
    if (contracts.length === 0) return null;
    // Pega a data de início do contrato mais antigo
    const dates = contracts.map(c => parseISO(c.start_date).getTime());
    const oldest = new Date(Math.min(...dates));
    return startOfMonth(oldest);
  }, [contracts]);

  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <div className="flex items-center justify-between mb-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="indicadores" className="gap-2">
              <ChartIcon className="h-4 w-4" />
              Indicadores
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
              <History className="h-4 w-4" />
              Histórico Anterior
            </TabsTrigger>
            <TabsTrigger value="metas" className="gap-2">
              <Target className="h-4 w-4" />
              Metas
            </TabsTrigger>
            <TabsTrigger value="metricas" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Métricas de Conversão
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Configurações
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="config" className="mt-0">
          <KPIConfigs organizationId={organizationId} clientId={clientId} />
        </TabsContent>

        <TabsContent value="historico" className="mt-0">
          <KPIPreviousHistory 
            organizationId={organizationId} 
            clientId={clientId} 
            clientName={clientName ?? ""}
            contractStartDate={contractStartDate}
          />
        </TabsContent>

        <TabsContent value="metas" className="mt-0">
          <KPIGoals organizationId={organizationId} clientId={clientId} />
        </TabsContent>

        <TabsContent value="metricas" className="mt-0">
          <ConversionMetrics organizationId={organizationId} clientId={clientId} />
        </TabsContent>

        <TabsContent value="indicadores" className="mt-0">
          <KPIActiveMonitoring 
            organizationId={organizationId} 
            clientId={clientId} 
            clientName={clientName ?? ""}
            contractStartDate={contractStartDate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
