import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { StageConversionMetric } from "@/hooks/useSalesAnalytics";

interface ConversionTableProps {
  data: StageConversionMetric[];
  loading?: boolean;
}

export function ConversionTable({ data, loading }: ConversionTableProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            Taxas de Conversão
          </h3>
        </CardHeader>
        <CardContent className="h-full pt-0 pb-2">
          <div className="flex items-center justify-center text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Taxas de Conversão
        </h3>
        <p className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
          Proporção sobre Leads Recebidos e sobre Fase Anterior (F.A) no período
        </p>
      </CardHeader>
      <CardContent className="h-full pt-0 pb-2">
        {data.length === 0 ? (
          <div className="flex items-center justify-center text-muted-foreground">
            Nenhuma transição registrada ainda.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2">ETAPA</TableHead>
                  <TableHead className="text-right px-2">Indicadores</TableHead>
                  <TableHead className="text-right px-2">Prop./Lead (%)</TableHead>
                  <TableHead className="text-right px-2">Prop/F.A (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={`${row.stage}-${i}`}>
                    <TableCell className="font-medium px-2">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums px-2">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums px-2">
                      {row.propLead.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums px-2">
                      {i === 0 ? "—" : `${row.propFA.toFixed(1)}%`}
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
