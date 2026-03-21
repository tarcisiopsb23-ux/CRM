import { useKanbanFunnel } from "@/hooks/useDashboard";
import { useOrganization } from "@/hooks/useOrganization";
import { KanbanFunnelWidget } from "./KanbanFunnelWidget";

export function FunnelChart() {
  const organizationId = useOrganization();
  const { data = [], isLoading } = useKanbanFunnel(organizationId);

  return <KanbanFunnelWidget data={data} loading={isLoading} />;
}
