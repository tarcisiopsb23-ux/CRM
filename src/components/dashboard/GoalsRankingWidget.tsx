import { DashboardWidget } from "./DashboardWidget";

interface RankItem {
  id: string;
  title: string;
  current_value: number;
  target_value: number;
  progress: number;
  team_name?: string | null;
  profile_name?: string | null;
}

interface GoalsRankingWidgetProps {
  title: string;
  data: RankItem[];
  loading?: boolean;
}

export function GoalsRankingWidget({
  title,
  data,
  loading,
}: GoalsRankingWidgetProps) {
  if (loading) {
    return (
      <DashboardWidget title={title}>
        <div className="h-[200px] flex items-center justify-center text-gray-400">
          Carregando...
        </div>
      </DashboardWidget>
    );
  }
  return (
    <DashboardWidget title={title}>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">Nenhum dado no período</p>
      ) : (
        <ul className="space-y-2">
          {data.map((item, i) => (
            <li
              key={item.id}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center"
                title={`#${i + 1}`}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <span className="truncate">
                    {item.team_name ?? item.profile_name ?? item.title}
                  </span>
                  <span className="text-gray-600 font-medium">
                    {item.current_value.toLocaleString("pt-BR")} /{" "}
                    {item.target_value.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="h-1.5 mt-0.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, item.progress)}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  );
}
