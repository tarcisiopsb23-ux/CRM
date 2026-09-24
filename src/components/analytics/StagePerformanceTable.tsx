import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AvgTimePerStage } from "@/hooks/useSalesAnalytics";

interface StagePerformanceTableProps {
  data: AvgTimePerStage[];
  avgTimeToClose: number | null;
  loading?: boolean;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} dias`;
}

export function StagePerformanceTable({
  data,
  avgTimeToClose,
  loading,
}: StagePerformanceTableProps) {
  const filtered = data.filter((d) => d.leadCount > 0);

  if (loading) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Desempenho por Estágio
          </h3>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          Desempenho por Estágio
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Tempo médio em cada estágio
          {avgTimeToClose != null && (
            <> · Tempo médio até fechamento: {formatHours(avgTimeToClose)}</>
          )}
        </p>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sem dados de histórico de estágios.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estágio</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Tempo médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.stage}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.leadCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatHours(row.avgHours)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
