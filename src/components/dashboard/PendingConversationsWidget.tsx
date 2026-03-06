import { DashboardWidget } from "./DashboardWidget";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface ConvItem {
  id: string;
  status: string;
  last_message_at: string | null;
  contact?: { phone?: string; name?: string } | null;
}

interface PendingConversationsWidgetProps {
  count: number;
  items: ConvItem[];
  loading?: boolean;
}

export function PendingConversationsWidget({
  count,
  items,
  loading,
}: PendingConversationsWidgetProps) {
  if (loading) {
    return (
      <DashboardWidget title="Conversas Pendentes (Humanas)">
        <div className="h-20 flex items-center justify-center text-gray-400">
          Carregando...
        </div>
      </DashboardWidget>
    );
  }
  return (
    <DashboardWidget title="Conversas Pendentes (Humanas)">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-primary">{count}</span>
          {count > 0 && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/kanban">Ver Kanban</Link>
            </Button>
          )}
        </div>
        {items.length > 0 && (
          <ul className="text-sm text-gray-600 space-y-1 max-h-24 overflow-y-auto">
            {items.slice(0, 5).map((c) => (
              <li key={c.id} className="truncate">
                {c.contact?.name ?? c.contact?.phone ?? "Contato"} •{" "}
                <span
                  className={
                    c.status === "em_atendimento"
                      ? "text-amber-600"
                      : "text-gray-500"
                  }
                >
                  {c.status === "em_atendimento" ? "Em atendimento" : "Aberta"}
                </span>
              </li>
            ))}
            {items.length > 5 && (
              <li className="text-gray-400">+{items.length - 5} mais</li>
            )}
          </ul>
        )}
      </div>
    </DashboardWidget>
  );
}
