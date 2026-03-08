import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ConversionRate } from "@/hooks/useSalesAnalytics";

interface ConversionTableProps {
  data: ConversionRate[];
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
          Transições entre estágios (via lead_stage_history)
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
                  <TableHead>De</TableHead>
                  <TableHead>Para</TableHead>
                  <TableHead className="text-right">Transições</TableHead>
                  <TableHead className="text-right">Taxa (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={`${row.fromStage}-${row.toStage}-${i}`}>
                    <TableCell className="font-medium">{row.fromLabel}</TableCell>
                    <TableCell>{row.toLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.count} / {row.totalFrom}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.rate.toFixed(1)}%
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
