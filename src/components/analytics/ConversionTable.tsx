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
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-muted-foreground">
            Taxas de Conversão
          </h3>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-muted-foreground">
          Taxas de Conversão
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Proporção sobre Leads Recebidos e sobre Fase Anterior (F.A) no período
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhuma transição registrada ainda.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto max-h-[320px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ETAPA</TableHead>
                  <TableHead className="text-right">Indicadores</TableHead>
                  <TableHead className="text-right">Prop./Lead (%)</TableHead>
                  <TableHead className="text-right">Prop/F.A (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={`${row.stage}-${i}`}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.propLead.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
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
